import { NextResponse } from "next/server";
import { otpRequestSchema } from "@agripay/validation";
import { api } from "@/server/api";
import { requestOtp } from "@/server/auth/otp";
import { requestMeta } from "@/server/request";

/** POST { phone } → always { ok: true } (no account enumeration). Rate limited. */
export const POST = api(async (request: Request) => {
  const { phone } = otpRequestSchema.parse(await request.json());
  const meta = await requestMeta();
  const r = await requestOtp(phone, "LOGIN", { ip: meta.ip });
  return NextResponse.json({ ok: true, expiresInSec: r.expiresInSec });
});
