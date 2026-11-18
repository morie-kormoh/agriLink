import { z } from "zod";
import { otpVerifySchema } from "@agripay/validation";
import { v1Public } from "@/server/api/v1";
import { loginMobileWithOtp } from "@/server/auth/login";
import { requestMeta } from "@/server/request";

const schema = otpVerifySchema.extend({ deviceName: z.string().trim().max(80).optional() });

/** POST { phone, code, deviceName? } → access + refresh tokens and the user's workspaces. */
export const POST = v1Public(async ({ body }) => {
  const { phone, code, deviceName } = schema.parse(await body());
  const meta = await requestMeta();
  const r = await loginMobileWithOtp(phone, code, { ...meta, deviceName });
  return { data: r };
});
