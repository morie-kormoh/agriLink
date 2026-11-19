/**
 * Demo data for modules 03–08, created through the real services:
 *  03–05  prices → purchases → maker–checker approval → Smart Split payments → farm records
 *  06–08  Harvest Lock (PIN), a savings group, passport scores, a consent request and a loan application.
 *
 * Run after `pnpm db:seed`:   pnpm --filter @agrilink/web seed:demo
 * Idempotent: each part skips if its data already exists. Demo farmer PIN: 2580.
 */
import path from "node:path";
import { config as loadEnv } from "dotenv";
import type { Role } from "@agrilink/db";
import type { Actor } from "@agrilink/validation/permissions";

loadEnv({ path: path.resolve(import.meta.dirname, "../../../.env"), quiet: true });
process.env.SMS_PROVIDER = "memory"; // don't flood the console with demo SMS
process.env.RATE_LIMIT_STORE = "memory";

const { prisma } = await import("@agrilink/db");
const { setPrice, updateCoopSettings, updateBuyerSettings, createCollectionPoint } =
  await import("../src/server/trade/settings");
const { recordPurchase, acknowledgePurchase } = await import("../src/server/trade/purchases");
const { submitBatch, approveBatch } = await import("../src/server/trade/batches");
const { addRecord } = await import("../src/server/records/service");
const { setPin } = await import("../src/server/auth/pin");
const { openHarvestLock } = await import("../src/server/savings/service");
const { addGroupMember, createGroup, recordContribution } =
  await import("../src/server/savings/groups");
const { computeScore } = await import("../src/server/passport/service");
const { requestConsent } = await import("../src/server/passport/consent");
const { checkEligibility } = await import("../src/server/credit/eligibility");
const { applyForLoan } = await import("../src/server/credit/loans");

async function actorFor(phone: string, role: Role): Promise<Actor> {
  const user = await prisma.user.findUniqueOrThrow({
    where: { phone },
    include: { memberships: { where: { role } } },
  });
  const m = user.memberships[0];
  if (!m) throw new Error(`${phone} has no ${role} membership — run pnpm db:seed first`);
  return { userId: user.id, role, orgId: m.orgId };
}

export const DEMO_PIN = "2580";

