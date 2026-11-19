import "server-only";
import {
  type Db,
  type MobileMoneyProvider,
  Prisma,
  type RegistrationChannel,
  nextFarmerId,
  prisma,
} from "@agrilink/db";
import {
  type FarmerSearch,
  type RegisterFarmerData,
  addCropCycleSchema,
  addPlotSchema,
  addWalletSchema,
  updateFarmerSchema,
} from "@agrilink/validation";
import { type Actor, can } from "@agrilink/validation/permissions";
import type { z } from "zod";
import { audit } from "../audit";
import { AppError, forbidden, notFound } from "../errors";
import { sendSms } from "../sms";
import { type DuplicateCandidate, findDuplicateCandidates } from "./duplicates";
import { computeKycTier, namesMatch } from "./kyc";
import { farmerResource, farmerScope } from "./scope";

export interface RegisterResult {
  created: boolean;
  farmer: { id: string; agrilinkId: string; fullName: string; status: string; kycTier: number };
  duplicateOf: DuplicateCandidate | null;
  sharedPhone: boolean;
  warnings: string[];
}

export function channelForActor(actor: Actor): RegistrationChannel {
  return actor.role === "AGENT" ? "AGENT_APP" : "COOP_PORTAL";
}

/** Which cooperative a new farmer joins, enforcing that staff can only register into their own co-op. */
async function resolveCooperative(
  db: Db,
  actor: Actor,
  requested: string | null | undefined,
): Promise<string | null> {
  if (actor.role === "SUPER_ADMIN") {
    if (!requested) return null;
    const org = await db.organization.findUnique({ where: { id: requested } });
    if (!org || org.type !== "COOPERATIVE")
      throw new AppError("VALIDATION", "Unknown cooperative.");
    return org.id;
  }
  if (!actor.orgId) return null;
  const org = await db.organization.findUnique({ where: { id: actor.orgId } });
  const actorCoop = org?.type === "COOPERATIVE" ? org.id : null;
  if (requested && requested !== actorCoop)
    throw forbidden("You can only register farmers into your own cooperative.");
  return actorCoop;
}

/**
 * Register a farmer (module 02, step 4). Idempotent on `clientRef` (offline sync retries).
 * Creates User (when the phone is free) + Farmer + Wallet + Plot + CropCycle + audit in one transaction.
 */
