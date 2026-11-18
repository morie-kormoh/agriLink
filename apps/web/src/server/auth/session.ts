import "server-only";
import { cookies, headers } from "next/headers";
import { type Role, prisma } from "@agripay/db";
import { SHORT_SESSION_ROLES } from "@agripay/validation/permissions";
import { randomToken, sha256 } from "../crypto";
import { verifyAccessToken } from "./tokens";

export const SESSION_COOKIE = "agripay_session";
const DAY_MS = 24 * 60 * 60 * 1000;
export const SESSION_TTL_MS = 7 * DAY_MS;
export const SUPER_ADMIN_TTL_MS = 12 * 60 * 60 * 1000;
export const INACTIVITY_TIMEOUT_MS = 30 * 60 * 1000;
const TOUCH_INTERVAL_MS = 60 * 1000;

export interface SessionData {
  id: string;
  userId: string;
  activeOrgId: string | null;
  activeRole: Role | null;
  expiresAt: Date;
}

function cookieOptions(expires: Date) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    expires,
  };
}

/** Create a session and set the cookie. Call only from a server action or route handler. */
export async function createSession(
  userId: string,
  meta: { ip?: string | null; userAgent?: string | null } = {},
): Promise<SessionData> {
  const token = randomToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  const session = await prisma.session.create({
    data: {
      userId,
      tokenHash: sha256(token),
      expiresAt,
      ip: meta.ip ?? null,
      userAgent: meta.userAgent?.slice(0, 300) ?? null,
    },
  });
  (await cookies()).set(SESSION_COOKIE, token, cookieOptions(expiresAt));
  return { id: session.id, userId, activeOrgId: null, activeRole: null, expiresAt };
}

/** Pure validity rule, exported for tests. */
export function isSessionValid(
  s: {
    expiresAt: Date;
    revokedAt: Date | null;
    lastSeenAt: Date;
    activeRole: Role | null;
    createdAt: Date;
  },
  now = new Date(),
): boolean {
  if (s.revokedAt) return false;
  if (s.expiresAt <= now) return false;
  if (s.activeRole === "SUPER_ADMIN" && now.getTime() - s.createdAt.getTime() > SUPER_ADMIN_TTL_MS)
    return false;
  if (s.activeRole && SHORT_SESSION_ROLES.includes(s.activeRole)) {
    if (now.getTime() - s.lastSeenAt.getTime() > INACTIVITY_TIMEOUT_MS) return false;
  }
  return true;
}

/**
 * Read and validate the current session: a mobile bearer access token (Authorization header)
 * or the web cookie. Works in server components, actions and route handlers.
 */
export async function getSession(): Promise<SessionData | null> {
  const auth = (await headers()).get("authorization");
  let s = null;
  if (auth?.startsWith("Bearer ")) {
    const sessionId = verifyAccessToken(auth.slice(7).trim());
    if (!sessionId) return null;
    s = await prisma.session.findUnique({ where: { id: sessionId } });
    if (s && s.kind !== "MOBILE") return null;
  } else {
    const token = (await cookies()).get(SESSION_COOKIE)?.value;
    if (!token) return null;
    s = await prisma.session.findUnique({ where: { tokenHash: sha256(token) } });
    if (s && s.kind !== "WEB") return null;
  }
  if (!s || !isSessionValid(s)) return null;

  if (Date.now() - s.lastSeenAt.getTime() > TOUCH_INTERVAL_MS) {
    await prisma.session
      .update({ where: { id: s.id }, data: { lastSeenAt: new Date() } })
      .catch(() => undefined);
  }
  return {
    id: s.id,
    userId: s.userId,
    activeOrgId: s.activeOrgId,
    activeRole: s.activeRole,
    expiresAt: s.expiresAt,
  };
}

export async function setSessionContext(sessionId: string, orgId: string | null, role: Role) {
  await prisma.session.update({
    where: { id: sessionId },
    data: { activeOrgId: orgId, activeRole: role, lastSeenAt: new Date() },
  });
}

/** Revoke the current session and clear the cookie. */
export async function destroySession(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) {
    await prisma.session.updateMany({
      where: { tokenHash: sha256(token), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
  store.delete(SESSION_COOKIE);
}

export async function revokeOtherSessions(userId: string, keepSessionId: string): Promise<number> {
  const res = await prisma.session.updateMany({
    where: { userId, id: { not: keepSessionId }, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  return res.count;
}

export async function listActiveSessions(userId: string) {
  const sessions = await prisma.session.findMany({
    where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { lastSeenAt: "desc" },
    select: {
      id: true,
      kind: true,
      deviceName: true,
      ip: true,
      userAgent: true,
      lastSeenAt: true,
      createdAt: true,
      activeRole: true,
      revokedAt: true,
      expiresAt: true,
    },
  });
  return sessions.filter((s) => isSessionValid({ ...s }));
}
