import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Prisma, prisma } from "@agrilink/db";
import type { Actor } from "@agrilink/validation/permissions";
import { setPin } from "@/server/auth/pin";
import { saveLoanProduct } from "@/server/credit/products";
import { checkEligibility } from "@/server/credit/eligibility";
import {
  acceptOffer,
  applyForLoan,
  approveLoan,
  cancelLoan,
  getLoan,
  makeOffer,
  runArrearsJob,
} from "@/server/credit/loans";
import { getPortfolio } from "@/server/credit/portfolio";
import { saveDealerItem, saveDealerProfile, setDealerVerified } from "@/server/credit/dealers";
import {
  expireVouchers,
  lookupVoucher,
  redeemVoucher,
  requestRedemptionOtp,
} from "@/server/credit/vouchers";
import { updateInstitution } from "@/server/finance/common";
import { registerFarmer } from "@/server/farmers/service";
import {
  expireConsents,
  requestConsent,
  respondConsent,
  revokeConsent,
} from "@/server/passport/consent";
import { computeScore, getMyPassport, getPassportForLender } from "@/server/passport/service";
import { mockAdapter } from "@/server/payments/adapters";
import { balanceOf } from "@/server/payments/ledger";
import {
  addGroupMember,
  createGroup,
  getGroup,
  recordContribution,
  recordPayout,
} from "@/server/savings/groups";
import {
  createSavingsProduct,
  getSavingsSummary,
  openHarvestLock,
  requestEarlyWithdrawal,
  runScheduledReleases,
  updateAutoSave,
} from "@/server/savings/service";
import { smsOutbox } from "@/server/sms";
import { approveBatch, submitBatch } from "@/server/trade/batches";
import { recordPurchase } from "@/server/trade/purchases";
import { setPrice } from "@/server/trade/settings";
import {
  type Ref,
  addMember,
  ensureReference,
  farmerInput,
  makeOrgWithMember,
  resetDb,
} from "./helpers";

const PIN = "2580";
let ref: Ref;
beforeAll(async () => {
  ref = await ensureReference();
});
beforeEach(async () => {
  await resetDb();
  mockAdapter().reset();
});
afterAll(() => prisma.$disconnect());

async function world() {
  const { org: coop, actor: coopAdmin } = await makeOrgWithMember("COOPERATIVE", "COOP_ADMIN");
  const { actor: staff } = await addMember(coop.id, "COOP_STAFF");
  const { actor: agent } = await addMember(coop.id, "AGENT");
  const reg = await registerFarmer(staff, farmerInput(ref));
  const farmerRow = await prisma.farmer.findUniqueOrThrow({ where: { id: reg.farmer.id } });
  await setPin(farmerRow.userId!, PIN);
  const farmer: Actor = {
    userId: farmerRow.userId!,
    role: "FARMER",
    orgId: null,
    farmerId: farmerRow.id,
  };
  await setPrice(coopAdmin, { cropId: ref.cropId, priceLe: "4.00" });

  const { org: bank, actor: lenderAdmin } = await makeOrgWithMember("LENDER", "LENDER_ADMIN");
  const { actor: officer } = await addMember(bank.id, "LENDER_OFFICER");
  await updateInstitution(lenderAdmin, {
    approvalThresholdLe: "800",
    fundingProvider: "ORANGE_MONEY",
    fundingAccount: "+23276111000",
    collectionAccount: "+23276111001",
    savingsAccount: "+23276111002",
  });
  const lock = await createSavingsProduct(lenderAdmin, {
    name: "Harvest Lock – Rice",
    type: "HARVEST_LOCK",
    defaultPct: 15,
    minPct: 5,
    maxPct: 40,
    releaseRule: "SEASON_START",
    releaseMonthDay: "04-01",
    earlyWithdrawalAllowed: true,
    earlyWithdrawalFeePct: 5,
  });
  return {
    coop,
    coopAdmin,
    staff,
    agent,
    farmer,
    farmerId: farmerRow.id,
    phone: farmerRow.phone,
    bank,
    lenderAdmin,
    officer,
    lock,
  };
}

