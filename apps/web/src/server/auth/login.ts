import "server-only";
import { prisma } from "@agrilink/db";
import { ROLE_HOME } from "@agrilink/validation/permissions";
import { audit } from "../audit";
import { AppError } from "../errors";
import { listContexts } from "./actor";
import { verifyOtp } from "./otp";
import { createSession, setSessionContext } from "./session";
import { type TokenPair, issueMobileSession } from "./tokens";

/** Verify an OTP and return the user (shared by web and mobile sign-in). */
async function authenticateOtp(phone: string, code: string) {
  await verifyOtp(phone, code, "LOGIN");
  const user = await prisma.user.findUnique({ where: { phone } });
  // verifyOtp only succeeds for codes we issued, and we only issue codes to known users.
  if (!user)
    throw new AppError(
      "VALIDATION",
      "That code is wrong or has expired.",
      "auth.errors.invalidCode",
    );
  if (user.status === "SUSPENDED")
    throw new AppError("FORBIDDEN", "This account is suspended.", "auth.errors.suspended");
  await prisma.user.update({
    where: { id: user.id },
    data: { phoneVerified: true, lastLoginAt: new Date() },
  });
  return user;
}

/**
 * Web sign-in: verify an OTP, set the session cookie. If the user has exactly one workspace it is
 * selected automatically; otherwise they choose on /select-context.
 */
export async function loginWithOtp(
  phone: string,
  code: string,
  meta: { ip?: string | null; userAgent?: string | null; next?: string | null } = {},
): Promise<{ redirectTo: string }> {
  const user = await authenticateOtp(phone, code);
  const session = await createSession(user.id, meta);
  await audit(prisma, {
    actor: { userId: user.id, role: "FARMER", orgId: null },
    action: "auth.login",
    entity: "User",
    entityId: user.id,
    ip: meta.ip,
    userAgent: meta.userAgent,
  });

  const safeNext =
    meta.next && meta.next.startsWith("/") && !meta.next.startsWith("//") ? meta.next : null;
  if (safeNext?.startsWith("/invite/")) return { redirectTo: safeNext };

  const contexts = await listContexts(user.id);
  if (contexts.length === 1) {
    const only = contexts[0]!;
    await setSessionContext(session.id, only.orgId, only.role);
    return { redirectTo: safeNext ?? ROLE_HOME[only.role] };
  }
  return {
    redirectTo: safeNext
      ? `/select-context?next=${encodeURIComponent(safeNext)}`
      : "/select-context",
  };
}

/** Mobile sign-in: verify an OTP and issue an access/refresh token pair (single workspace auto-selected). */
export async function loginMobileWithOtp(
  phone: string,
  code: string,
  meta: { ip?: string | null; userAgent?: string | null; deviceName?: string | null } = {},
): Promise<
  TokenPair & {
    contexts: Awaited<ReturnType<typeof listContexts>>;
    activeContext: { orgId: string | null; role: string } | null;
  }
> {
  const user = await authenticateOtp(phone, code);
  const tokens = await issueMobileSession(user.id, meta);
  await audit(prisma, {
    actor: { userId: user.id, role: "FARMER", orgId: null },
    action: "auth.login_mobile",
    entity: "User",
    entityId: user.id,
    after: { deviceName: meta.deviceName ?? null },
    ip: meta.ip,
    userAgent: meta.userAgent,
  });
  const contexts = await listContexts(user.id);
  let activeContext: { orgId: string | null; role: string } | null = null;
  if (contexts.length === 1) {
    const only = contexts[0]!;
    await setSessionContext(tokens.sessionId, only.orgId, only.role);
    activeContext = { orgId: only.orgId, role: only.role };
  }
  return { ...tokens, contexts, activeContext };
}
