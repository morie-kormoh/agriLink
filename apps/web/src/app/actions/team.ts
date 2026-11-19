"use server";

import { revalidatePath } from "next/cache";
import { inviteMemberSchema } from "@agrilink/validation";
import { requireActor } from "@/server/auth/actor";
import { deactivateMembership, inviteMember, revokeInvitation } from "@/server/auth/invitations";
import { type ActionResult, toActionError } from "@/server/errors";

export async function inviteMemberAction(input: {
  phone: string;
  role: string;
  name?: string;
}): Promise<ActionResult<{ phone: string }>> {
  try {
    const data = inviteMemberSchema.parse(input);
    const { actor } = await requireActor();
    await inviteMember(actor, data);
    revalidatePath("/settings/team");
    return { ok: true, data: { phone: data.phone } };
  } catch (e) {
    return toActionError(e);
  }
}

export async function revokeInvitationAction(invitationId: string): Promise<ActionResult> {
  try {
    const { actor } = await requireActor();
    await revokeInvitation(actor, invitationId);
    revalidatePath("/settings/team");
    return { ok: true };
  } catch (e) {
    return toActionError(e);
  }
}

export async function removeMemberAction(membershipId: string): Promise<ActionResult> {
  try {
    const { actor } = await requireActor();
    await deactivateMembership(actor, membershipId);
    revalidatePath("/settings/team");
    return { ok: true };
  } catch (e) {
    return toActionError(e);
  }
}
