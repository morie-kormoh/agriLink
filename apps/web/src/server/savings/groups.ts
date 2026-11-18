import "server-only";
import { Prisma, nextSequenceValue, prisma } from "@agripay/db";
import {
  type GroupFrequency,
  onTimeRate,
  periodNumber,
  rotatingRecipient,
  totalPeriods,
} from "@agripay/finance";
import {
  addGroupMemberSchema,
  createGroupSchema,
  formatLe,
  recordContributionSchema,
  recordPayoutSchema,
  type CreateGroupInput,
} from "@agripay/validation";
import { type Actor, can } from "@agripay/validation/permissions";
import type { z } from "zod";
import { audit } from "../audit";
import { AppError, forbidden, notFound } from "../errors";
import { emit } from "../events";
import { sendSms } from "../sms";

/**
 * Group savings (VSLA / Osusu) — module 06. The group's cash stays with the group (or its mobile money
 * account); AgriPay keeps the books: members, contributions per period, rotating payouts and statements.
 */

async function loadGroup(id: string) {
  const g = await prisma.savingsGroup.findUnique({ where: { id } });
  if (!g) throw notFound("Group");
  return g;
}

/** Co-op staff of the group's co-op, or the group's own treasurer / chair. */
async function assertCanKeepBooks(actor: Actor, group: { id: string; cooperativeId: string }) {
  if (actor.role === "SUPER_ADMIN") return;
  if (
    (actor.role === "COOP_ADMIN" || actor.role === "COOP_STAFF") &&
    actor.orgId === group.cooperativeId
  )
    return;
  if (actor.role === "FARMER" && actor.farmerId) {
    const m = await prisma.savingsGroupMember.findUnique({
      where: { groupId_farmerId: { groupId: group.id, farmerId: actor.farmerId } },
    });
    if (m && (m.role === "TREASURER" || m.role === "CHAIR")) return;
  }
  throw forbidden();
}

async function assertCanView(actor: Actor, group: { id: string; cooperativeId: string }) {
  if (actor.role === "SUPER_ADMIN") return;
  if (
    (actor.role === "COOP_ADMIN" || actor.role === "COOP_STAFF" || actor.role === "AGENT") &&
    actor.orgId === group.cooperativeId
  )
    return;
  if (actor.role === "FARMER" && actor.farmerId) {
    const m = await prisma.savingsGroupMember.findUnique({
      where: { groupId_farmerId: { groupId: group.id, farmerId: actor.farmerId } },
    });
    if (m) return;
  }
  throw forbidden();
}

export async function createGroup(actor: Actor, input: CreateGroupInput) {
  if (!can(actor, "group.manage") || !actor.orgId) throw forbidden();
  const data = createGroupSchema.parse(input);
  return prisma.$transaction(async (tx) => {
    const ref = `GRP-${String(await nextSequenceValue(tx, "group")).padStart(6, "0")}`;
    const g = await tx.savingsGroup.create({
      data: { ...data, ref, cooperativeId: actor.orgId!, createdById: actor.userId },
    });
    await audit(tx, {
      actor,
      action: "group.created",
      entity: "SavingsGroup",
      entityId: g.id,
      after: { ref, ...data },
    });
    return g;
  });
}

export async function listGroups(actor: Actor) {
  let where: Prisma.SavingsGroupWhereInput;
  if (actor.role === "FARMER")
    where = { members: { some: { farmerId: actor.farmerId ?? "__none__" } } };
  else if (actor.role === "SUPER_ADMIN") where = {};
  else if (
    (actor.role === "COOP_ADMIN" || actor.role === "COOP_STAFF" || actor.role === "AGENT") &&
    actor.orgId
  )
    where = { cooperativeId: actor.orgId };
  else throw forbidden();
  const groups = await prisma.savingsGroup.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { members: true } } },
  });
  const totals = await prisma.groupContribution.groupBy({
    by: ["groupId"],
    where: { groupId: { in: groups.map((g) => g.id) } },
    _sum: { amountLe: true },
  });
  return groups.map((g) => ({
    ...g,
    totalLe: (
      totals.find((t) => t.groupId === g.id)?._sum.amountLe ?? new Prisma.Decimal(0)
    ).toFixed(2),
    currentPeriod: Math.min(
      periodNumber(g.cycleStart, g.frequency as GroupFrequency, new Date()),
      totalPeriods(g.cycleStart, g.cycleEnd, g.frequency as GroupFrequency),
    ),
    periods: totalPeriods(g.cycleStart, g.cycleEnd, g.frequency as GroupFrequency),
  }));
}

