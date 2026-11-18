import { setPinSchema } from "@agripay/validation";
import { v1 } from "@/server/api/v1";
import { setPin } from "@/server/auth/pin";

/** POST { currentPin?, pin, confirmPin } → set or change the transaction PIN. */
export const POST = v1(async ({ current, body }) => {
  const d = setPinSchema.parse(await body());
  await setPin(current.user.id, d.pin, d.currentPin);
  return { data: { ok: true } };
});
