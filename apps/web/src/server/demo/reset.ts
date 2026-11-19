import "server-only";
import { Prisma, prisma } from "@agrilink/db";
import type { Actor } from "@agrilink/validation/permissions";
import { audit } from "../audit";
import { setPin } from "../auth/pin";
import { AppError } from "../errors";
import { computeScore } from "../passport/service";
import { SAVINGS_PRIORITY } from "../savings/service";
import { approveBatch, submitBatch } from "../trade/batches";
import { recordPurchase } from "../trade/purchases";
import { getActivePrice } from "../trade/settings";
import { isDemoMode } from "./flags";
import { DEMO_FARMER_PIN, PERSONAS } from "./personas";
import { clearDemoSms } from "./sms-log";

const FARMER_PHONE = PERSONAS.find((p) => p.key === "farmer")!.phone;

async function actorFor(phone: string, role: "COOP_STAFF" | "COOP_ADMIN"): Promise<Actor> {
  const user = await prisma.user.findUnique({ where: { phone } });
  const m = user ? await prisma.membership.findFirst({ where: { userId: user.id, role } }) : null;
  if (!user || !m)
    throw new AppError(
      "VALIDATION",
      `Demo user ${phone} (${role}) is missing — run the seed first.`,
    );
  return { userId: user.id, role, orgId: m.orgId };
}

/**
 * DEMO ONLY: put the demo farmer back to the start of the story (docs/mvp/demo-script.md):
 * Harvest Lock open at 15%, one paid harvest sale (so her passport is "Fair" and she can borrow),
 * no loans, vouchers or consents, PIN 2580.
 *
 * This deletes her payment history, including append-only ledger and savings rows, which the
 * database normally forbids; the guard triggers are switched off only inside this transaction.
 * It refuses to run unless DEMO_MODE=true.
 */
