"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@agrilink/db";
import { ROLE_HOME } from "@agrilink/validation/permissions";
import { audit } from "@/server/audit";
import { getSessionUser, listContexts } from "@/server/auth/actor";
import { createSession, setSessionContext } from "@/server/auth/session";
import { isDemoMode } from "@/server/demo/flags";
import { personaByKey } from "@/server/demo/personas";
import { resetDemo } from "@/server/demo/reset";
import { type ActionResult, AppError, toActionError } from "@/server/errors";
import { requestMeta } from "@/server/request";

/** Demo only: one-click sign-in as one of the five story personas (no OTP). */
export async function demoSignInAction(key: string): Promise<ActionResult<{ redirectTo: string }>> {
  try {
    if (!isDemoMode())
      throw new AppError("FORBIDDEN", "Demo sign-in is only available on the demo site.");
    const persona = personaByKey(key);
    if (!persona) throw new AppError("NOT_FOUND", "Unknown demo persona.");
    const user = await prisma.user.findUnique({ where: { phone: persona.phone } });
    if (!user || user.status === "SUSPENDED")
      throw new AppError("VALIDATION", "This demo user is missing — run the seed first.");
    const context = (await listContexts(user.id)).find((c) => c.role === persona.role);
    if (!context)
      throw new AppError(
        "VALIDATION",
        `This demo user has no ${persona.role} workspace — run the seed first.`,
      );
    const meta = await requestMeta();
    const session = await createSession(user.id, meta);
    await setSessionContext(session.id, context.orgId, context.role);
    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    await audit(prisma, {
      actor: { userId: user.id, role: context.role, orgId: context.orgId },
      action: "auth.login_demo",
      entity: "User",
      entityId: user.id,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
    return { ok: true, data: { redirectTo: ROLE_HOME[context.role] } };
  } catch (e) {
    return toActionError(e);
  }
}

/** Demo only: back to the start of the story (docs/mvp/demo-script.md). */
export async function resetDemoAction(): Promise<ActionResult<{ score: number; band: string }>> {
  try {
    const su = await getSessionUser().catch(() => null);
    const by = su?.session.activeRole
      ? { userId: su.user.id, role: su.session.activeRole, orgId: su.session.activeOrgId }
      : null;
    const r = await resetDemo(by);
    revalidatePath("/", "layout");
    return { ok: true, data: { score: r.score, band: r.band } };
  } catch (e) {
    return toActionError(e);
  }
}
