import { NextResponse } from "next/server";
import { api } from "@/server/api";
import { getSessionUser, listContexts } from "@/server/auth/actor";
import { AppError } from "@/server/errors";

/** GET → the signed-in user, their workspaces and the active one (works before a workspace is chosen). */
export const GET = api(async () => {
  const su = await getSessionUser();
  if (!su) throw new AppError("UNAUTHENTICATED", "Please sign in again.");
  const contexts = await listContexts(su.user.id);
  return NextResponse.json({
    data: {
      user: {
        id: su.user.id,
        phone: su.user.phone,
        name: su.user.name,
        locale: su.user.locale,
        pinSet: !!su.user.pinHash,
        kycTier: su.user.kycTier,
      },
      contexts,
      activeContext: su.session.activeRole
        ? { orgId: su.session.activeOrgId, role: su.session.activeRole }
        : null,
    },
  });
});