export async function registerFarmer(
  actor: Actor,
  input: RegisterFarmerData,
  channel: RegistrationChannel = channelForActor(actor),
): Promise<RegisterResult> {
  if (!can(actor, "farmer.create")) throw forbidden();

  if (input.clientRef) {
    const existing = await prisma.farmer.findUnique({ where: { clientRef: input.clientRef } });
    if (existing) {
      return {
        created: false,
        farmer: existing,
        duplicateOf: null,
        sharedPhone: existing.sharedPhone,
        warnings: [],
      };
    }
  }

  const cooperativeId = await resolveCooperative(prisma, actor, input.cooperativeId);

  const [district, chiefdom, crop] = await Promise.all([
    prisma.district.findUnique({ where: { id: input.districtId } }),
    prisma.chiefdom.findUnique({ where: { id: input.chiefdomId } }),
    prisma.crop.findUnique({ where: { id: input.cropId } }),
  ]);
  if (!district) throw new AppError("VALIDATION", "Unknown district.");
  if (!chiefdom || chiefdom.districtId !== district.id)
    throw new AppError("VALIDATION", "Chiefdom is not in the selected district.");
  if (!crop || !crop.active) throw new AppError("VALIDATION", "Unknown crop.");

  const dup = await findDuplicateCandidates(prisma, {
    phone: input.phone,
    nin: input.nin,
    fullName: input.fullName,
    dateOfBirth: input.dateOfBirth,
    chiefdomId: chiefdom.id,
  });
  const duplicateOf = dup.candidates[0] ?? null;
  const warnings: string[] = [];

  const walletMsisdn = input.walletMsisdn ?? input.phone;
  const walletTaken = input.walletProvider
    ? await prisma.wallet.findUnique({
        where: { provider_msisdn: { provider: input.walletProvider, msisdn: walletMsisdn } },
      })
    : null;
  if (walletTaken) warnings.push("WALLET_ALREADY_REGISTERED");
  if (dup.ninTaken) warnings.push("NIN_ALREADY_REGISTERED");

  const coopAttested =
    !!cooperativeId && (actor.role === "COOP_ADMIN" || actor.role === "COOP_STAFF");
  const nin = dup.ninTaken ? null : input.nin;

  try {
    const result = await prisma.$transaction(async (tx) => {
      // Link a login only if the phone is unused, or belongs to a bare user (e.g. invited) with no farmer and no staff role.
      const existingUser = await tx.user.findUnique({
        where: { phone: input.phone },
        include: { farmer: { select: { id: true } }, _count: { select: { memberships: true } } },
      });
      let userId: string | null = null;
      let sharedPhone = false;
      if (!existingUser) {
        userId = (await tx.user.create({ data: { phone: input.phone, name: input.fullName } })).id;
      } else if (!existingUser.farmer && existingUser._count.memberships === 0) {
        userId = existingUser.id;
      } else {
        sharedPhone = true;
      }
      if (dup.phoneTakenByOther) sharedPhone = true;

      const agrilinkId = await nextFarmerId(tx, district.code);
      const farmer = await tx.farmer.create({
        data: {
          agrilinkId,
          userId,
          phone: input.phone,
          sharedPhone,
          fullName: input.fullName,
          gender: input.gender,
          dateOfBirth: input.dateOfBirth,
          nin,
          hasDisability: input.hasDisability,
          householdSize: input.householdSize ?? null,
          isHouseholdHead: input.isHouseholdHead ?? null,
          districtId: district.id,
          chiefdomId: chiefdom.id,
          community: input.community,
          cooperativeId,
          registeredById: actor.userId,
          registeredVia: channel,
          clientRef: input.clientRef ?? null,
          status: duplicateOf ? "DUPLICATE_SUSPECTED" : "ACTIVE",
          duplicateOfId: duplicateOf?.id ?? null,
          duplicateNote: duplicateOf
            ? `${duplicateOf.reason} (${duplicateOf.agrilinkId}, score ${duplicateOf.score.toFixed(2)})`
            : dup.ninTaken
              ? "NIN already registered to another farmer"
              : null,
          kycTier: computeKycTier({ hasVerifiedWallet: false, coopAttested, hasNin: !!nin }),
          wallets:
            input.walletProvider && !walletTaken
              ? {
                  create: { provider: input.walletProvider, msisdn: walletMsisdn, isPrimary: true },
                }
              : undefined,
          plots: {
            create: {
              name: input.plotName ?? null,
              sizeAcres: new Prisma.Decimal(input.sizeAcres),
              tenure: input.tenure ?? null,
              latitude: input.latitude ?? null,
              longitude: input.longitude ?? null,
              gpsAccuracyM: input.gpsAccuracyM ?? null,
              cropCycles: { create: { cropId: crop.id, season: input.season } },
            },
          },
        },
      });
      await audit(tx, {
        actor,
        action: "farmer.registered",
        entity: "Farmer",
        entityId: farmer.id,
        after: {
          agrilinkId,
          fullName: farmer.fullName,
          phone: farmer.phone,
          cooperativeId,
          channel,
          status: farmer.status,
          duplicateOf: duplicateOf?.agrilinkId ?? null,
          capturedAt: input.capturedAt ?? null,
        },
      });
      return { farmer, sharedPhone };
    });

    if (result.sharedPhone) warnings.push("SHARED_PHONE");
    await sendSms(
      input.phone,
      `Welcome to AgriLink, ${result.farmer.fullName}. Your AgriLink ID is ${result.farmer.agrilinkId}. Keep this ID for payments, savings and loans.`,
      "welcome",
    );

    return {
      created: true,
      farmer: result.farmer,
      duplicateOf,
      sharedPhone: result.sharedPhone,
      warnings,
    };
  } catch (e) {
    // Concurrent retry of the same offline record: return the winner.
    if (
      e instanceof Prisma.PrismaClientKnownRequestError &&
      e.code === "P2002" &&
      input.clientRef
    ) {
      const existing = await prisma.farmer.findUnique({ where: { clientRef: input.clientRef } });
      if (existing)
        return {
          created: false,
          farmer: existing,
          duplicateOf: null,
          sharedPhone: existing.sharedPhone,
          warnings: [],
        };
    }
    throw e;
  }
}

function youthDobRange(now = new Date()) {
  const y = now.getUTCFullYear();
  return {
    gte: new Date(Date.UTC(y - 36, now.getUTCMonth(), now.getUTCDate() + 1)),
    lte: new Date(Date.UTC(y - 18, now.getUTCMonth(), now.getUTCDate())),
  };
}

