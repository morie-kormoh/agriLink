import { otpRequestSchema } from "@agrilink/validation";
import { v1Public } from "@/server/api/v1";
import { requestOtp } from "@/server/auth/otp";
import { requestMeta } from "@/server/request";

/** POST { phone } → { data: { expiresInSec } }. Same answer for unknown numbers (no enumeration). */
export const POST = v1Public(async ({ body }) => {
  const { phone } = otpRequestSchema.parse(await body());
  const meta = await requestMeta();
  const r = await requestOtp(phone, "LOGIN", { ip: meta.ip });
  return { data: { expiresInSec: r.expiresInSec } };
});