/** Staff weighs, co-op admin approves → payment runs through the waterfall (mock provider succeeds). */
async function sell(w: Awaited<ReturnType<typeof world>>, quantity = 1000) {
  const r = await recordPurchase(w.staff, { farmerId: w.farmerId, cropId: ref.cropId, quantity });
  await submitBatch(w.staff, r.purchase.batchId);
  await approveBatch(w.coopAdmin, r.purchase.batchId);
  return prisma.payment.findFirstOrThrow({
    where: { purchaseId: r.purchase.id },
    include: { splits: { orderBy: { order: "asc" } } },
  });
}

describe("module 06 — Harvest Lock", () => {
  it("cannot be opened without the farmer's PIN (not even by an agent)", async () => {
    const w = await world();
    await expect(
      openHarvestLock(w.agent, w.farmerId, { productId: w.lock.id, pct: 15, pin: "9999" }),
    ).rejects.toThrow(/Wrong PIN/);
    expect(await prisma.splitRule.count({ where: { farmerId: w.farmerId } })).toBe(0);
    await expect(
      openHarvestLock(w.farmer, w.farmerId, { productId: w.lock.id, pct: 45, pin: PIN }),
    ).rejects.toThrow(/between 5% and 40%/);
    const acc = await openHarvestLock(w.agent, w.farmerId, {
      productId: w.lock.id,
      pct: 15,
      pin: PIN,
    });
    expect(acc.openedVia).toBe("AGENT_ASSISTED");
    expect(acc.lockedUntil?.toISOString().slice(5, 10)).toBe("04-01");
    expect(
      await prisma.splitRule.count({
        where: { farmerId: w.farmerId, type: "SAVINGS", active: true },
      }),
    ).toBe(1);
  });

  it("saves exactly the SAVINGS split, mirrors the ledger, pauses, releases on schedule and allows one early withdrawal", async () => {
    const w = await world();
    const acc = await openHarvestLock(w.farmer, w.farmerId, {
      productId: w.lock.id,
      pct: 15,
      pin: PIN,
    });
    const pay = await sell(w, 1000); // Le 4,000
    const savingsSplit = pay.splits.find((s) => s.type === "SAVINGS")!;
    expect(savingsSplit.amountLe.toFixed(2)).toBe("600.00");
    expect(pay.splits.find((s) => s.type === "FARMER_WALLET")!.amountLe.toFixed(2)).toBe("3400.00");
    let a = await prisma.savingsAccount.findUniqueOrThrow({ where: { id: acc.id } });
    expect(a.balanceLe.toFixed(2)).toBe("600.00");
    expect((await balanceOf(prisma, `SAVINGS:${acc.id}`)).toFixed(2)).toBe("600.00");
    expect(
      smsOutbox().some((m) => m.to === w.phone && m.body.includes("Le 600 saved to Harvest Lock")),
    ).toBe(true);
    const txns = await prisma.savingsTransaction.findMany({ where: { accountId: acc.id } });
    expect(txns).toHaveLength(1);
    // append-only
    await expect(
      prisma.savingsTransaction.update({ where: { id: txns[0]!.id }, data: { note: "x" } }),
    ).rejects.toThrow(/append-only/);

    // Pause → next sale saves nothing.
    await updateAutoSave(w.farmer, acc.id, { paused: true, pin: PIN });
    const pay2 = await sell(w, 500);
    expect(pay2.splits.some((s) => s.type === "SAVINGS")).toBe(false);
    await updateAutoSave(w.farmer, acc.id, { paused: false, pct: 10, pin: PIN });

    // Early withdrawal: fee 5% disclosed, once per season.
    const ew = await requestEarlyWithdrawal(w.farmer, acc.id, { amountLe: "200", pin: PIN });
    expect(ew).toMatchObject({ feeLe: "10.00", netLe: "190.00" });
    a = await prisma.savingsAccount.findUniqueOrThrow({ where: { id: acc.id } });
    expect(a.balanceLe.toFixed(2)).toBe("400.00");
    expect((await balanceOf(prisma, `SAVINGS:${acc.id}`)).toFixed(2)).toBe("400.00");
    await expect(
      requestEarlyWithdrawal(w.farmer, acc.id, { amountLe: "50", pin: PIN }),
    ).rejects.toThrow(/one early withdrawal per season/);

    // Release day: 7-day notice first, then the whole balance goes to the farmer's wallet.
    const release = new Date(a.lockedUntil!);
    const notice = await runScheduledReleases(new Date(release.getTime() - 3 * 86_400_000));
    expect(notice.notices).toBe(1);
    expect((await runScheduledReleases(new Date(release.getTime() - 2 * 86_400_000))).notices).toBe(
      0,
    );
    const r = await runScheduledReleases(new Date(release.getTime() + 3_600_000));
    expect(r.releases).toBe(1);
    a = await prisma.savingsAccount.findUniqueOrThrow({ where: { id: acc.id } });
    expect(a.balanceLe.toFixed(2)).toBe("0.00");
    expect(a.lockedUntil!.getTime()).toBeGreaterThan(release.getTime()); // rolled to next season
    expect((await runScheduledReleases(new Date(release.getTime() + 7_200_000))).releases).toBe(0);
    const summary = await getSavingsSummary(w.farmer, w.farmerId);
    expect(summary.accounts[0]!.transactions.map((t) => t.type).sort()).toEqual([
      "CREDIT_AUTO",
      "EARLY_WITHDRAWAL",
      "FEE",
      "RELEASE",
    ]);
  });
});

