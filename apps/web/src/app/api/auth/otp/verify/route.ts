import { NextResponse } from "next/server";
import { otpVerifySchema } from "@agrilink/validation";
import { api } from "@/server/api";
import { loginWithOtp } from "@/server/auth/login";
import { requestMeta } from "@/server/request";

/** POST { phone, code } → sets the session cookie, returns where to go next. */
export const POST = api(async (request: Request) => {
  const { phone, code } = otpVerifySchema.parse(await request.json());
  const meta = await requestMeta();
  const result = await loginWithOtp(phone, code, meta);
  return NextResponse.json({ ok: true, ...result });
});