export async function getGroup(actor: Actor, id: string) {
  const g = await loadGroup(id);
  await assertCanView(actor, g);
  const [members, contributions, payouts] = await Promise.all([
    prisma.savingsGroupMember.findMany({
      where: { groupId: id },
      orderBy: [{ payoutOrder: "asc" }, { joinedAt: "asc" }],
      include: {
        farmer: {
          select: {
            id: true,
            fullName: true,
            agripayId: true,
            phone: true,
            loans: {
              where: { groupId: id },
              select: { ref: true, status: true, totalDueLe: true, repaidLe: true },
            },
          },
        },
      },
    }),
    prisma.groupContribution.findMany({
      where: { groupId: id },
      orderBy: [{ periodNo: "asc" }, { createdAt: "asc" }],
    }),
    prisma.groupPayout.findMany({
      where: { groupId: id },
      orderBy: { periodNo: "asc" },
      include: { farmer: { select: { fullName: true } } },
    }),
  ]);
  const freq = g.frequency as GroupFrequency;
  const periods = totalPeriods(g.cycleStart, g.cycleEnd, freq);
  const current = Math.min(periodNumber(g.cycleStart, freq, new Date()), periods);
  const viewerIsMember = actor.role === "FARMER";
  const memberRows = members.map((m) => {
    const mine = contributions.filter((c) => c.farmerId === m.farmerId);
    const paidPeriods = new Set(mine.map((c) => c.periodNo)).size;
    return {
      ...m,
      // Members see each other's names and totals (as in a VSLA meeting) but not phone numbers.
      farmer: { ...m.farmer, phone: viewerIsMember ? null : m.farmer.phone },
      totalLe: mine.reduce((s, c) => s.plus(c.amountLe), new Prisma.Decimal(0)).toFixed(2),
      byPeriod: Object.fromEntries(mine.map((c) => [c.periodNo, c.amountLe.toFixed(2)])),
      onTimeRate: onTimeRate(paidPeriods, current),
    };
  });
  const nextPayoutPeriod =
    g.type === "OSUSU_ROTATING"
      ? payouts.length
        ? Math.max(...payouts.map((p) => p.periodNo)) + 1
        : 1
      : null;
  const nextRecipient = nextPayoutPeriod ? rotatingRecipient(members, nextPayoutPeriod) : null;
  return {
    group: g,
    members: memberRows,
    payouts,
    periods,
    currentPeriod: current,
    totalLe: contributions.reduce((s, c) => s.plus(c.amountLe), new Prisma.Decimal(0)).toFixed(2),
    paidOutLe: payouts.reduce((s, p) => s.plus(p.amountLe), new Prisma.Decimal(0)).toFixed(2),
    nextPayout:
      nextPayoutPeriod && nextRecipient
        ? {
            periodNo: nextPayoutPeriod,
            farmerId: nextRecipient.farmerId,
            name: nextRecipient.farmer.fullName,
          }
        : null,
  };
}

export async function addGroupMember(
  actor: Actor,
  groupId: string,
  input: z.input<typeof addGroupMemberSchema>,
) {
  const g = await loadGroup(groupId);
  if (
    !can(actor, "group.manage") ||
    (actor.role !== "SUPER_ADMIN" && actor.orgId !== g.cooperativeId)
  )
    throw forbidden();
  const data = addGroupMemberSchema.parse(input);
  const farmer = await prisma.farmer.findUnique({ where: { id: data.farmerId } });
  if (!farmer || farmer.cooperativeId !== g.cooperativeId)
    throw new AppError("VALIDATION", "Only members of this co-op can join its groups.");
  if (data.payoutOrder != null) {
    const clash = await prisma.savingsGroupMember.findFirst({
      where: { groupId, payoutOrder: data.payoutOrder, farmerId: { not: data.farmerId } },
    });
    if (clash)
      throw new AppError("CONFLICT", `Payout position ${data.payoutOrder} is already taken.`);
  }
  return prisma.$transaction(async (tx) => {
    const m = await tx.savingsGroupMember.upsert({
      where: { groupId_farmerId: { groupId, farmerId: data.farmerId } },
      create: { groupId, ...data },
      update: { role: data.role, payoutOrder: data.payoutOrder ?? null, guarantor: data.guarantor },
    });
    await audit(tx, {
      actor,
      action: "group.member_saved",
      entity: "SavingsGroup",
      entityId: groupId,
      after: { farmer: farmer.agripayId, ...data },
    });
    return m;
  });
}