async function trade() {
  const coopAdmin = await actorFor("+23276000002", "COOP_ADMIN");
  const coopStaff = await actorFor("+23276000004", "COOP_STAFF");
  const buyerAdmin = await actorFor("+23276000020", "BUYER_ADMIN");
  const buyerStaff = await actorFor("+23276000021", "BUYER_STAFF");

  if (await prisma.purchase.count({ where: { buyerOrgId: coopAdmin.orgId! } })) {
    console.info("Demo trade data already present — skipping trade part.");
    return;
  }
  const crop = async (code: string) =>
    (await prisma.crop.findUniqueOrThrow({ where: { code } })).id;
  const RICE = await crop("RICE");
  const GROUNDNUT = await crop("GROUNDNUT");
  const CASSAVA = await crop("CASSAVA");
  const COCOA = await crop("COCOA");

  // Co-op settings, collection points and prices
  await updateCoopSettings(coopAdmin, {
    duesPct: 2,
    approvalThresholdLe: "20000",
    fundingProvider: "ORANGE_MONEY",
    fundingAccount: "+23276999000",
    mainCrops: ["RICE", "GROUNDNUT"],
  });
  const kamabai = await createCollectionPoint(coopAdmin, {
    name: "Kamabai store",
    community: "Kamabai",
  });
  await createCollectionPoint(coopAdmin, { name: "Makeni depot", community: "Makeni" });
  await setPrice(coopAdmin, { cropId: RICE, priceLe: "4.00" });
  await setPrice(coopAdmin, { cropId: RICE, grade: "A", priceLe: "4.50" });
  await setPrice(coopAdmin, { cropId: GROUNDNUT, priceLe: "6.50" });
  await setPrice(coopAdmin, { cropId: CASSAVA, priceLe: "1.80" });

  // Buyer settings + prices
  await updateBuyerSettings(buyerAdmin, {
    type: "AGGREGATOR",
    crops: ["RICE", "COCOA"],
    approvalThresholdLe: "50000",
    fundingProvider: "AFRIMONEY",
    fundingAccount: "+23277999000",
  });
  await setPrice(buyerAdmin, { cropId: COCOA, priceLe: "28.00" });
  await setPrice(buyerAdmin, { cropId: RICE, priceLe: "4.20" });

  // Co-op purchases: staff weighs, admin approves (maker–checker)
  const bomFarmers = await prisma.farmer.findMany({
    where: { cooperativeId: coopAdmin.orgId!, status: "ACTIVE" },
    orderBy: { agrilinkId: "asc" },
    take: 14,
    include: { plots: { include: { cropCycles: true } } },
  });
  let firstBatch: string | null = null;
  for (const [i, f] of bomFarmers.entries()) {
    const cropId = f.plots[0]?.cropCycles[0]?.cropId ?? RICE;
    const qty = 150 + ((i * 137) % 900);
    const r = await recordPurchase(coopStaff, {
      clientRef: crypto.randomUUID(),
      farmerId: f.id,
      cropId,
      quantity: qty,
      bags: Math.ceil(qty / 50),
      collectionPointId: kamabai.id,
      deductions:
        i % 4 === 0 ? [{ type: "TRANSPORT", amountLe: "50", note: "Truck to Kamabai" }] : [],
    });
    firstBatch ??= r.purchase.batchId;
    if (i === 3)
      await acknowledgePurchase({ farmerId: f.id }, "2", { reason: "Two bags were not counted" });
    else if (i % 3 === 0) await acknowledgePurchase({ farmerId: f.id }, "1");
  }
  if (firstBatch) {
    await submitBatch(coopStaff, firstBatch);
    const res = await approveBatch(coopAdmin, firstBatch);
    console.info(
      `Co-op batch: ${res.approved} paid, ${res.held.length} held (${res.held.map((h) => h.reason).join(", ")})`,
    );
  }
  // A second, still-open batch so the approval flow can be demoed live
  for (const f of bomFarmers.slice(0, 3)) {
    await recordPurchase(coopStaff, {
      farmerId: f.id,
      cropId: RICE,
      grade: "A",
      quantity: 200,
      bags: 4,
      collectionPointId: kamabai.id,
    });
  }

  // Buyer purchases from Kenema cocoa farmers (buyer staff records, buyer admin approves)
  const kenFarmers = await prisma.farmer.findMany({
    where: { agrilinkId: { startsWith: "AP-KEN-" }, status: "ACTIVE" },
    orderBy: { agrilinkId: "asc" },
    take: 5,
  });
  let buyerBatch: string | null = null;
  for (const [i, f] of kenFarmers.entries()) {
    const r = await recordPurchase(buyerStaff, {
      farmerId: f.id,
      cropId: COCOA,
      quantity: 80 + i * 25,
      bags: 2 + i,
    });
    buyerBatch ??= r.purchase.batchId;
  }
  if (buyerBatch) {
    await submitBatch(buyerStaff, buyerBatch);
    const res = await approveBatch(buyerAdmin, buyerBatch);
    console.info(`Buyer batch: ${res.approved} paid`);
  }

  // Farm records for the demo farmer (Aminata, AP-BOM-000001)
  const aminata = await prisma.farmer.findUniqueOrThrow({ where: { agrilinkId: "AP-BOM-000001" } });
  const farmerActor: Actor = {
    userId: aminata.userId!,
    role: "FARMER",
    orgId: null,
    farmerId: aminata.id,
  };
  const day = (d: number) => new Date(Date.now() - d * 24 * 3600 * 1000);
  await addRecord(farmerActor, aminata.id, {
    type: "INPUT_PURCHASE",
    amountLe: "650",
    description: "Rice seed (NERICA)",
    occurredAt: day(40),
  });
  await addRecord(farmerActor, aminata.id, {
    type: "INPUT_PURCHASE",
    amountLe: "900",
    description: "NPK fertiliser",
    occurredAt: day(30),
  });
  await addRecord(coopStaff, aminata.id, {
    type: "LABOUR",
    amountLe: "400",
    description: "Weeding group (5 people)",
    occurredAt: day(20),
  });
  await addRecord(farmerActor, aminata.id, {
    type: "TRANSPORT",
    amountLe: "120",
    occurredAt: day(5),
  });
  await addRecord(farmerActor, aminata.id, {
    type: "HARVEST",
    quantity: 1200,
    cropId: RICE,
    occurredAt: day(6),
  });

  console.info(
    `Demo trade data: ${await prisma.purchase.count()} purchases, ${await prisma.payment.count()} payments, ${await prisma.farmRecord.count()} farm records`,
  );
}

