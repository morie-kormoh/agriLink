import { NextResponse } from "next/server";
import { prisma } from "@agripay/db";
import { selectContextSchema } from "@agripay/validation";
import { api } from "@/server/api";
import { readJson } from "@/server/api/v1";
import { audit } from "@/server/audit";
import { getSessionUser, listContexts } from "@/server/auth/actor";
import { setSessionContext } from "@/server/auth/session";
import { AppError } from "@/server/errors";

/** POST { orgId, role } → switch workspace for this session/device. */
export const POST = api(async (request: Request) => {
  const su = await getSessionUser();
  if (!su) throw new AppError("UNAUTHENTICATED", "Please sign in again.");
  const { orgId, role } = selectContextSchema.parse(await readJson(request));
  const match = (await listContexts(su.user.id)).find((c) => c.orgId === orgId && c.role === role);
  if (!match) throw new AppError("FORBIDDEN", "You do not have access to that workspace.");
  await setSessionContext(su.session.id, orgId, role);
  await audit(prisma, {
    actor: { userId: su.user.id, role, orgId },
    action: "auth.context_selected",
    entity: "Session",
    entityId: su.session.id,
  });
  return NextResponse.json({ data: { activeContext: match } });
});