export async function resetDemo(by: Actor | null) {
  if (!isDemoMode()) throw new AppError("FORBIDDEN", "Reset is only available on the demo site.");
  const farmer = await prisma.farmer.findFirst({
    where: { phone: FARMER_PHONE },
    orderBy: { createdAt: "asc" },
  });
  if (!farmer?.userId)
    throw new AppError("VALIDATION", "Demo farmer is missing — run the seed first.");
  const staff = await actorFor("+23276000004", "COOP_STAFF");
  const manager = await actorFor("+23276000002", "COOP_ADMIN");
  const lock = await prisma.savingsProduct.findFirst({
    where: { type: "HARVEST_LOCK", active: true },
  });
  const rice = await prisma.crop.findUnique({ where: { code: "RICE" } });
  if (!lock || !rice)
    throw new AppError(
      "VALIDATION",
      "Demo savings product or crop is missing — run the seed first.",
    );
  const fid = farmer.id;

  await prisma.$transaction(
    async (tx) => {
      await tx.$executeRawUnsafe(`ALTER TABLE "LedgerEntry" DISABLE TRIGGER ledger_immutable`);
      await tx.$executeRawUnsafe(
        `ALTER TABLE "SavingsTransaction" DISABLE TRIGGER "SavingsTransaction_append_only"`,
      );

      const loans = (
        await tx.loan.findMany({ where: { farmerId: fid }, select: { id: true } })
      ).map((l) => l.id);
      const accounts = (
        await tx.savingsAccount.findMany({ where: { farmerId: fid }, select: { id: true } })
      ).map((a) => a.id);
      const payments = (
        await tx.payment.findMany({ where: { farmerId: fid }, select: { id: true } })
      ).map((p) => p.id);
      const purchases = (
        await tx.purchase.findMany({ where: { farmerId: fid }, select: { id: true } })
      ).map((p) => p.id);

      // Ledger: whole journals that touch her payments, loans or savings (keeps every other journal balanced).
      const codes = [...loans.map((id) => `LOAN:${id}`), ...accounts.map((id) => `SAVINGS:${id}`)];
      const touched = await tx.ledgerEntry.findMany({
        where: { OR: [{ paymentId: { in: payments } }, { account: { code: { in: codes } } }] },
        select: { journalId: true },
        distinct: ["journalId"],
      });
      await tx.ledgerEntry.deleteMany({
        where: { journalId: { in: touched.map((t) => t.journalId) } },
      });

      await tx.voucherRedemption.deleteMany({ where: { voucher: { farmerId: fid } } });
      await tx.inputVoucher.deleteMany({ where: { farmerId: fid } });
      await tx.loanRepayment.deleteMany({ where: { loanId: { in: loans } } });
      await tx.loan.deleteMany({ where: { farmerId: fid } });
      await tx.splitRule.deleteMany({ where: { farmerId: fid, type: "LOAN_REPAYMENT" } });

      await tx.savingsTransaction.deleteMany({ where: { accountId: { in: accounts } } });
      await tx.payment.deleteMany({ where: { id: { in: payments } } });
      await tx.farmRecord.deleteMany({
        where: {
          farmerId: fid,
          OR: [
            { sourceRef: { in: purchases.map((id) => `purchase:${id}`) } },
            { source: "AUTO_VOUCHER" },
          ],
        },
      });
      await tx.purchase.deleteMany({ where: { id: { in: purchases } } });
      await tx.purchaseBatch.deleteMany({
        where: { ownerOrgId: staff.orgId!, purchases: { none: {} } },
      });

      await tx.consentRequest.deleteMany({ where: { farmerId: fid } });
      await tx.creditScore.deleteMany({ where: { farmerId: fid } });

      // Harvest Lock open at 15%, empty, active.
      let acc = await tx.savingsAccount.findUnique({
        where: { farmerId_productId: { farmerId: fid, productId: lock.id } },
      });
      if (!acc) {
        acc = await tx.savingsAccount.create({
          data: {
            ref: `SAV-DEMO-${fid.slice(-6)}`,
            farmerId: fid,
            productId: lock.id,
            openedVia: "APP",
          },
        });
      }
      await tx.splitRule.deleteMany({ where: { farmerId: fid, type: "SAVINGS" } });
      const rule = await tx.splitRule.create({
        data: {
          farmerId: fid,
          type: "SAVINGS",
          priority: SAVINGS_PRIORITY,
          mode: "PERCENT",
          value: new Prisma.Decimal(15),
          ofGross: false,
          targetType: "SAVINGS_ACCOUNT",
          targetId: acc.id,
          consentRef: "DEMO_RESET",
        },
      });
      await tx.savingsAccount.updateMany({
        where: { farmerId: fid },
        data: { balanceLe: 0, earlyWithdrawalSeason: null, releaseNoticeFor: null },
      });
      await tx.savingsAccount.update({
        where: { id: acc.id },
        data: {
          status: "ACTIVE",
          autoSavePct: 15,
          autoSavePaused: false,
          splitRuleId: rule.id,
          lockedUntil: acc.lockedUntil ?? new Date(Date.UTC(new Date().getUTCFullYear() + 1, 3, 1)),
        },
      });

      await tx.$executeRawUnsafe(`ALTER TABLE "LedgerEntry" ENABLE TRIGGER ledger_immutable`);
      await tx.$executeRawUnsafe(
        `ALTER TABLE "SavingsTransaction" ENABLE TRIGGER "SavingsTransaction_append_only"`,
      );
    },
    { timeout: 60_000 },
  );

  // The demo PIN is always 2580 (presenters may have changed it while rehearsing).
  await prisma.user.update({
    where: { id: farmer.userId },
    data: { pinHash: null, pinFailedCount: 0, pinLockedUntil: null },
  });
  await setPin(farmer.userId, DEMO_FARMER_PIN);

  // One paid harvest sale through the real services: Le 4,000 → 15% saved, passport "Fair".
  // Use the co-op's rice price if one is set (pnpm seed:demo sets Le 4.00), otherwise Le 4.00.
  const listPrice = await getActivePrice(prisma, staff.orgId!, rice.id, null);
  const r = await recordPurchase(staff, {
    farmerId: fid,
    cropId: rice.id,
    quantity: 1000,
    bags: 20,
    unitPriceLe: listPrice ? null : "4.00",
  });
  await submitBatch(staff, r.purchase.batchId);
  await approveBatch(manager, r.purchase.batchId);
  const score = await computeScore(fid, { notify: false });

  await clearDemoSms();
  await prisma.$transaction((tx) =>
    audit(tx, {
      actor: by,
      action: "demo.reset",
      entity: "Farmer",
      entityId: fid,
      after: { score: score.score, band: score.band },
    }),
  );
  return { farmer: farmer.fullName, score: score.score, band: score.band };
}
