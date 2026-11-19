import "server-only";
import { type Db, Prisma } from "@agrilink/db";
import {
  type Eligibility,
  affordability,
  eligibility,
  graduationLimit,
  type Affordability,
} from "@agrilink/finance";
import { hasConsent } from "../passport/service";
import { currentScore } from "../passport/service";
import { getActivePrice } from "../trade/settings";

export interface EligibilityReport extends Eligibility {
  productId: string;
  score: number | null;
  band: string | null;
  graduationLimitLe: string;
  affordability: Affordability;
  minAmountLe: string;
  maxAmountLe: string;
}

const ACTIVE = [
  "APPLIED",
  "OFFERED",
  "ACCEPTED",
  "APPROVED",
  "DISBURSED",
  "REPAYING",
  "LATE",
  "RESTRUCTURED",
] as const;

/**
 * Load everything the responsible-lending rules need and evaluate them (pure rules in @agrilink/finance).
 * `consentRequired`: lender-originated offers need prior consent; a farmer's own application grants it.
 */
export async function checkEligibility(
  db: Db,
  farmerId: string,
  productId: string,
  opts: { consentRequired: boolean; excludeLoanId?: string },
): Promise<EligibilityReport> {
  const [product, farmer] = await Promise.all([
    db.loanProduct.findUniqueOrThrow({ where: { id: productId } }),
    db.farmer.findUniqueOrThrow({
      where: { id: farmerId },
      include: {
        wallets: { where: { isPrimary: true } },
        plots: { include: { cropCycles: { orderBy: { createdAt: "desc" } } } },
        groupMemberships: { select: { id: true } },
      },
    }),
  ]);
  const yearAgo = new Date(Date.now() - 365 * 86_400_000);
  const [score, consent, loans, sales, purchaseCrops] = await Promise.all([
    currentScore(db, farmerId),
    hasConsent(db, product.lenderOrgId, farmerId),
    db.loan.findMany({
      where: { farmerId, ...(opts.excludeLoanId ? { id: { not: opts.excludeLoanId } } : {}) },
      select: { status: true, lenderOrgId: true, lateAt: true },
    }),
    db.purchase.aggregate({
      where: { farmerId, status: "PAID", recordedAt: { gte: yearAgo } },
      _sum: { netLe: true },
    }),
    db.purchase.findMany({ where: { farmerId }, select: { cropId: true }, distinct: ["cropId"] }),
  ]);

  const cycles = farmer.plots.flatMap((p) => p.cropCycles);
  const farmerCropIds = [
    ...new Set([...cycles.map((c) => c.cropId), ...purchaseCrops.map((p) => p.cropId)]),
  ];
  // Projection: the most recent cycle with an expected yield, valued at the co-op's current price.
  const projected = cycles.find(
    (c) => c.expectedYieldKg && (!product.cropIds.length || product.cropIds.includes(c.cropId)),
  );
  const price =
    projected && farmer.cooperativeId
      ? await getActivePrice(db, farmer.cooperativeId, projected.cropId, null)
      : null;
  const afford = affordability({
    verifiedSalesLe: (sales._sum.netLe ?? new Prisma.Decimal(0)).toFixed(2),
    expectedYieldKg: projected?.expectedYieldKg?.toString() ?? null,
    pricePerKgLe: price?.priceLe.toString() ?? null,
    maxDebtToIncomePct: product.maxDebtToIncomePct.toString(),
    flatFeePct: product.flatFeePct.toString(),
  });
  const onTimeCycles = loans.filter(
    (l) => l.lenderOrgId === product.lenderOrgId && l.status === "REPAID" && !l.lateAt,
  ).length;
  const gradLimit = graduationLimit({
    firstCycleMaxLe: product.firstCycleMaxLe.toString(),
    maxAmountLe: product.maxAmountLe.toString(),
    graduationPct: product.graduationPct.toString(),
    onTimeCycles,
  });
  const result = eligibility({
    productActive: product.active,
    minBand: product.minBand,
    band: score?.band ?? null,
    hasConsent: consent,
    consentRequired: opts.consentRequired,
    hasActiveLoan: loans.some((l) => (ACTIVE as readonly string[]).includes(l.status)),
    hasDefaultedLoan: loans.some((l) => l.status === "DEFAULTED" || l.status === "WRITTEN_OFF"),
    productCropIds: product.cropIds,
    farmerCropIds,
    productDistrictIds: product.districtIds,
    farmerDistrictId: farmer.districtId,
    hasWallet: farmer.wallets.length > 0,
    requiresGroup: product.requiresGroupGuarantee,
    inSavingsGroup: farmer.groupMemberships.length > 0,
    minAmountLe: product.minAmountLe.toString(),
    graduationLimitLe: gradLimit,
    affordablePrincipalLe: Prisma.Decimal.min(afford.maxPrincipalLe, product.maxAmountLe).toFixed(
      2,
    ),
  });
  return {
    ...result,
    productId,
    score: score?.score ?? null,
    band: score?.band ?? null,
    graduationLimitLe: gradLimit,
    affordability: afford,
    minAmountLe: product.minAmountLe.toFixed(2),
    maxAmountLe: product.maxAmountLe.toFixed(2),
  };
}