export async function searchFarmers(actor: Actor, params: FarmerSearch) {
  if (!can(actor, "farmer.read")) throw forbidden();
  const and: Prisma.FarmerWhereInput[] = [farmerScope(actor)];
  if (params.q) {
    const q = params.q.trim();
    const digits = q.replace(/\D/g, "");
    and.push({
      OR: [
        { fullName: { contains: q, mode: "insensitive" } },
        { agrilinkId: { contains: q.toUpperCase() } },
        { community: { contains: q, mode: "insensitive" } },
        ...(digits.length >= 4 ? [{ phone: { contains: digits.replace(/^0/, "") } }] : []),
      ],
    });
  }
  if (params.status) and.push({ status: params.status });
  if (params.gender) and.push({ gender: params.gender });
  if (params.districtId) and.push({ districtId: params.districtId });
  if (params.chiefdomId) and.push({ chiefdomId: params.chiefdomId });
  if (params.kycTier) and.push({ kycTier: params.kycTier });
  if (params.youth) and.push({ dateOfBirth: youthDobRange() });
  if (params.cropId)
    and.push({ plots: { some: { cropCycles: { some: { cropId: params.cropId } } } } });

  const where: Prisma.FarmerWhereInput = { AND: and };
  const [total, items] = await Promise.all([
    prisma.farmer.count({ where }),
    prisma.farmer.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (params.page - 1) * params.pageSize,
      take: params.pageSize,
      include: {
        district: { select: { name: true, code: true } },
        chiefdom: { select: { name: true } },
        cooperative: { select: { name: true } },
        wallets: { where: { isPrimary: true }, take: 1 },
        plots: {
          take: 1,
          orderBy: { createdAt: "asc" },
          include: {
            cropCycles: { take: 1, orderBy: { createdAt: "desc" }, include: { crop: true } },
          },
        },
      },
    }),
  ]);
  return {
    total,
    page: params.page,
    pageSize: params.pageSize,
    pages: Math.max(1, Math.ceil(total / params.pageSize)),
    items,
  };
}

export async function getFarmer(actor: Actor, id: string) {
  const farmer = await prisma.farmer.findUnique({
    where: { id },
    include: {
      district: true,
      chiefdom: true,
      cooperative: { select: { id: true, name: true } },
      registeredBy: { select: { id: true, name: true, phone: true } },
      wallets: { orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }] },
      plots: {
        orderBy: { createdAt: "asc" },
        include: { cropCycles: { orderBy: { createdAt: "desc" }, include: { crop: true } } },
      },
    },
  });
  if (!farmer) throw notFound("Farmer");
  if (!can(actor, "farmer.read", farmerResource(farmer))) throw forbidden();
  return farmer;
}

async function loadForWrite(
  actor: Actor,
  id: string,
  action: "farmer.update" | "wallet.manage" = "farmer.update",
) {
  const farmer = await prisma.farmer.findUnique({ where: { id } });
  if (!farmer) throw notFound("Farmer");
  if (!can(actor, action, farmerResource(farmer))) throw forbidden();
  return farmer;
}

async function recomputeKyc(db: Db, farmerId: string) {
  const f = await db.farmer.findUniqueOrThrow({
    where: { id: farmerId },
    include: {
      wallets: { where: { verified: true }, take: 1 },
      registeredBy: { include: { memberships: true } },
    },
  });
  const coopAttested =
    !!f.cooperativeId &&
    !!f.registeredBy?.memberships.some(
      (m) => m.orgId === f.cooperativeId && (m.role === "COOP_ADMIN" || m.role === "COOP_STAFF"),
    );
  const tier = computeKycTier({
    hasVerifiedWallet: f.wallets.length > 0,
    coopAttested,
    hasNin: !!f.nin,
  });
  if (tier !== f.kycTier)
    await db.farmer.update({ where: { id: farmerId }, data: { kycTier: tier } });
  return tier;
}

