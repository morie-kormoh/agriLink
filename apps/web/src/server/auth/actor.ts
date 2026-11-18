import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { type OrgType, type Role, prisma } from "@agripay/db";
import { type Actor, PORTAL_ROLES } from "@agripay/validation/permissions";
import { AppError } from "../errors";
import { getSession } from "./session";

export interface WorkspaceContext {
  orgId: string | null;
  orgName: string | null;
  orgType: OrgType | null;
  role: Role;
}

/** All workspaces a user can act in: org memberships + "my farm" if they are a farmer. */
export async function listContexts(userId: string): Promise<WorkspaceContext[]> {
  const [memberships, farmer] = await Promise.all([
    prisma.membership.findMany({
      where: { userId, active: true, org: { active: true } },
      include: { org: { select: { id: true, name: true, type: true } } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.farmer.findUnique({ where: { userId }, select: { id: true, status: true } }),
  ]);
  const contexts: WorkspaceContext[] = memberships.map((m) => ({
    orgId: m.orgId,
    orgName: m.org.name,
    orgType: m.org.type,
    role: m.role,
  }));
  if (farmer && farmer.status !== "INACTIVE") {
    contexts.push({ orgId: null, orgName: null, orgType: null, role: "FARMER" });
  }
  return contexts;
}

export interface CurrentUser {
  sessionId: string;
  actor: Actor;
  user: { id: string; phone: string; name: string | null; locale: string; pinSet: boolean };
  context: WorkspaceContext;
}

/** Session + user without requiring an active workspace (used by select-context). */
export const getSessionUser = cache(async () => {
  const session = await getSession();
  if (!session) return null;
  const user = await prisma.user.findUnique({ where: { id: session.userId } });
  if (!user || user.status === "SUSPENDED") return null;
  return { session, user };
});

/**
 * Resolve the signed-in actor for server components and actions.
 * Redirects to /login or /select-context when needed (use inside pages/actions).
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser> => {
  const su = await getSessionUser();
  if (!su) redirect("/login");
  const { session, user } = su;
  if (!session.activeRole) redirect("/select-context");

  // Re-check the context is still valid (membership may have been removed).
  const contexts = await listContexts(user.id);
  const context = contexts.find(
    (c) => c.role === session.activeRole && c.orgId === session.activeOrgId,
  );
  if (!context) redirect("/select-context");

  const farmerId =
    context.role === "FARMER"
      ? ((await prisma.farmer.findUnique({ where: { userId: user.id }, select: { id: true } }))
          ?.id ?? null)
      : null;

  return {
    sessionId: session.id,
    actor: { userId: user.id, role: context.role, orgId: context.orgId, farmerId },
    user: {
      id: user.id,
      phone: user.phone,
      name: user.name,
      locale: user.locale,
      pinSet: !!user.pinHash,
    },
    context,
  };
});

/** For pages: ensure the active role may use the portal (URL prefix). */
export async function requirePortal(
  prefix: keyof typeof PORTAL_ROLES | string,
): Promise<CurrentUser> {
  const current = await getCurrentUser();
  const allowed = PORTAL_ROLES[prefix];
  if (allowed && !allowed.includes(current.actor.role)) redirect("/select-context?denied=1");
  return current;
}

/** For server actions / route handlers: throw instead of redirecting. */
export async function requireActor(roles?: readonly Role[]): Promise<CurrentUser> {
  const su = await getSessionUser();
  if (!su || !su.session.activeRole) throw new AppError("UNAUTHENTICATED", "Please sign in again.");
  const current = await getCurrentUser();
  if (roles && !roles.includes(current.actor.role))
    throw new AppError("FORBIDDEN", "You do not have permission to do this.");
  return current;
}
