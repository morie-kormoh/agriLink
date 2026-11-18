import { createHmac, randomInt } from "node:crypto";
import type { Page } from "@playwright/test";
import { Redis } from "ioredis";
import { createPrismaClient } from "@agripay/db";

export const prisma = createPrismaClient();

/**
 * Plant a known OTP for a phone (same hashing as src/server/auth/otp.ts) so tests can sign in
 * without reading SMS. Uses AUTH_SECRET from the root .env.
 */
export async function plantOtp(
  phone: string,
  purpose: "LOGIN" | "VOUCHER_REDEEM" = "LOGIN",
): Promise<string> {
  const code = String(randomInt(100000, 999999));
  const secret = process.env.AUTH_SECRET!;
  const codeHash = createHmac("sha256", secret)
    .update(`otp:${purpose}:${phone}:${code}`)
    .digest("hex");
  await prisma.otpCode.updateMany({
    where: { phone, purpose, usedAt: null },
    data: { usedAt: new Date() },
  });
  await prisma.otpCode.create({
    data: { phone, purpose, codeHash, expiresAt: new Date(Date.now() + 5 * 60_000) },
  });
  return code;
}

/** Sign in through the real UI: phone → (planted) code. */
export async function signIn(page: Page, phone: string, national: string) {
  // Tests sign in many times; reset the OTP rate limiter for this phone first.
  const redis = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379");
  const keys = await redis.keys("ratelimit:otp:*");
  if (keys.length) await redis.del(...keys);
  redis.disconnect();
  await page.goto("/login");
  await page.getByLabel("Phone number").fill(national);
  await page.getByRole("button", { name: "Send code" }).click();
  await page.getByText("Enter the code").waitFor();
  const code = await plantOtp(phone);
  for (const [i, d] of [...code].entries()) {
    await page.getByLabel(`Digit ${i + 1}`).fill(d);
  }
}