export async function updateFarmer(
  actor: Actor,
  id: string,
  patch: z.input<typeof updateFarmerSchema>,
) {
  const data = updateFarmerSchema.parse(patch);
  const before = await loadForWrite(actor, id);
  if (data.cooperativeId !== undefined && data.cooperativeId !== before.cooperativeId) {
    if (actor.role !== "SUPER_ADMIN")
      throw forbidden("Only platform admins can move farmers between cooperatives.");
  }
  if (data.chiefdomId) {
    const c = await prisma.chiefdom.findUnique({ where: { id: data.chiefdomId } });
    if (!c || c.districtId !== before.districtId)
      throw new AppError("VALIDATION", "Chiefdom is not in the farmer's district.");
  }
  if (data.nin) {
    const other = await prisma.farmer.findFirst({ where: { nin: data.nin, id: { not: id } } });
    if (other)
      throw new AppError("CONFLICT", `This NIN is already registered to ${other.agrilinkId}.`);
  }
  return prisma.$transaction(async (tx) => {
    const after = await tx.farmer.update({ where: { id }, data });
    await recomputeKyc(tx, id);
    await audit(tx, {
      actor,
      action: "farmer.updated",
      entity: "Farmer",
      entityId: id,
      before: Object.fromEntries(
        Object.keys(data).map((k) => [k, before[k as keyof typeof before]]),
      ),
      after: data,
    });
    return after;
  });
}

export async function addWallet(
  actor: Actor,
  farmerId: string,
  input: z.input<typeof addWalletSchema>,
) {
  const data = addWalletSchema.parse(input);
  await loadForWrite(actor, farmerId, "wallet.manage");
  const taken = await prisma.wallet.findUnique({
    where: { provider_msisdn: { provider: data.provider, msisdn: data.msisdn } },
  });
  if (taken)
    throw new AppError("CONFLICT", "This mobile money number is already registered on AgriLink.");
  return prisma.$transaction(async (tx) => {
    const count = await tx.wallet.count({ where: { farmerId } });
    const isPrimary = data.isPrimary || count === 0;
    if (isPrimary) await tx.wallet.updateMany({ where: { farmerId }, data: { isPrimary: false } });
    const wallet = await tx.wallet.create({
      data: { farmerId, provider: data.provider, msisdn: data.msisdn, isPrimary },
    });
    await audit(tx, {
      actor,
      action: "wallet.added",
      entity: "Wallet",
      entityId: wallet.id,
      after: { farmerId, provider: data.provider, msisdn: data.msisdn, isPrimary },
    });
    return wallet;
  });
}

/**
 * Stand-in for module 04's provider adapter `lookupAccountName`.
 * In mock mode it "returns" the farmer's own name so the flow can be demonstrated.
 */
async function lookupAccountName(
  _provider: MobileMoneyProvider,
  _msisdn: string,
  mockName: string,
): Promise<{ name: string } | null> {
  if ((process.env.PAYMENT_PROVIDER_MODE ?? "mock") === "mock") return { name: mockName };
  return null; // real adapters arrive with module 04
}

export async function verifyWallet(actor: Actor, walletId: string) {
  const wallet = await prisma.wallet.findUnique({
    where: { id: walletId },
    include: { farmer: true },
  });
  if (!wallet) throw notFound("Wallet");
  if (!can(actor, "wallet.manage", farmerResource(wallet.farmer))) throw forbidden();
  const lookup = await lookupAccountName(wallet.provider, wallet.msisdn, wallet.farmer.fullName);
  if (!lookup)
    throw new AppError(
      "PROVIDER_ERROR",
      "Could not reach the mobile money provider. Try again later.",
    );
  const match = namesMatch(lookup.name, wallet.farmer.fullName);
  return prisma.$transaction(async (tx) => {
    const updated = await tx.wallet.update({
      where: { id: walletId },
      data: { accountName: lookup.name, verified: match },
    });
    const tier = await recomputeKyc(tx, wallet.farmerId);
    await audit(tx, {
      actor,
      action: "wallet.verified",
      entity: "Wallet",
      entityId: walletId,
      after: { accountName: lookup.name, verified: match, kycTier: tier },
    });
    return { wallet: updated, match, kycTier: tier };
  });
}

export async function addPlot(
  actor: Actor,
  farmerId: string,
  input: z.input<typeof addPlotSchema>,
) {
  const data = addPlotSchema.parse(input);
  await loadForWrite(actor, farmerId);
  return prisma.$transaction(async (tx) => {
    const plot = await tx.farmPlot.create({
      data: {
        farmerId,
        name: data.name,
        sizeAcres: new Prisma.Decimal(data.sizeAcres),
        tenure: data.tenure ?? null,
        latitude: data.latitude ?? null,
        longitude: data.longitude ?? null,
        gpsAccuracyM: data.gpsAccuracyM ?? null,
      },
    });
    await audit(tx, {
      actor,
      action: "plot.added",
      entity: "FarmPlot",
      entityId: plot.id,
      after: { farmerId, sizeAcres: data.sizeAcres },
    });
    return plot;
  });
}