describe("module 06 — group savings", () => {
  it("records contributions per period and pays the rotating pot in order", async () => {
    const w = await world();
    const reg2 = await registerFarmer(w.staff, farmerInput(ref, { fullName: "Fatmata Kamara" }));
    const g = await createGroup(w.coopAdmin, {
      name: "Masongbo women",
      type: "OSUSU_ROTATING",
      contributionLe: "50",
      frequency: "MONTHLY",
      cycleStart: new Date(Date.now() - 40 * 86_400_000),
      cycleEnd: new Date(Date.now() + 300 * 86_400_000),
    });
    await addGroupMember(w.coopAdmin, g.id, {
      farmerId: w.farmerId,
      role: "TREASURER",
      payoutOrder: 2,
    });
    await addGroupMember(w.coopAdmin, g.id, { farmerId: reg2.farmer.id, payoutOrder: 1 });
    await expect(
      addGroupMember(w.coopAdmin, g.id, { farmerId: w.farmerId, payoutOrder: 1 }),
    ).rejects.toThrow(/already taken/);
    // The treasurer (a farmer) can keep the books.
    await recordContribution(w.farmer, g.id, {
      farmerId: w.farmerId,
      periodNo: 1,
      amountLe: "50",
      method: "CASH_RECORDED",
    });
    await recordContribution(w.farmer, g.id, {
      farmerId: reg2.farmer.id,
      periodNo: 1,
      amountLe: "50",
      method: "CASH_RECORDED",
    });
    await expect(
      recordContribution(w.farmer, g.id, {
        farmerId: reg2.farmer.id,
        periodNo: 1,
        amountLe: "50",
        method: "CASH_RECORDED",
      }),
    ).rejects.toThrow(/already recorded/);
    const p1 = await recordPayout(w.farmer, g.id, { periodNo: 1, method: "CASH_RECORDED" });
    expect(p1).toMatchObject({ farmerId: reg2.farmer.id });
    expect(p1.amountLe.toFixed(2)).toBe("100.00");
    const view = await getGroup(w.farmer, g.id);
    expect(view.nextPayout?.farmerId).toBe(w.farmerId);
    expect(view.members.find((m) => m.farmerId === w.farmerId)?.farmer.phone).toBeNull(); // members don't see phones
    expect(view.members.find((m) => m.farmerId === w.farmerId)?.totalLe).toBe("50.00");
  });
});

