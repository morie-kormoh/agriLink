import { NextResponse } from "next/server";
import { verifyPinSchema } from "@agrilink/validation";
import { api, requireInternalToken } from "@/server/api";
import { verifyPinByPhone } from "@/server/auth/pin";

/**
 * Internal: used by apps/ussd to check a farmer's PIN.
 * Authorization: Bearer INTERNAL_API_TOKEN
 */
export const POST = api(async (request: Request) => {
  requireInternalToken(request);
  const { phone, pin } = verifyPinSchema.parse(await request.json());
  const r = await verifyPinByPhone(phone, pin);
  return NextResponse.json(
    r.ok
      ? { ok: true, userId: r.userId }
      : { ok: false, locked: r.locked, remaining: r.remaining, lockedUntil: r.lockedUntil ?? null },
  );
});