export async function addCropCycle(
  actor: Actor,
  farmerId: string,
  input: z.input<typeof addCropCycleSchema>,
) {
  const data = addCropCycleSchema.parse(input);
  await loadForWrite(actor, farmerId);
  const plot = await prisma.farmPlot.findUnique({ where: { id: data.plotId } });
  if (!plot || plot.farmerId !== farmerId) throw notFound("Plot");
  return prisma.$transaction(async (tx) => {
    const cycle = await tx.cropCycle.create({
      data: {
        plotId: plot.id,
        cropId: data.cropId,
        season: data.season,
        plantedAt: data.plantedAt ?? null,
        expectedHarvest: data.expectedHarvest ?? null,
        expectedYieldKg:
          data.expectedYieldKg != null ? new Prisma.Decimal(data.expectedYieldKg) : null,
      },
    });
    await audit(tx, {
      actor,
      action: "crop_cycle.added",
      entity: "CropCycle",
      entityId: cycle.id,
      after: { farmerId, ...data },
    });
    return cycle;
  });
}

export async function setFarmerPhoto(actor: Actor, farmerId: string, photoKey: string) {
  await loadForWrite(actor, farmerId);
  if (!photoKey.startsWith(`farmers/${farmerId}/`))
    throw new AppError("VALIDATION", "Invalid photo key.");
  await prisma.$transaction(async (tx) => {
    await tx.farmer.update({ where: { id: farmerId }, data: { photoKey } });
    await audit(tx, { actor, action: "farmer.photo_set", entity: "Farmer", entityId: farmerId });
  });
}

// ---------- Duplicates (module 02, step 12) ----------

export async function listSuspectedDuplicates(actor: Actor) {
  if (!can(actor, "farmer.resolveDuplicate")) throw forbidden();
  const items = await prisma.farmer.findMany({
    where: { AND: [farmerScope(actor), { status: "DUPLICATE_SUSPECTED" }] },
    orderBy: { createdAt: "desc" },
    include: { district: true, chiefdom: true, registeredBy: { select: { name: true } } },
  });
  const originals = await prisma.farmer.findMany({
    where: { id: { in: items.map((i) => i.duplicateOfId).filter((x): x is string => !!x) } },
    include: { district: true, chiefdom: true },
  });
  const byId = new Map(originals.map((o) => [o.id, o]));
  return items.map((i) => ({
    farmer: i,
    original: i.duplicateOfId ? (byId.get(i.duplicateOfId) ?? null) : null,
  }));
}

export async function resolveDuplicate(
  actor: Actor,
  farmerId: string,
  outcome: "NOT_DUPLICATE" | "DEACTIVATE",
) {
  const farmer = await prisma.farmer.findUnique({ where: { id: farmerId } });
  if (!farmer) throw notFound("Farmer");
  if (!can(actor, "farmer.resolveDuplicate", farmerResource(farmer))) throw forbidden();
  if (farmer.status !== "DUPLICATE_SUSPECTED")
    throw new AppError("CONFLICT", "This farmer is not flagged as a duplicate.");
  return prisma.$transaction(async (tx) => {
    const updated = await tx.farmer.update({
      where: { id: farmerId },
      data:
        outcome === "NOT_DUPLICATE"
          ? { status: "ACTIVE", duplicateOfId: null, duplicateNote: `Reviewed: not a duplicate` }
          : {
              status: "INACTIVE",
              duplicateNote: `${farmer.duplicateNote ?? ""} — deactivated as duplicate`.trim(),
            },
    });
    // A deactivated duplicate must not keep a login.
    if (outcome === "DEACTIVATE" && farmer.userId) {
      await tx.session.updateMany({
        where: { userId: farmer.userId, revokedAt: null, activeRole: "FARMER" },
        data: { revokedAt: new Date() },
      });
    }
    await audit(tx, {
      actor,
      action: "farmer.duplicate_resolved",
      entity: "Farmer",
      entityId: farmerId,
      before: { status: farmer.status, duplicateOfId: farmer.duplicateOfId },
      after: { status: updated.status, outcome },
    });
    return updated;
  });
}