describe("module 07 — passport & consent", () => {
  it("scores reproducibly and a lender sees nothing without the farmer's PIN consent", async () => {
    const w = await world();
    const s1 = await computeScore(w.farmerId);
    const s2 = await computeScore(w.farmerId);
    expect(s2.id).toBe(s1.id); // same inputs → no new row
    expect(s1.score).toBe(27); // identity (tier 2) 7 + co-op 10 + neutral repayment 10
    expect(s1.band).toBe("BUILDING");

    await expect(getPassportForLender(w.officer, w.farmerId)).rejects.toThrow(/consent/);
    const farmer = await prisma.farmer.findUniqueOrThrow({ where: { id: w.farmerId } });
    const req = await requestConsent(w.officer, {
      farmer: farmer.agrilinkId,
      scope: "PASSPORT_DETAILED",
      purpose: "assess a fertiliser loan",
      durationMonths: 12,
    });
    expect(smsOutbox().some((m) => m.to === w.phone && m.body.includes("wants to see"))).toBe(true);
    await expect(getPassportForLender(w.officer, w.farmerId)).rejects.toThrow(/consent/);
    await expect(
      respondConsent(w.farmer, req.request.id, { decision: "GRANT", pin: "1111" }),
    ).rejects.toThrow(/Wrong PIN/);
    await respondConsent(w.farmer, req.request.id, { decision: "GRANT", pin: PIN });

    const view = await getPassportForLender(w.officer, w.farmerId);
    expect(view.score.score).toBe(27);
    expect(view.detail).not.toBeNull();
    expect(view.records).toBeNull(); // RECORDS_FULL not granted
    const mine = await getMyPassport(w.farmer);
    expect(mine.accessLog).toHaveLength(1);
    expect(
      smsOutbox().filter(
        (m) => m.to === w.phone && m.body.includes("viewed your AgriLink passport"),
      ),
    ).toHaveLength(1);

    await revokeConsent(w.farmer, req.request.id, { pin: PIN });
    await expect(getPassportForLender(w.officer, w.farmerId)).rejects.toThrow(/consent/);

    const req2 = await requestConsent(w.officer, {
      farmer: farmer.agrilinkId,
      scope: "PASSPORT_SUMMARY",
      purpose: "monitoring",
      durationMonths: 1,
    });
    await respondConsent(w.farmer, req2.request.id, { decision: "GRANT", pin: PIN });
    await expireConsents(new Date(Date.now() + 40 * 86_400_000));
    await expect(getPassportForLender(w.officer, w.farmerId)).rejects.toThrow(/consent/);
  });
});

