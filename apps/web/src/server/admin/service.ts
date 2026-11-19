import "server-only";
import { type OrgType, type Prisma, prisma } from "@agrilink/db";
import { type Actor, can } from "@agrilink/validation/permissions";
import { audit } from "../audit";
import { AppError, forbidden } from "../errors";
import { inviteMember } from "../auth/invitations";
import { unlockPin } from "../auth/pin";

function requireAdmin(actor: Actor) {
  if (!can(actor, "user.manage")) throw forbidden();
}

export async function platformStats(actor: Actor) {
  // Platform admins see everything; co-op admins/staff see their own co-op.
  if (!["SUPER_ADMIN", "COOP_ADMIN", "COOP_STAFF"].includes(actor.role)) throw forbidden();
  const now = new Date();
  const y = now.getUTCFullYear();
  const youth = {
    gte: new Date(Date.UTC(y - 36, now.getUTCMonth(), now.getUTCDate() + 1)),
    lte: new Date(Date.UTC(y - 18, now.getUTCMonth(), now.getUTCDate())),
  };
  const scope: Prisma.FarmerWhereInput =
    actor.role === "SUPER_ADMIN" ? {} : { cooperativeId: actor.orgId ?? "__none__" };
  const active: Prisma.FarmerWhereInput = { ...scope, status: { not: "INACTIVE" } };
  const [farmers, women, youthCount, disability, duplicates, users, orgs, byDistrict] =
    await Promise.all([
      prisma.farmer.count({ where: active }),
      prisma.farmer.count({ where: { ...active, gender: "FEMALE" } }),
      prisma.farmer.count({ where: { ...active, dateOfBirth: youth } }),
      prisma.farmer.count({ where: { ...active, hasDisability: true } }),
      prisma.farmer.count({ where: { ...scope, status: "DUPLICATE_SUSPECTED" } }),
      actor.role === "SUPER_ADMIN" ? prisma.user.count() : Promise.resolve(0),
      actor.role === "SUPER_ADMIN" ? prisma.organization.count() : Promise.resolve(0),
      prisma.farmer.groupBy({ by: ["districtId"], where: active, _count: { _all: true } }),
    ]);
  const districts = await prisma.district.findMany({
    where: { id: { in: byDistrict.map((d) => d.districtId) } },
  });
  const names = new Map(districts.map((d) => [d.id, d.name]));
  return {
    farmers,
    women,
    youth: youthCount,
    disability,
    duplicates,
    users,
    orgs,
    byDistrict: byDistrict
      .map((d) => ({ district: names.get(d.districtId) ?? "?", count: d._count._all }))
      .sort((a, b) => b.count - a.count),
  };
}

export async function listUsers(actor: Actor, q?: string, page = 1, pageSize = 25) {
  requireAdmin(actor);
  const where: Prisma.UserWhereInput = q
    ? {
        OR: [
          { name: { contains: q, mode: "insensitive" } },
          { phone: { contains: q.replace(/\D/g, "").replace(/^0/, "") } },
        ],
      }
    : {};
  const [total, items] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        memberships: { where: { active: true }, include: { org: { select: { name: true } } } },
        farmer: { select: { agrilinkId: true } },
      },
    }),
  ]);
  return { total, items, page, pages: Math.max(1, Math.ceil(total / pageSize)) };
}

export async function setUserStatus(actor: Actor, userId: string, status: "ACTIVE" | "SUSPENDED") {
  requireAdmin(actor);
  if (userId === actor.userId)
    throw new AppError("VALIDATION", "You cannot change your own status.");
  await prisma.$transaction(async (tx) => {
    const before = await tx.user.findUniqueOrThrow({ where: { id: userId } });
    await tx.user.update({ where: { id: userId }, data: { status } });
    if (status === "SUSPENDED") {
      await tx.session.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
    await audit(tx, {
      actor,
      action: status === "SUSPENDED" ? "user.suspended" : "user.activated",
      entity: "User",
      entityId: userId,
      before: { status: before.status },
      after: { status },
    });
  });
}

export async function adminUnlockPin(actor: Actor, userId: string) {
  requireAdmin(actor);
  await unlockPin(actor.userId, userId);
}

export async function listOrganizations(actor: Actor) {
  requireAdmin(actor);
  return prisma.organization.findMany({
    orderBy: [{ type: "asc" }, { name: "asc" }],
    include: {
      district: { select: { name: true } },
      _count: { select: { memberships: true, members: true } },
    },
  });
}

export async function createOrganization(
  actor: Actor,
  input: {
    name: string;
    type: OrgType;
    districtId?: string | null;
    adminPhone?: string | null;
    adminName?: string | null;
  },
) {
  requireAdmin(actor);
  const name = input.name.trim();
  if (name.length < 3) throw new AppError("VALIDATION", "Organisation name is too short.");
  const exists = await prisma.organization.findFirst({
    where: { name: { equals: name, mode: "insensitive" }, type: input.type },
  });
  if (exists) throw new AppError("CONFLICT", "An organisation with this name already exists.");
  const org = await prisma.$transaction(async (tx) => {
    const created = await tx.organization.create({
      data: { name, type: input.type, districtId: input.districtId || null },
    });
    await audit(tx, {
      actor,
      action: "org.created",
      entity: "Organization",
      entityId: created.id,
      after: { name, type: input.type },
    });
    return created;
  });
  const adminRole = (
    {
      COOPERATIVE: "COOP_ADMIN",
      BUYER: "BUYER_ADMIN",
      LENDER: "LENDER_ADMIN",
      AGRO_DEALER: "AGRO_DEALER",
      PROGRAMME: "PROGRAMME_OFFICER",
      PLATFORM: "SUPER_ADMIN",
    } as const
  )[input.type];
  if (input.adminPhone) {
    await inviteMember(actor, {
      phone: input.adminPhone,
      role: adminRole,
      name: input.adminName ?? null,
      orgId: org.id,
    });
  }
  return org;
}

export async function setOrganizationActive(actor: Actor, orgId: string, active: boolean) {
  requireAdmin(actor);
  await prisma.$transaction(async (tx) => {
    await tx.organization.update({ where: { id: orgId }, data: { active } });
    await audit(tx, {
      actor,
      action: active ? "org.activated" : "org.deactivated",
      entity: "Organization",
      entityId: orgId,
    });
  });
}

export async function listTeam(actor: Actor) {
  if (!can(actor, "member.manage") || !actor.orgId) throw forbidden();
  const [org, members, invitations] = await Promise.all([
    prisma.organization.findUniqueOrThrow({ where: { id: actor.orgId } }),
    prisma.membership.findMany({
      where: { orgId: actor.orgId, active: true },
      include: {
        user: { select: { id: true, name: true, phone: true, lastLoginAt: true, status: true } },
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.invitation.findMany({
      where: {
        orgId: actor.orgId,
        acceptedAt: null,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: "desc" },
    }),
  ]);
  return { org, members, invitations };
}

export async function listAudit(
  actor: Actor,
  opts: { entity?: string; entityId?: string; take?: number } = {},
) {
  if (!can(actor, "audit.read")) throw forbidden();
  return prisma.auditLog.findMany({
    where: { entity: opts.entity || undefined, entityId: opts.entityId || undefined },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: opts.take ?? 100,
  });
}