export async function recordContribution(
  actor: Actor,
  groupId: string,
  input: z.input<typeof recordContributionSchema>,
) {
  const g = await loadGroup(groupId);
  await assertCanKeepBooks(actor, g);
  const data = recordContributionSchema.parse(input);
  const member = await prisma.savingsGroupMember.findUnique({
    where: { groupId_farmerId: { groupId, farmerId: data.farmerId } },
  });
  if (!member) throw new AppError("VALIDATION", "Not a member of this group.");
  const periods = totalPeriods(g.cycleStart, g.cycleEnd, g.frequency as GroupFrequency);
  if (data.periodNo > periods)
    throw new AppError("VALIDATION", `This cycle has ${periods} periods.`);
  if (data.method === "MOBILE_MONEY" && !data.reference)
    throw new AppError("VALIDATION", "Enter the mobile money transaction ID.");
  try {
    return await prisma.$transaction(async (tx) => {
      const c = await tx.groupContribution.create({
        data: { groupId, ...data, recordedById: actor.userId },
      });
      await audit(tx, {
        actor,
        action: "group.contribution_recorded",
        entity: "SavingsGroup",
        entityId: groupId,
        after: data,
      });
      return c;
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")
      throw new AppError(
        "CONFLICT",
        "A contribution is already recorded for this member and period.",
      );
    throw e;
  } finally {
    void emit("score.stale", { farmerId: data.farmerId });
  }
}

/** Osusu: pay the period's pot to the member whose turn it is. */
export async function recordPayout(
  actor: Actor,
  groupId: string,
  input: z.input<typeof recordPayoutSchema>,
) {
  const g = await loadGroup(groupId);
  await assertCanKeepBooks(actor, g);
  if (g.type !== "OSUSU_ROTATING")
    throw new AppError("VALIDATION", "Only rotating (Osusu) groups have per-period payouts.");
  const data = recordPayoutSchema.parse(input);
  const members = await prisma.savingsGroupMember.findMany({
    where: { groupId },
    include: { farmer: true },
  });
  const recipient = rotatingRecipient(members, data.periodNo);
  if (!recipient) throw new AppError("VALIDATION", "Set payout positions for members first.");
  const pot = await prisma.groupContribution.aggregate({
    where: { groupId, periodNo: data.periodNo },
    _sum: { amountLe: true },
  });
  const amount = pot._sum.amountLe ?? new Prisma.Decimal(0);
  if (amount.lte(0))
    throw new AppError("VALIDATION", "No contributions recorded for this period yet.");
  try {
    const p = await prisma.$transaction(async (tx) => {
      const payout = await tx.groupPayout.create({
        data: {
          groupId,
          farmerId: recipient.farmerId,
          periodNo: data.periodNo,
          amountLe: amount,
          method: data.method,
          recordedById: actor.userId,
        },
      });
      await audit(tx, {
        actor,
        action: "group.payout_recorded",
        entity: "SavingsGroup",
        entityId: groupId,
        after: {
          periodNo: data.periodNo,
          to: recipient.farmer.agripayId,
          amountLe: amount.toFixed(2),
        },
      });
      return payout;
    });
    await sendSms(
      recipient.farmer.phone,
      `AgriPay: ${g.name} paid you the period ${data.periodNo} pot of ${formatLe(amount.toFixed(2))}.`,
      "general",
    );
    return p;
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")
      throw new AppError("CONFLICT", "This period has already been paid out.");
    throw e;
  }
}

/** After a meeting: every member gets an SMS with their own total. */
export async function sendGroupStatements(actor: Actor, groupId: string) {
  const g = await loadGroup(groupId);
  await assertCanKeepBooks(actor, g);
  const members = await prisma.savingsGroupMember.findMany({
    where: { groupId },
    include: { farmer: true },
  });
  const totals = await prisma.groupContribution.groupBy({
    by: ["farmerId"],
    where: { groupId },
    _sum: { amountLe: true },
  });
  for (const m of members) {
    const t = totals.find((x) => x.farmerId === m.farmerId)?._sum.amountLe ?? new Prisma.Decimal(0);
    await sendSms(
      m.farmer.phone,
      `AgriPay ${g.name}: your total savings this cycle is ${formatLe(t.toFixed(2))}.`,
      "general",
    );
  }
  await prisma.$transaction((tx) =>
    audit(tx, {
      actor,
      action: "group.statements_sent",
      entity: "SavingsGroup",
      entityId: groupId,
      after: { members: members.length },
    }),
  );
  return { sent: members.length };
}
