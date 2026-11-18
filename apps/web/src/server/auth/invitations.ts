import "server-only";
import { type Role, prisma } from "@agripay/db";
import { formatSlPhone } from "@agripay/validation";
import { type Actor, INVITABLE_ROLES } from "@agripay/validation/permissions";
import { audit } from "../audit";
import { randomToken, sha256 } from "../crypto";
import { env } from "../env";
import { AppError, forbidden } from "../errors";
import { sendSms } from "../sms";

export const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Invite a person (by phone) into an organisation with a role.
 * Creates the user as INVITED if they don't exist yet, so they can sign in with OTP.
 */
export async function inviteMember(
  actor: Actor,
  input: { phone: string; role: Role; name?: string | null; orgId?: string | null },
): Promise<{ invitationId: string; url: string }> {
  const orgId = actor.role === "SUPER_ADMIN" ? (input.orgId ?? actor.orgId) : actor.orgId;
  if (!orgId) throw forbidden();
  const allowed = INVITABLE_ROLES[actor.role] ?? [];
  if (!allowed.includes(input.role)) throw forbidden("You cannot invite someone with that role.");

  const org = await prisma.organization.findUniqueOrThrow({ where: { id: orgId } });
  if (input.role === "AGENT" && org.type !== "COOPERATIVE" && org.type !== "PLATFORM") {
    throw new AppError("VALIDATION", "Field agents belong to a cooperative or the platform.");
  }

  const token = randomToken(24);
  const invitation = await prisma.$transaction(async (tx) => {
    const user = await tx.user.upsert({
      where: { phone: input.phone },
      update: {},
      create: { phone: input.phone, name: input.name ?? null, status: "INVITED" },
    });
    const existing = await tx.membership.findUnique({
      where: { userId_orgId_role: { userId: user.id, orgId, role: input.role } },
    });
    if (existing?.active)
      throw new AppError("CONFLICT", "This person already has that role in this organisation.");

    // Revoke older pending invitations for the same phone/org/role.
    await tx.invitation.updateMany({
      where: { phone: input.phone, orgId, role: input.role, acceptedAt: null, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    const inv = await tx.invitation.create({
      data: {
        phone: input.phone,
        orgId,
        role: input.role,
        tokenHash: sha256(token),
        invitedBy: actor.userId,
        expiresAt: new Date(Date.now() + INVITE_TTL_MS),
      },
    });
    await audit(tx, {
      actor,
      action: "member.invited",
      entity: "Invitation",
      entityId: inv.id,
      after: { phone: input.phone, orgId, role: input.role },
    });
    return inv;
  });

  const url = `${env().APP_URL}/invite/${token}`;
  await sendSms(
    input.phone,
    `AgriPay: you've been invited to join ${org.name}. Open ${url} to accept (valid 7 days).`,
    "invite",
  );
  return { invitationId: invitation.id, url };
}

export async function getInvitationByToken(token: string) {
  const inv = await prisma.invitation.findUnique({
    where: { tokenHash: sha256(token) },
    include: { org: { select: { id: true, name: true, type: true } } },
  });
  if (!inv) return null;
  const usable = !inv.acceptedAt && !inv.revokedAt && inv.expiresAt > new Date();
  return { ...inv, usable, phoneDisplay: formatSlPhone(inv.phone) };
}

/** Accept an invitation as the signed-in user (phone must match). */
export async function acceptInvitation(
  token: string,
  userId: string,
): Promise<{ orgId: string; role: Role }> {
  const inv = await getInvitationByToken(token);
  if (!inv || !inv.usable)
    throw new AppError(
      "VALIDATION",
      "This invitation has expired or was already used.",
      "team.expired",
    );
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (user.phone !== inv.phone)
    throw new AppError(
      "FORBIDDEN",
      "This invitation is for a different phone number.",
      "team.wrongPhone",
    );

  await prisma.$transaction(async (tx) => {
    await tx.membership.upsert({
      where: { userId_orgId_role: { userId, orgId: inv.orgId, role: inv.role } },
      update: { active: true },
      create: { userId, orgId: inv.orgId, role: inv.role },
    });
    await tx.invitation.update({ where: { id: inv.id }, data: { acceptedAt: new Date() } });
    if (user.status === "INVITED") {
      await tx.user.update({
        where: { id: userId },
        data: { status: "ACTIVE", phoneVerified: true },
      });
    }
    await audit(tx, {
      actor: { userId, role: inv.role, orgId: inv.orgId },
      action: "member.joined",
      entity: "Membership",
      entityId: `${userId}:${inv.orgId}:${inv.role}`,
    });
  });
  return { orgId: inv.orgId, role: inv.role };
}

export async function revokeInvitation(actor: Actor, invitationId: string) {
  const inv = await prisma.invitation.findUniqueOrThrow({ where: { id: invitationId } });
  if (actor.role !== "SUPER_ADMIN" && inv.orgId !== actor.orgId) throw forbidden();
  await prisma.$transaction(async (tx) => {
    await tx.invitation.update({ where: { id: invitationId }, data: { revokedAt: new Date() } });
    await audit(tx, {
      actor,
      action: "member.invite_revoked",
      entity: "Invitation",
      entityId: invitationId,
    });
  });
}

export async function deactivateMembership(actor: Actor, membershipId: string) {
  const m = await prisma.membership.findUniqueOrThrow({ where: { id: membershipId } });
  if (actor.role !== "SUPER_ADMIN" && m.orgId !== actor.orgId) throw forbidden();
  if (m.userId === actor.userId) throw new AppError("VALIDATION", "You cannot remove yourself.");
  await prisma.$transaction(async (tx) => {
    await tx.membership.update({ where: { id: membershipId }, data: { active: false } });
    await tx.session.updateMany({
      where: { userId: m.userId, activeOrgId: m.orgId, activeRole: m.role, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await audit(tx, {
      actor,
      action: "member.role_removed",
      entity: "Membership",
      entityId: membershipId,
      before: { role: m.role, orgId: m.orgId },
    });
  });
}
