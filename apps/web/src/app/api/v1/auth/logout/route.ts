import { v1 } from "@/server/api/v1";
import { revokeSession } from "@/server/auth/tokens";

/** POST → revokes this device's session (access and refresh tokens stop working). */
export const POST = v1(async ({ current }) => {
  await revokeSession(current.sessionId);
  return { data: { ok: true } };
});
