"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { OrgType } from "@agrilink/db/enums";
import { phoneSL } from "@agrilink/validation";
import { requireActor } from "@/server/auth/actor";
import {
  adminUnlockPin,
  createOrganization,
  setOrganizationActive,
  setUserStatus,
} from "@/server/admin/service";
import { type ActionResult, toActionError } from "@/server/errors";

export async function setUserStatusAction(
  userId: string,
  status: "ACTIVE" | "SUSPENDED",
): Promise<ActionResult> {
  try {
    const { actor } = await requireActor(["SUPER_ADMIN"]);
    await setUserStatus(actor, userId, status);
    revalidatePath("/admin/users");
    return { ok: true };
  } catch (e) {
    return toActionError(e);
  }
}

export async function unlockPinAction(userId: string): Promise<ActionResult> {
  try {
    const { actor } = await requireActor(["SUPER_ADMIN"]);
    await adminUnlockPin(actor, userId);
    revalidatePath("/admin/users");
    return { ok: true };
  } catch (e) {
    return toActionError(e);
  }
}

const createOrgSchema = z.object({
  name: z.string().trim().min(3).max(120),
  type: z.enum(OrgType),
  districtId: z.string().optional().nullable(),
  adminPhone: z
    .string()
    .optional()
    .nullable()
    .transform((v) => (v ? v : null))
    .pipe(z.union([z.null(), phoneSL])),
  adminName: z.string().trim().max(120).optional().nullable(),
});

export async function createOrganizationAction(
  input: z.input<typeof createOrgSchema>,
): Promise<ActionResult<{ id: string }>> {
  try {
    const data = createOrgSchema.parse(input);
    const { actor } = await requireActor(["SUPER_ADMIN"]);
    const org = await createOrganization(actor, data);
    revalidatePath("/admin/organizations");
    return { ok: true, data: { id: org.id } };
  } catch (e) {
    return toActionError(e);
  }
}

export async function setOrganizationActiveAction(
  orgId: string,
  active: boolean,
): Promise<ActionResult> {
  try {
    const { actor } = await requireActor(["SUPER_ADMIN"]);
    await setOrganizationActive(actor, orgId, active);
    revalidatePath("/admin/organizations");
    return { ok: true };
  } catch (e) {
    return toActionError(e);
  }
}
