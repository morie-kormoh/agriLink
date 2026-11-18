import "server-only";
import { type Db, prisma } from "@agripay/db";
import {
  institutionSettingsSchema,
  normalizeSlPhone,
  type InstitutionSettingsInput,
} from "@agripay/validation";
import { type Actor, can } from "@agripay/validation/permissions";
import { audit } from "../audit";
import { verifyPinForUser } from "../auth/pin";
import { AppError, forbidden, notFound } from "../errors";
import { farmerScope } from "../farmers/scope";

/**
 * Confirm a financial decision with the FARMER's own PIN — also when an agent is helping on their device.
 * Wrong PINs count towards the normal 3-attempt lockout.
 */
export async function confirmFarmerPin(farmerId: string, pin: string) {
  const farmer = await prisma.farmer.findUnique({
    where: { id: farmerId },
    select: { userId: true, user: { select: { pinHash: true } } },
  });
  if (!farmer) throw notFound("Farmer");
  if (!farmer.userId || !farmer.user?.pinHash) {
    throw new AppError(
      "VALIDATION",
      "The farmer must set an AgriPay PIN first (in the app or on USSD).",
      "finance.errors.noPin",
    );
  }
  const check = await verifyPinForUser(farmer.userId, pin);
  if (!check.ok) {
    throw check.locked
      ? new AppError(
          "LOCKED",
          "PIN locked for 30 minutes after 3 wrong attempts.",
          "auth.errors.pinLocked",
        )
      : new AppError(
          "VALIDATION",
          `Wrong PIN. ${check.remaining} attempt(s) left.`,
          "finance.errors.wrongPin",
          { remaining: check.remaining },
        );
  }
}

/** Load a farmer the actor may see through the registry scope (farmer self, agent, co-op, admin). */
export async function scopedFarmer(db: Db, actor: Actor, farmerId: string) {
  let where;
  try {
    where = farmerScope(actor);
  } catch {
    throw forbidden();
  }
  const farmer = await db.farmer.findFirst({ where: { AND: [{ id: farmerId }, where] } });
  if (!farmer) throw notFound("Farmer");
  return farmer;
}

/** Lender / custodian organisation of the actor. */
export function lenderOrgId(actor: Actor): string {
  if (actor.role === "LENDER_ADMIN" || actor.role === "LENDER_OFFICER") {
    if (!actor.orgId) throw forbidden();
    return actor.orgId;
  }
  throw forbidden();
}

/** Find a farmer by AgriPay ID or exact phone (organisations without registry access cannot browse). */
export async function findFarmerByIdOrPhone(db: Db, q: string) {
  const s = q.trim();
  if (/^AP-[A-Z]{3}-\d{6}$/i.test(s))
    return db.farmer.findUnique({ where: { agripayId: s.toUpperCase() } });
  const phone = normalizeSlPhone(s);
  if (!phone) return null;
  const matches = await db.farmer.findMany({ where: { phone, status: "ACTIVE" }, take: 2 });
  // A shared family phone is ambiguous: ask for the AgriPay ID instead.
  return matches.length === 1 ? matches[0]! : null;
}

export async function getInstitution(actor: Actor) {
  const orgId = lenderOrgId(actor);
  const [org, fi] = await Promise.all([
    prisma.organization.findUniqueOrThrow({ where: { id: orgId } }),
    prisma.financialInstitution.findUnique({ where: { orgId } }),
  ]);
  return { org, fi };
}

export async function updateInstitution(actor: Actor, input: InstitutionSettingsInput) {
  if (!can(actor, "institution.manage")) throw forbidden();
  const orgId = lenderOrgId(actor);
  const data = institutionSettingsSchema.parse(input);
  return prisma.$transaction(async (tx) => {
    const before = await tx.financialInstitution.findUnique({ where: { orgId } });
    const fi = await tx.financialInstitution.upsert({
      where: { orgId },
      create: { orgId, ...data },
      update: data,
    });
    await audit(tx, {
      actor,
      action: "institution.updated",
      entity: "FinancialInstitution",
      entityId: orgId,
      before,
      after: data,
    });
    return fi;
  });
}