async function finance() {
  if (await prisma.savingsAccount.count()) {
    console.info("Demo savings/credit data already present — skipping finance part.");
    return;
  }
  const coopAdmin = await actorFor("+23276000002", "COOP_ADMIN");
  const coopStaff = await actorFor("+23276000004", "COOP_STAFF");
  const officer = await actorFor("+23276000031", "LENDER_OFFICER");
  const lock = await prisma.savingsProduct.findFirst({
    where: { type: "HARVEST_LOCK", active: true },
  });
  if (!lock) throw new Error("Run pnpm db:seed first (no savings product)");
  const RICE = (await prisma.crop.findUniqueOrThrow({ where: { code: "RICE" } })).id;

  // Demo PINs (farmers normally set their own) and Harvest Lock for five Bombali farmers.
  const farmers = await prisma.farmer.findMany({
    where: { cooperativeId: coopAdmin.orgId!, status: "ACTIVE", userId: { not: null } },
    orderBy: { agrilinkId: "asc" },
    take: 6,
    include: { user: true },
  });
  // Never overwrite a PIN somebody already chose: PIN-confirmed demo steps only run for farmers given the demo PIN here.
  const demoPin = new Set<string>();
  for (const f of farmers) {
    if (!f.user!.pinHash) {
      await setPin(f.userId!, DEMO_PIN);
      demoPin.add(f.id);
    }
  }
  const skipped = farmers.filter((f) => !demoPin.has(f.id)).map((f) => f.agrilinkId);
  if (skipped.length)
    console.info(
      `Kept existing PINs for ${skipped.join(", ")} — open Harvest Lock / apply for loans for them in the app.`,
    );
  for (const [i, f] of farmers.slice(0, 5).entries()) {
    if (!demoPin.has(f.id)) continue;
    await openHarvestLock(
      { userId: f.userId!, role: "FARMER", orgId: null, farmerId: f.id },
      f.id,
      { productId: lock.id, pct: [15, 10, 20, 15, 12][i]!, pin: DEMO_PIN },
    );
  }
  // One more round of sales so savings (and dues) flow through the Smart Split.
  let batch: string | null = null;
  for (const [i, f] of farmers.entries()) {
    const r = await recordPurchase(coopStaff, {
      farmerId: f.id,
      cropId: RICE,
      quantity: 400 + i * 120,
      bags: 8 + i,
    });
    batch ??= r.purchase.batchId;
  }
  if (batch) {
    await submitBatch(coopStaff, batch);
    await approveBatch(coopAdmin, batch);
  }

  // A VSLA group with a few weeks of contributions.
  const start = new Date(Date.now() - 35 * 86_400_000);
  const g = await createGroup(coopAdmin, {
    name: "Masongbo Women's VSLA",
    type: "VSLA",
    contributionLe: "25",
    frequency: "WEEKLY",
    cycleStart: start,
    cycleEnd: new Date(start.getTime() + 52 * 7 * 86_400_000),
  });
  for (const [i, f] of farmers.entries())
    await addGroupMember(coopAdmin, g.id, {
      farmerId: f.id,
      role: i === 0 ? "TREASURER" : "MEMBER",
      payoutOrder: i + 1,
      guarantor: true,
    });
  for (let period = 1; period <= 5; period++) {
    for (const [i, f] of farmers.entries()) {
      if ((i + period) % 4 === 0) continue; // a few missed weeks
      await recordContribution(coopStaff, g.id, {
        farmerId: f.id,
        periodNo: period,
        amountLe: "25",
        method: "CASH_RECORDED",
      });
    }
  }

  for (const f of farmers) await computeScore(f.id, { notify: false });

  // Loan officer asks farmer #2 for consent (pending — accept it in the farmer portal).
  await requestConsent(officer, {
    farmer: farmers[1]!.agrilinkId,
    scope: "PASSPORT_DETAILED",
    purpose: "assess an input loan for the main season",
    durationMonths: 12,
  });

  // Aminata applies for an input loan (waiting in the lender's Applications queue).
  const aminata =
    farmers.find((f) => f.agrilinkId === "AP-BOM-000001" && demoPin.has(f.id)) ??
    farmers.find((f) => demoPin.has(f.id));
  const product = await prisma.loanProduct.findFirst({ where: { active: true } });
  if (product && aminata) {
    const e = await checkEligibility(prisma, aminata.id, product.id, { consentRequired: false });
    if (e.eligible) {
      const amount = Math.min(800, Number(e.limitLe)).toFixed(2);
      await applyForLoan(
        { userId: aminata.userId!, role: "FARMER", orgId: null, farmerId: aminata.id },
        { productId: product.id, amountLe: amount, pin: DEMO_PIN },
      );
      console.info(`Loan application for ${aminata.fullName}: ${amount} (limit ${e.limitLe})`);
    } else {
      console.info(
        `${aminata.fullName} is not eligible yet: ${e.reasons.join(", ")} (band ${e.band})`,
      );
    }
  }
  console.info(
    `Demo finance data: ${await prisma.savingsAccount.count()} savings accounts, ${await prisma.creditScore.count({ where: { isCurrent: true } })} scores, ${await prisma.loan.count()} loans`,
  );
}

async function main() {
  await trade();
  await finance();
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
