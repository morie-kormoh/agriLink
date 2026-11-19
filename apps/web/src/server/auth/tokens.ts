import "server-only";
import { prisma } from "@agrilink/db";
import { audit } from "../audit";
import { hmac, randomToken, safeEqual, sha256 } from "../crypto";
import { AppError } from "../errors";

/**
 * Mobile (native app) authentication:
 *  - access token: stateless signed token `v1.<sessionId>.<expiresAtMs>.<hmac>`, valid 15 minutes;
 *    the session row is still checked on every request so revocation is immediate;
 *  - refresh token: random, stored hashed, single-use, rotated on every refresh (30 days).
 *    Re-using an old refresh token means it was stolen → the whole session is revoked.
 */
export const ACCESS_TTL_MS = 15 * 60 * 1000;
export const REFRESH_TTL_MS = 30 * 24 * 3600 * 1000;

export interface TokenPair {
  accessToken: string;
  accessTokenExpiresAt: string;
  refreshToken: string;
  refreshTokenExpiresAt: string;
  sessionId: string;
}

export function signAccessToken(
  sessionId: string,
  now = Date.now(),
): { token: string; expiresAt: Date } {
  const exp = now + ACCESS_TTL_MS;
  const payload = `v1.${sessionId}.${exp}`;
  return { token: `${payload}.${hmac(`access:${payload}`)}`, expiresAt: new Date(exp) };
}

/** Returns the session id if the token is well-formed, correctly signed and not expired. */
export function verifyAccessToken(token: string, now = Date.now()): string | null {
  const parts = token.split(".");
  if (parts.length !== 4 || parts[0] !== "v1") return null;
  const [, sessionId, expStr, sig] = parts as [string, string, string, string];
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || exp < now) return null;
  const expected = hmac(`access:v1.${sessionId}.${expStr}`);
  return safeEqual(sig, expected) ? sessionId : null;
}

async function newRefreshToken(sessionId: string) {
  const token = `rt_${randomToken(32)}`;
  const expiresAt = new Date(Date.now() + REFRESH_TTL_MS);
  await prisma.refreshToken.create({ data: { sessionId, tokenHash: sha256(token), expiresAt } });
  return { token, expiresAt };
}

export async function issueMobileSession(
  userId: string,
  meta: { deviceName?: string | null; ip?: string | null; userAgent?: string | null } = {},
): Promise<TokenPair> {
  const session = await prisma.session.create({
    data: {
      userId,
      kind: "MOBILE",
      tokenHash: sha256(randomToken()),
      deviceName: meta.deviceName?.slice(0, 80) ?? null,
      expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
      ip: meta.ip ?? null,
      userAgent: meta.userAgent?.slice(0, 300) ?? null,
    },
  });
  const access = signAccessToken(session.id);
  const refresh = await newRefreshToken(session.id);
  return {
    accessToken: access.token,
    accessTokenExpiresAt: access.expiresAt.toISOString(),
    refreshToken: refresh.token,
    refreshTokenExpiresAt: refresh.expiresAt.toISOString(),
    sessionId: session.id,
  };
}

export async function refreshMobileSession(refreshToken: string): Promise<TokenPair> {
  const row = await prisma.refreshToken.findUnique({
    where: { tokenHash: sha256(refreshToken) },
    include: { session: true },
  });
  if (!row) throw new AppError("UNAUTHENTICATED", "Invalid refresh token. Sign in again.");
  if (row.usedAt) {
    // Token re-use → assume theft: kill the session everywhere.
    await prisma.session.update({ where: { id: row.sessionId }, data: { revokedAt: new Date() } });
    await audit(prisma, {
      actor: { userId: row.session.userId, role: "FARMER", orgId: null },
      action: "auth.refresh_token_reuse",
      entity: "Session",
      entityId: row.sessionId,
    });
    throw new AppError(
      "UNAUTHENTICATED",
      "This sign-in was revoked for your security. Sign in again.",
    );
  }
  if (row.expiresAt < new Date() || row.session.revokedAt || row.session.expiresAt < new Date()) {
    throw new AppError("UNAUTHENTICATED", "Your sign-in has expired. Sign in again.");
  }
  const user = await prisma.user.findUnique({ where: { id: row.session.userId } });
  if (!user || user.status === "SUSPENDED")
    throw new AppError("UNAUTHENTICATED", "This account is suspended.");

  const claimed = await prisma.refreshToken.updateMany({
    where: { id: row.id, usedAt: null },
    data: { usedAt: new Date() },
  });
  if (claimed.count !== 1) throw new AppError("UNAUTHENTICATED", "Refresh token already used.");
  await prisma.session.update({
    where: { id: row.sessionId },
    data: { lastSeenAt: new Date(), expiresAt: new Date(Date.now() + REFRESH_TTL_MS) },
  });
  const access = signAccessToken(row.sessionId);
  const refresh = await newRefreshToken(row.sessionId);
  return {
    accessToken: access.token,
    accessTokenExpiresAt: access.expiresAt.toISOString(),
    refreshToken: refresh.token,
    refreshTokenExpiresAt: refresh.expiresAt.toISOString(),
    sessionId: row.sessionId,
  };
}

export async function revokeSession(sessionId: string) {
  await prisma.session.updateMany({
    where: { id: sessionId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}
