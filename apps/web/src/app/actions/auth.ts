"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@agrilink/db";
import { isLocale } from "@agrilink/i18n";
import {
  otpRequestSchema,
  otpVerifySchema,
  selectContextSchema,
  setPinSchema,
} from "@agrilink/validation";
import { ROLE_HOME } from "@agrilink/validation/permissions";
import { LOCALE_COOKIE } from "@/i18n/request";
import { audit } from "@/server/audit";
import { getSessionUser, listContexts, requireActor } from "@/server/auth/actor";
import { acceptInvitation } from "@/server/auth/invitations";
import { loginWithOtp } from "@/server/auth/login";
import { requestOtp } from "@/server/auth/otp";
import { setPin } from "@/server/auth/pin";
import { destroySession, revokeOtherSessions, setSessionContext } from "@/server/auth/session";
import { type ActionResult, AppError, toActionError } from "@/server/errors";
import { requestMeta } from "@/server/request";

export async function requestOtpAction(input: {
  phone: string;
}): Promise<ActionResult<{ phone: string }>> {
  try {
    const { phone } = otpRequestSchema.parse(input);
    const meta = await requestMeta();
    const locale = (await cookies()).get(LOCALE_COOKIE)?.value;
    await requestOtp(phone, "LOGIN", { ip: meta.ip, locale });
    return { ok: true, data: { phone } };
  } catch (e) {
    return toActionError(e);
  }
}

export async function verifyOtpAction(input: {
  phone: string;
  code: string;
  next?: string | null;
}): Promise<ActionResult<{ redirectTo: string }>> {
  try {
    const { phone, code } = otpVerifySchema.parse(input);
    const meta = await requestMeta();
    const result = await loginWithOtp(phone, code, { ...meta, next: input.next });
    return { ok: true, data: result };
  } catch (e) {
    return toActionError(e);
  }
}

export async function selectContextAction(input: {
  orgId: string | null;
  role: string;
  next?: string | null;
}): Promise<ActionResult<{ redirectTo: string }>> {
  try {
    const { orgId, role } = selectContextSchema.parse(input);
    const su = await getSessionUser();
    if (!su) throw new AppError("UNAUTHENTICATED", "Please sign in again.");
    const contexts = await listContexts(su.user.id);
    const match = contexts.find((c) => c.orgId === orgId && c.role === role);
    if (!match) throw new AppError("FORBIDDEN", "You do not have access to that workspace.");
    await setSessionContext(su.session.id, orgId, role);
    await audit(prisma, {
      actor: { userId: su.user.id, role, orgId },
      action: "auth.context_selected",
      entity: "Session",
      entityId: su.session.id,
    });
    const next =
      input.next && input.next.startsWith("/") && !input.next.startsWith("//") ? input.next : null;
    return { ok: true, data: { redirectTo: next ?? ROLE_HOME[role] } };
  } catch (e) {
    return toActionError(e);
  }
}

export async function logoutAction(): Promise<void> {
  await destroySession();
  redirect("/login");
}

export async function setLocaleAction(locale: string): Promise<void> {
  if (!isLocale(locale)) return;
  (await cookies()).set(LOCALE_COOKIE, locale, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });
  const su = await getSessionUser();
  if (su) await prisma.user.update({ where: { id: su.user.id }, data: { locale } });
}

export async function setPinAction(input: {
  currentPin?: string;
  pin: string;
  confirmPin: string;
}): Promise<ActionResult> {
  try {
    const data = setPinSchema.parse(input);
    const { user } = await requireActor();
    await setPin(user.id, data.pin, data.currentPin);
    return { ok: true };
  } catch (e) {
    return toActionError(e);
  }
}

export async function revokeOtherSessionsAction(): Promise<ActionResult<{ count: number }>> {
  try {
    const { user, sessionId } = await requireActor();
    const count = await revokeOtherSessions(user.id, sessionId);
    return { ok: true, data: { count } };
  } catch (e) {
    return toActionError(e);
  }
}

export async function acceptInvitationAction(
  token: string,
): Promise<ActionResult<{ redirectTo: string }>> {
  try {
    const su = await getSessionUser();
    if (!su) throw new AppError("UNAUTHENTICATED", "Please sign in first.");
    const { orgId, role } = await acceptInvitation(token, su.user.id);
    await setSessionContext(su.session.id, orgId, role);
    return { ok: true, data: { redirectTo: ROLE_HOME[role] } };
  } catch (e) {
    return toActionError(e);
  }
}
