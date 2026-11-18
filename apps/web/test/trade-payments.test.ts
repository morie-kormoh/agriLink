import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Prisma, prisma } from "@agripay/db";
import type { Actor } from "@agripay/validation/permissions";
import { mockAdapter } from "@/server/payments/adapters";
import { balanceOf } from "@/server/payments/ledger";
import {
  createPaymentForPurchase,
  farmerStatement,
  handleProviderCallback,
  markInstructionFailed,
  processDueInstructions,
  reconcile,
  retryInstruction,
} from "@/server/payments/service";
import { approveBatch, approvePurchase, submitBatch } from "@/server/trade/batches";
import {
  acknowledgePurchase,
  cancelPurchase,
  computePurchaseAmounts,
  findFarmersForPurchase,
  recordPurchase,
  resolveDispute,
} from "@/server/trade/purchases";
import { setPrice, updateCoopSettings } from "@/server/trade/settings";
import { registerFarmer } from "@/server/farmers/service";
import { smsOutbox } from "@/server/sms";
import {
  type Ref,
  addMember,
  ensureReference,
  farmerInput,
  makeOrgWithMember,
  resetDb,
} from "./helpers";

let ref: Ref;
beforeAll(async () => {
  ref = await ensureReference();
});
beforeEach(async () => {
  await resetDb();
  mockAdapter().reset();
});
afterAll(() => prisma.$disconnect());

/** A co-op with: admin A (sets prices, approves), admin B (second approver), staff (records), and one member farmer. */
async function coopSetup(
  opts: { walletPhone?: string; farmerOverrides?: Record<string, unknown> } = {},
) {
  const { org, actor: adminA } = await makeOrgWithMember("COOPERATIVE", "COOP_ADMIN");
  const { actor: adminB } = await addMember(org.id, "COOP_ADMIN");
  const { actor: staff } = await addMember(org.id, "COOP_STAFF");
  const reg = await registerFarmer(
    staff,
    farmerInput(ref, {
      ...(opts.walletPhone ? { phone: opts.walletPhone } : {}),
      ...opts.farmerOverrides,
    }),
  );
  await setPrice(adminA, { cropId: ref.cropId, priceLe: "4.00" });
  return { org, adminA, adminB, staff, farmerId: reg.farmer.id };
}

async function recordAndSubmit(
  staff: Actor,
  farmerId: string,
  quantity = 1000,
  extra: Record<string, unknown> = {},
) {
  const r = await recordPurchase(staff, { farmerId, cropId: ref.cropId, quantity, ...extra });
  await submitBatch(staff, r.purchase.batchId);
  return r;
}

describe("purchase amounts", () => {
  it("computes gross, deductions and net with decimals", () => {
    const a = computePurchaseAmounts(1234.5, "3.33", [{ amountLe: "10.10" }, { amountLe: "5" }]);
    expect(a.grossLe.toFixed(2)).toBe("4110.89");
    expect(a.deductionsLe.toFixed(2)).toBe("15.10");
    expect(a.netLe.toFixed(2)).toBe("4095.79");
  });
});