describe("module 08 — credit & input vouchers (full cycle)", () => {
  async function creditWorld() {
    const w = await world();
    await openHarvestLock(w.farmer, w.farmerId, { productId: w.lock.id, pct: 15, pin: PIN });
    await sell(w, 1000); // verified sales Le 4,000 → passport FAIR
    const product = await saveLoanProduct(w.lenderAdmin, {
      name: "Rice fertiliser loan",
      minAmountLe: "500",
      firstCycleMaxLe: "1000",
      maxAmountLe: "3000",
      flatFeePct: 10,
      minBand: "FAIR",
      maxDebtToIncomePct: 40,
      maxRepaymentPctPerSale: 50,
      allowedCategories: ["FERTILISER", "SEED"],
    });
    const { org: shop, actor: dealer } = await makeOrgWithMember("AGRO_DEALER", "AGRO_DEALER");
    const { actor: admin } = await makeOrgWithMember("PLATFORM", "SUPER_ADMIN");
    const d = await saveDealerProfile(dealer, {
      districtId: ref.districtId,
      payoutMsisdn: "076555123",
      payoutProvider: "ORANGE_MONEY",
    });
    await setDealerVerified(admin, d.id, true);
    const npk = await saveDealerItem(dealer, {
      name: "NPK 15-15-15 50kg",
      category: "FERTILISER",
      unitPriceLe: "350",
    });
    const seed = await saveDealerItem(dealer, {
      name: "NERICA seed 10kg",
      category: "SEED",
      unitPriceLe: "100",
    });
    const cutlass = await saveDealerItem(dealer, {
      name: "Cutlass",
      category: "TOOLS",
      unitPriceLe: "50",
    });
    return { ...w, product, shop, dealer, dealerId: d.id, admin, npk, seed, cutlass };
  }

  const otpFrom = (phone: string) => {
    const m = [...smsOutbox()]
      .reverse()
      .find((s) => s.to === phone && /give them this code: (\d{6})/.test(s.body));
    return m!.body.match(/give them this code: (\d{6})/)![1]!;
  };

  it("eligibility → PIN application → maker–checker approval → voucher → OTP redemption → dealer settled → harvest repays → score rises", async () => {
    const w = await creditWorld();
    const score0 = await computeScore(w.farmerId);
    expect(score0.band).toBe("FAIR");

    const elig = await checkEligibility(prisma, w.farmerId, w.product.id, {
      consentRequired: false,
    });
    expect(elig).toMatchObject({ eligible: true, limitLe: "1000.00" }); // first loan capped by graduation
    expect(elig.affordability.maxTotalDueLe).toBe("1600.00"); // 40% of Le 4,000 verified sales
    await expect(
      applyForLoan(w.farmer, { productId: w.product.id, amountLe: "1200", pin: PIN }),
    ).rejects.toThrow(/most you can borrow/);
    const loan = await applyForLoan(w.farmer, {
      productId: w.product.id,
      amountLe: "1000",
      pin: PIN,
    });
    expect(loan.status).toBe("APPLIED");
    // Applying shared the passport with the lender (consent recorded with the loan).
    await expect(getPassportForLender(w.officer, w.farmerId)).resolves.toBeTruthy();

    // Above the institution's Le 800 threshold an officer cannot approve; the admin can.
    await expect(approveLoan(w.officer, loan.id)).rejects.toThrow(/lender admin/);
    const approved = await approveLoan(w.lenderAdmin, loan.id);
    expect(approved.status).toBe("DISBURSED");
    expect(approved.totalDueLe?.toFixed(2)).toBe("0.00"); // nothing owed until the voucher is used
    const voucher = approved.voucher!;
    expect(smsOutbox().some((m) => m.to === w.phone && m.body.includes("input voucher"))).toBe(
      true,
    );

    // Dealer: lookup shows first name + initial only; disallowed category is refused.
    const look = await lookupVoucher(w.dealer, voucher.code.toLowerCase());
    expect(look).toMatchObject({ farmerName: "Aminata S.", remainingLe: "1000.00" });
    await expect(
      requestRedemptionOtp(w.dealer, {
        code: voucher.code,
        items: [{ itemId: w.cutlass.id, qty: 1 }],
      }),
    ).rejects.toThrow(/not allowed/);

    // Redemption 1: 2 × NPK = Le 700, confirmed by the farmer's SMS code.
    await requestRedemptionOtp(w.dealer, {
      code: voucher.code,
      items: [{ itemId: w.npk.id, qty: 2 }],
    });
    const otp1 = otpFrom(w.phone);
    await expect(
      redeemVoucher(w.dealer, {
        code: voucher.code,
        items: [{ itemId: w.npk.id, qty: 2 }],
        otp: otp1 === "000000" ? "111111" : "000000",
      }),
    ).rejects.toThrow();
    // (one wrong attempt) then the right one
    await requestRedemptionOtp(w.dealer, {
      code: voucher.code,
      items: [{ itemId: w.npk.id, qty: 2 }],
    });
    const otp2 = otpFrom(w.phone);
    const r1 = await redeemVoucher(w.dealer, {
      code: voucher.code,
      items: [{ itemId: w.npk.id, qty: 2 }],
      otp: otp2,
    });
    // The same code cannot be used twice.
    await expect(
      redeemVoucher(w.dealer, {
        code: voucher.code,
        items: [{ itemId: w.npk.id, qty: 2 }],
        otp: otp2,
      }),
    ).rejects.toThrow(/wrong or has expired/);
    // Over the remaining value is refused before any SMS.
    await expect(
      requestRedemptionOtp(w.dealer, { code: voucher.code, items: [{ itemId: w.npk.id, qty: 1 }] }),
    ).rejects.toThrow(/Only Le 300/);
    await expect(
      requestRedemptionOtp(w.dealer, { code: voucher.code, items: [{ itemId: w.npk.id, qty: 3 }] }),
    ).rejects.toThrow(/Only Le 300/);

    // Dealer settled the same day by the lender; inputs became a verified farm record; loan owes 700 + 70.
    const settled = await prisma.voucherRedemption.findUniqueOrThrow({ where: { id: r1.id } });
    expect(settled.settledAt).not.toBeNull();
    expect((await balanceOf(prisma, `DEALER:${w.dealerId}`)).toFixed(2)).toBe("700.00");
    expect(
      await prisma.farmRecord.count({
        where: {
          sourceRef: `redemption:${r1.id}`,
          verification: "SYSTEM_VERIFIED",
          type: "INPUT_PURCHASE",
        },
      }),
    ).toBe(1);
    let l = await prisma.loan.findUniqueOrThrow({ where: { id: loan.id } });
    expect(l.totalDueLe?.toFixed(2)).toBe("770.00");

    // Redemption 2: 3 × seed = Le 300 → voucher fully used → owes 1,100.
    await requestRedemptionOtp(w.dealer, {
      code: voucher.code,
      items: [{ itemId: w.seed.id, qty: 3 }],
    });
    await redeemVoucher(w.dealer, {
      code: voucher.code,
      items: [{ itemId: w.seed.id, qty: 3 }],
      otp: otpFrom(w.phone),
    });
    const lv = await prisma.loan.findUniqueOrThrow({
      where: { id: loan.id },
      include: { voucher: true },
    });
    expect(lv.totalDueLe?.toFixed(2)).toBe("1100.00");
    expect(lv.voucher?.status).toBe("REDEEMED");

    // Next harvest sale (Le 4,000): loan first (cap 50% → Le 2,000 ≥ Le 1,100 owed), then savings 15% of the rest.
    const pay = await sell(w, 1000);
    const byType = Object.fromEntries(pay.splits.map((s) => [s.type, s.amountLe.toFixed(2)]));
    expect(byType).toEqual({
      LOAN_REPAYMENT: "1100.00",
      SAVINGS: "435.00",
      FARMER_WALLET: "2465.00",
    });
    l = await prisma.loan.findUniqueOrThrow({ where: { id: loan.id } });
    expect(l.status).toBe("REPAID");
    expect(l.repaidLe.toFixed(2)).toBe("1100.00");
    expect((await balanceOf(prisma, `LOAN:${loan.id}`)).toFixed(2)).toBe("1100.00");
    expect(await prisma.splitRule.count({ where: { id: l.splitRuleId!, active: true } })).toBe(0);
    expect(
      smsOutbox().some(
        (m) => m.to === w.phone && m.body.includes("Loan fully repaid! Your new limit is Le 1,500"),
      ),
    ).toBe(true);

    const score1 = await computeScore(w.farmerId);
    expect(score1.score).toBeGreaterThan(score0.score); // on-time repayment + more sales and savings

    const { timeline } = await getLoan(w.lenderAdmin, loan.id);
    expect(timeline.map((e) => e.key)).toEqual([
      "applied",
      "approved",
      "voucher",
      "redeemed",
      "redeemed",
      "repayment",
      "repaid",
    ]);
    const portfolio = await getPortfolio(w.lenderAdmin);
    expect(portfolio.total).toMatchObject({
      loans: 1,
      disbursedLe: "1000.00",
      outstandingLe: "0.00",
    });
  });

  it("repayment never exceeds the product cap and the farmer always keeps 30%", async () => {
    const w = await creditWorld();
    const loan = await applyForLoan(w.farmer, {
      productId: w.product.id,
      amountLe: "1000",
      pin: PIN,
    });
    const ok = await approveLoan(w.lenderAdmin, loan.id);
    await requestRedemptionOtp(w.dealer, {
      code: ok.voucher!.code,
      items: [
        { itemId: w.npk.id, qty: 2 },
        { itemId: w.seed.id, qty: 3 },
      ],
    });
    await redeemVoucher(w.dealer, {
      code: ok.voucher!.code,
      items: [
        { itemId: w.npk.id, qty: 2 },
        { itemId: w.seed.id, qty: 3 },
      ],
      otp: otpFrom(w.phone),
    });
    const pay = await sell(w, 250); // Le 1,000 sale
    const split = Object.fromEntries(pay.splits.map((s) => [s.type, Number(s.amountLe)]));
    expect(split.LOAN_REPAYMENT).toBe(500); // 50% product cap
    expect(split.FARMER_WALLET).toBeGreaterThanOrEqual(300);
    const l = await prisma.loan.findUniqueOrThrow({ where: { id: loan.id } });
    expect(l.status).toBe("REPAYING");
  });

  it("offers need consent, the offer maker cannot approve, cooling-off cancel and voucher expiry owe nothing unused", async () => {
    const w = await creditWorld();
    // No consent yet → lender cannot even offer.
    await expect(
      makeOffer(w.officer, { farmerId: w.farmerId, productId: w.product.id, amountLe: "600" }),
    ).rejects.toThrow(/NO_CONSENT/);
    const farmer = await prisma.farmer.findUniqueOrThrow({ where: { id: w.farmerId } });
    const req = await requestConsent(w.officer, {
      farmer: farmer.agrilinkId,
      scope: "PASSPORT_SUMMARY",
      purpose: "offer an input loan",
      durationMonths: 12,
    });
    await respondConsent(w.farmer, req.request.id, { decision: "GRANT", pin: PIN });
    const offer = await makeOffer(w.officer, {
      farmerId: w.farmerId,
      productId: w.product.id,
      amountLe: "600",
    });
    await expect(approveLoan(w.officer, offer.id)).rejects.toThrow(/approve/); // not accepted yet
    await acceptOffer(w.farmer, offer.id, { pin: PIN });
    await expect(approveLoan(w.officer, offer.id)).rejects.toThrow(/two-person/);
    const ok = await approveLoan(w.lenderAdmin, offer.id);
    // Cooling-off: cancel within 24h while unused → nothing owed, voucher dead, rule off.
    await cancelLoan(w.farmer, offer.id, { pin: PIN });
    const l = await prisma.loan.findUniqueOrThrow({
      where: { id: offer.id },
      include: { voucher: true },
    });
    expect(l.status).toBe("CANCELLED");
    expect(l.voucher?.status).toBe("CANCELLED");
    await expect(lookupVoucher(w.dealer, ok.voucher!.code)).rejects.toThrow(/no longer be used/);

    // A second loan whose voucher expires unused is cancelled automatically.
    const loan2 = await applyForLoan(w.farmer, {
      productId: w.product.id,
      amountLe: "500",
      pin: PIN,
    });
    await approveLoan(w.officer, loan2.id); // below the Le 800 threshold: an officer may approve
    await expireVouchers(new Date(Date.now() + 61 * 86_400_000));
    expect((await prisma.loan.findUniqueOrThrow({ where: { id: loan2.id } })).status).toBe(
      "CANCELLED",
    );
  });

  it("arrears: LATE 14 days after the due date, with one reminder per week", async () => {
    const w = await creditWorld();
    const loan = await applyForLoan(w.farmer, {
      productId: w.product.id,
      amountLe: "500",
      pin: PIN,
    });
    const ok = await approveLoan(w.officer, loan.id);
    await requestRedemptionOtp(w.dealer, {
      code: ok.voucher!.code,
      items: [{ itemId: w.seed.id, qty: 5 }],
    });
    await redeemVoucher(w.dealer, {
      code: ok.voucher!.code,
      items: [{ itemId: w.seed.id, qty: 5 }],
      otp: otpFrom(w.phone),
    });
    const due = (await prisma.loan.findUniqueOrThrow({ where: { id: loan.id } })).dueDate!;
    const at = (d: number) => new Date(due.getTime() + d * 86_400_000);
    expect((await runArrearsJob(at(-5))).reminders).toBe(1);
    expect((await runArrearsJob(at(10))).late).toBe(0);
    expect((await runArrearsJob(at(15))).late).toBe(1);
    expect((await prisma.loan.findUniqueOrThrow({ where: { id: loan.id } })).status).toBe("LATE");
    expect((await runArrearsJob(at(17))).reminders).toBe(0);
    expect((await runArrearsJob(at(23))).reminders).toBe(1);
    const s = await computeScore(w.farmerId, { now: at(23) });
    expect(
      (s.factors as { key: string; points: number }[]).find((f) => f.key === "repayment")!.points,
    ).toBe(5);
    expect(new Prisma.Decimal(1).toNumber()).toBe(1);
  });
});