describe("recording purchases", () => {
  it("uses the price list, sends the farmer an SMS receipt and creates a verified SALE record", async () => {
    const { staff, farmerId } = await coopSetup();
    const r = await recordPurchase(staff, {
      farmerId,
      cropId: ref.cropId,
      quantity: 1000,
      bags: 20,
      deductions: [{ type: "TRANSPORT", amountLe: "100" }],
    });
    expect(r.purchase).toMatchObject({ grossLe: "4000.00", netLe: "3900.00", status: "RECORDED" });
    expect(r.purchase.id).toBeTruthy();
    const farmer = await prisma.farmer.findUniqueOrThrow({ where: { id: farmerId } });
    expect(
      smsOutbox().some((m) => m.to === farmer.phone && m.body.includes("Reply 1 to confirm")),
    ).toBe(true);
    const sale = await prisma.farmRecord.findUniqueOrThrow({
      where: { sourceRef: `purchase:${r.purchase.id}` },
    });
    expect(sale).toMatchObject({
      type: "SALE",
      verification: "SYSTEM_VERIFIED",
      source: "AUTO_PURCHASE",
    });
    expect(sale.amountLe?.toFixed(2)).toBe("3900.00");
  });

  it("requires a reason to change the listed price and records the override", async () => {
    const { staff, farmerId } = await coopSetup();
    await expect(
      recordPurchase(staff, { farmerId, cropId: ref.cropId, quantity: 10, unitPriceLe: "5" }),
    ).rejects.toThrow(/reason/);
    const r = await recordPurchase(staff, {
      farmerId,
      cropId: ref.cropId,
      quantity: 10,
      unitPriceLe: "5",
      priceOverrideReason: "Grade A premium",
    });
    const p = await prisma.purchase.findUniqueOrThrow({ where: { id: r.purchase.id } });
    expect(p.priceOverrideReason).toBe("Grade A premium");
    expect(r.warnings).toContain("PRICE_OVERRIDDEN");
  });

  it("is idempotent on clientRef and rejects non-members and deductions above value", async () => {
    const { staff, farmerId } = await coopSetup();
    const clientRef = crypto.randomUUID();
    const a = await recordPurchase(staff, { farmerId, cropId: ref.cropId, quantity: 5, clientRef });
    const b = await recordPurchase(staff, { farmerId, cropId: ref.cropId, quantity: 5, clientRef });
    expect(b).toMatchObject({ created: false, purchase: { id: a.purchase.id } });

    const other = await makeOrgWithMember("COOPERATIVE", "COOP_STAFF");
    await expect(
      recordPurchase(other.actor, { farmerId, cropId: ref.cropId, quantity: 5 }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      recordPurchase(staff, {
        farmerId,
        cropId: ref.cropId,
        quantity: 1,
        deductions: [{ type: "OTHER", amountLe: "10" }],
      }),
    ).rejects.toThrow(/Deductions/);
  });

  it("buyers find farmers only by exact AgriPay ID or phone, and can buy from them", async () => {
    const { farmerId } = await coopSetup();
    const farmer = await prisma.farmer.findUniqueOrThrow({ where: { id: farmerId } });
    const { actor: buyerAdmin } = await makeOrgWithMember("BUYER", "BUYER_ADMIN");
    expect(await findFarmersForPurchase(buyerAdmin, "Aminata")).toHaveLength(0);
    const hit = await findFarmersForPurchase(buyerAdmin, farmer.agripayId.toLowerCase());
    expect(hit).toHaveLength(1);
    expect(hit[0]?.phone).toContain("***");
    await setPrice(buyerAdmin, { cropId: ref.cropId, priceLe: "4.50" });
    const r = await recordPurchase(buyerAdmin, { farmerId, cropId: ref.cropId, quantity: 100 });
    expect(r.purchase.grossLe).toBe("450.00");
  });
});

describe("approval & payment (maker–checker)", () => {
  it("pays approved purchases through the mock provider, posts a balanced ledger and texts a receipt", async () => {
    const { org, adminA, adminB, staff, farmerId } = await coopSetup();
    await updateCoopSettings(adminA, { duesPct: 2 });
    const r = await recordAndSubmit(staff, farmerId);

    await expect(approveBatch(staff, r.purchase.batchId)).rejects.toMatchObject({
      code: "FORBIDDEN",
    }); // staff can't approve
    const res = await approveBatch(adminB, r.purchase.batchId);
    expect(res).toMatchObject({ approved: 1, held: [] });

    const payment = await prisma.payment.findFirstOrThrow({
      where: { purchaseId: r.purchase.id },
      include: { splits: { orderBy: { order: "asc" } } },
    });
    expect(payment.status).toBe("SUCCESS");
    expect(payment.splits.map((s) => [s.type, s.amountLe.toFixed(2), s.status])).toEqual([
      ["COOP_DUES", "80.00", "SUCCESS"],
      ["FARMER_WALLET", "3920.00", "SUCCESS"],
    ]);
    const purchase = await prisma.purchase.findUniqueOrThrow({ where: { id: r.purchase.id } });
    expect(purchase.status).toBe("PAID");
    expect(
      (await prisma.purchaseBatch.findUniqueOrThrow({ where: { id: r.purchase.batchId } })).status,
    ).toBe("APPROVED");

    const farmer = await prisma.farmer.findUniqueOrThrow({ where: { id: farmerId } });
    expect((await balanceOf(prisma, `FARMER:${farmer.agripayId}:WALLET`)).toFixed(2)).toBe(
      "3920.00",
    );
    expect((await balanceOf(prisma, `ORG:${org.id}:DUES`)).toFixed(2)).toBe("80.00");
    expect((await balanceOf(prisma, `ORG:${org.id}:FUNDING`)).toFixed(2)).toBe("-4000.00");
    const receipts = smsOutbox().filter(
      (m) => m.to === farmer.phone && m.body.includes(payment.ref),
    );
    expect(receipts).toHaveLength(1);
    expect(receipts[0]?.body).toContain("Co-op dues Le 80, You Le 3,920");

    const statement = await farmerStatement(adminA, farmerId);
    expect(statement.totalReceivedLe).toBe("3920.00");
  });

  it("the person who created or submitted a batch cannot approve it", async () => {
    const { adminA, farmerId } = await coopSetup();
    const r = await recordAndSubmit(adminA, farmerId);
    await expect(approveBatch(adminA, r.purchase.batchId)).rejects.toThrow(/maker–checker/);
  });

  it("holds disputed, over-threshold and wallet-less purchases", async () => {
    const { adminA, adminB, staff, farmerId } = await coopSetup();
    await updateCoopSettings(adminA, { approvalThresholdLe: "5000" });
    const noWallet = await registerFarmer(
      staff,
      farmerInput(ref, { fullName: "No Wallet Farmer", gender: "MALE", walletProvider: null }),
    );
    const disputedFarmer = await registerFarmer(
      staff,
      farmerInput(ref, { fullName: "Dispute Farmer", gender: "MALE" }),
    );

    const small = await recordPurchase(staff, { farmerId, cropId: ref.cropId, quantity: 100 });
    const big = await recordPurchase(staff, { farmerId, cropId: ref.cropId, quantity: 2000 }); // Le 8,000 > 5,000
    await recordPurchase(staff, {
      farmerId: noWallet.farmer.id,
      cropId: ref.cropId,
      quantity: 100,
    });
    const disputed = await recordPurchase(staff, {
      farmerId: disputedFarmer.farmer.id,
      cropId: ref.cropId,
      quantity: 100,
    });
    await acknowledgePurchase({ farmerId: disputedFarmer.farmer.id }, "2", {
      reason: "Weight was wrong",
    });
    await submitBatch(staff, small.purchase.batchId);

    const res = await approveBatch(adminB, small.purchase.batchId);
    expect(res.approved).toBe(1);
    expect(res.held.map((h) => h.reason).sort()).toEqual([
      "DISPUTED",
      "NO_WALLET",
      "OVER_THRESHOLD",
    ]);
    expect(
      (await prisma.purchaseBatch.findUniqueOrThrow({ where: { id: small.purchase.batchId } }))
        .status,
    ).toBe("SUBMITTED");

    // Large purchase approved on its own by a second person
    await approvePurchase(adminB, big.purchase.id);
    expect(
      (await prisma.purchase.findUniqueOrThrow({ where: { id: big.purchase.id } })).status,
    ).toBe("PAID");

    // Dispute rejected → back to RECORDED → payable
    await resolveDispute(adminA, disputed.purchase.id, "REJECT", "Re-weighed, weight confirmed");
    expect(
      (await prisma.purchase.findUniqueOrThrow({ where: { id: disputed.purchase.id } })).status,
    ).toBe("RECORDED");
    await approvePurchase(adminB, disputed.purchase.id);
    expect(
      (await prisma.purchase.findUniqueOrThrow({ where: { id: disputed.purchase.id } })).status,
    ).toBe("PAID");
  });

  it("farmer confirmation by SMS reply and dispute upheld cancels the purchase and its SALE record", async () => {
    const { adminA, staff, farmerId } = await coopSetup();
    const farmer = await prisma.farmer.findUniqueOrThrow({ where: { id: farmerId } });
    const a = await recordPurchase(staff, { farmerId, cropId: ref.cropId, quantity: 10 });
    expect(await acknowledgePurchase({ phone: farmer.phone }, "1")).toMatchObject({
      ref: a.purchase.ref,
      result: "CONFIRMED",
    });
    const b = await recordPurchase(staff, { farmerId, cropId: ref.cropId, quantity: 20 });
    expect(
      await acknowledgePurchase({ phone: farmer.phone }, "2", {
        reason: "Price lower than agreed",
      }),
    ).toMatchObject({ ref: b.purchase.ref, result: "DISPUTED", frozen: true });
    await resolveDispute(adminA, b.purchase.id, "UPHOLD", "Agreed, cancel and re-record");
    expect((await prisma.purchase.findUniqueOrThrow({ where: { id: b.purchase.id } })).status).toBe(
      "CANCELLED",
    );
    expect(
      await prisma.farmRecord.count({ where: { sourceRef: `purchase:${b.purchase.id}` } }),
    ).toBe(0);
  });

  it("cancels unpaid purchases only", async () => {
    const { adminB, staff, farmerId } = await coopSetup();
    const r = await recordAndSubmit(staff, farmerId);
    await approveBatch(adminB, r.purchase.batchId);
    await expect(cancelPurchase(adminB, r.purchase.id, "Mistake")).rejects.toMatchObject({
      code: "CONFLICT",
    });
    const r2 = await recordPurchase(staff, { farmerId, cropId: ref.cropId, quantity: 1 });
    await cancelPurchase(staff, r2.purchase.id, "Wrong farmer");
    expect(
      (await prisma.purchase.findUniqueOrThrow({ where: { id: r2.purchase.id } })).status,
    ).toBe("CANCELLED");
  });

  it("creating a payment twice for the same purchase returns the same payment", async () => {
    const { adminB, staff, farmerId } = await coopSetup();
    const r = await recordPurchase(staff, { farmerId, cropId: ref.cropId, quantity: 10 });
    const [p1, p2] = await prisma.$transaction(async (tx) => [
      await createPaymentForPurchase(tx, r.purchase.id, adminB.userId),
      await createPaymentForPurchase(tx, r.purchase.id, adminB.userId),
    ]);
    expect(p1.id).toBe(p2.id);
  });
});

describe("provider failures, retries, polling and callbacks", () => {
  async function makePayment(walletSuffix: string) {
    const phone = `+2327766${walletSuffix.padStart(4, "0")}`;
    const s = await coopSetup({ walletPhone: phone });
    const r = await recordAndSubmit(s.staff, s.farmerId, 100);
    await approveBatch(s.adminB, r.purchase.batchId);
    const payment = await prisma.payment.findFirstOrThrow({ where: { purchaseId: r.purchase.id } });
    return { ...s, purchaseId: r.purchase.id, payment };
  }
  const makeDue = () =>
    prisma.providerInstruction.updateMany({ data: { nextAttemptAt: new Date(Date.now() - 1000) } });

  it("retries temporary failures with backoff until they succeed (…999)", async () => {
    const { payment, purchaseId } = await makePayment("1999");
    let inst = await prisma.providerInstruction.findFirstOrThrow({
      where: { split: { paymentId: payment.id } },
    });
    expect(inst).toMatchObject({ status: "PENDING", attempts: 1 });
    expect(inst.nextAttemptAt.getTime()).toBeGreaterThan(Date.now() + 30_000);
    expect((await prisma.purchase.findUniqueOrThrow({ where: { id: purchaseId } })).status).toBe(
      "PAYMENT_PENDING",
    );

    await processDueInstructions(); // not due yet → nothing happens
    expect(
      (await prisma.providerInstruction.findUniqueOrThrow({ where: { id: inst.id } })).attempts,
    ).toBe(1);

    await makeDue();
    await processDueInstructions(); // attempt 2 fails
    await makeDue();
    await processDueInstructions(); // attempt 3 succeeds
    inst = await prisma.providerInstruction.findUniqueOrThrow({ where: { id: inst.id } });
    expect(inst).toMatchObject({ status: "SUCCESS", attempts: 3 });
    expect((await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } })).status).toBe(
      "SUCCESS",
    );
    expect((await prisma.purchase.findUniqueOrThrow({ where: { id: purchaseId } })).status).toBe(
      "PAID",
    );
    expect(await prisma.ledgerEntry.count({ where: { paymentId: payment.id } })).toBe(2);
  });

  it("marks permanent failures, lets an admin retry or close them (…998)", async () => {
    const { payment, purchaseId } = await makePayment("1998");
    const inst = await prisma.providerInstruction.findFirstOrThrow({
      where: { split: { paymentId: payment.id } },
    });
    expect(inst).toMatchObject({ status: "FAILED", retryable: false });
    expect((await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } })).status).toBe(
      "FAILED",
    );
    expect((await prisma.purchase.findUniqueOrThrow({ where: { id: purchaseId } })).status).toBe(
      "PAYMENT_FAILED",
    );

    const { actor: admin } = await makeOrgWithMember("PLATFORM", "SUPER_ADMIN");
    await retryInstruction(admin, inst.id);
    expect(
      (await prisma.providerInstruction.findUniqueOrThrow({ where: { id: inst.id } })).status,
    ).toBe("FAILED");
    await expect(markInstructionFailed(admin, inst.id, "x")).rejects.toMatchObject({
      code: "CONFLICT",
    });
    await expect(retryInstruction({ ...admin, role: "COOP_ADMIN" }, inst.id)).rejects.toMatchObject(
      { code: "FORBIDDEN" },
    );
  });

  it("polls pending transfers for their final status (…997)", async () => {
    const { payment } = await makePayment("1997");
    expect((await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } })).status).toBe(
      "PROCESSING",
    );
    await makeDue();
    await processDueInstructions();
    expect((await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } })).status).toBe(
      "SUCCESS",
    );
  });

  it("accepts signed callbacks once and ignores replays", async () => {
    const { payment } = await makePayment("1997");
    const inst = await prisma.providerInstruction.findFirstOrThrow({
      where: { split: { paymentId: payment.id } },
    });
    const body = JSON.stringify({
      idempotencyKey: inst.idempotencyKey,
      providerRef: inst.providerRef,
      status: "SUCCESS",
    });
    await expect(
      handleProviderCallback("MOCK", { "x-mock-signature": "forged" }, body),
    ).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    const sig = mockAdapter().sign(body);
    expect(await handleProviderCallback("MOCK", { "x-mock-signature": sig }, body)).toEqual({
      ok: true,
    });
    expect(await handleProviderCallback("MOCK", { "x-mock-signature": sig }, body)).toEqual({
      ok: true,
    });
    expect(await prisma.ledgerEntry.count({ where: { paymentId: payment.id } })).toBe(2); // posted once
    expect(await prisma.providerCallback.count()).toBe(3); // all stored as evidence
  });

  it("reconciles a provider statement", async () => {
    const { payment } = await makePayment("1234");
    const inst = await prisma.providerInstruction.findFirstOrThrow({
      where: { split: { paymentId: payment.id } },
    });
    const { actor: admin } = await makeOrgWithMember("PLATFORM", "SUPER_ADMIN");
    const { report } = await reconcile(
      admin,
      "MOCK",
      [
        {
          providerRef: inst.providerRef!,
          amountLe: inst.amountLe.toFixed(2),
          status: "Successful",
        },
        { providerRef: "UNKNOWN-1", amountLe: "50", status: "Successful" },
      ],
      new Date(Date.now() - 3600_000),
      new Date(Date.now() + 3600_000),
    );
    expect(report.matched).toEqual([inst.providerRef]);
    expect(report.unknown).toHaveLength(1);
    expect(report.missing).toHaveLength(0);
  });

  it("the ledger refuses unbalanced journals and edits", async () => {
    await makePayment("1234");
    await expect(prisma.ledgerEntry.updateMany({ data: { memo: "x" } })).rejects.toThrow(
      /append-only/,
    );
    const acc = await prisma.ledgerAccount.findFirstOrThrow();
    await expect(
      prisma.ledgerEntry.create({
        data: { journalId: "lonely", accountId: acc.id, debitLe: new Prisma.Decimal(1) },
      }),
    ).rejects.toThrow(/unbalanced/);
  });
});
