import "server-only";
import { type OtpPurpose, prisma } from "@agrilink/db";
import { t } from "@agrilink/i18n";
import { isDemoMode } from "../demo/flags";
import { AppError } from "../errors";
import { hmac, randomDigits, safeEqual } from "../crypto";
import { hitRateLimit } from "../rate-limit";
import { sendSms } from "../sms";

export const OTP_LENGTH = 6;
export const OTP_TTL_MS = 5 * 60 * 1000;
export const OTP_MAX_ATTEMPTS = 5;
export const OTP_MAX_SENDS = 3; // per phone per window
export const OTP_SEND_WINDOW_SEC = 15 * 60;
export const OTP_MAX_SENDS_PER_IP = 20;

export { isDemoMode };

/**
 * Fixed login code (DEV_OTP_CODE) for local development, or for a demo deployment with DEMO_MODE=true.
 * Never active in tests, and never in production unless DEMO_MODE is explicitly switched on.
 */
export function devFixedOtp(): string | null {
  if (process.env.NODE_ENV !== "development" && !isDemoMode()) return null;
  const code = process.env.DEV_OTP_CODE?.trim();
  return code && new RegExp(`^\\d{${OTP_LENGTH}}$`).test(code) ? code : null;
}

function codeHash(phone: string, purpose: OtpPurpose, code: string) {
  return hmac(`otp:${purpose}:${phone}:${code}`);
}

/** Create a new one-time code for (phone, purpose); any earlier unused code stops working. Returns the code to send. */
export async function issueOtpCode(phone: string, purpose: OtpPurpose): Promise<string> {
  const code = devFixedOtp() ?? randomDigits(OTP_LENGTH);
  await prisma.$transaction([
    // Only the newest code is valid.
    prisma.otpCode.updateMany({
      where: { phone, purpose, usedAt: null },
      data: { usedAt: new Date() },
    }),
    prisma.otpCode.create({
      data: {
        phone,
        purpose,
        codeHash: codeHash(phone, purpose, code),
        expiresAt: new Date(Date.now() + OTP_TTL_MS),
      },
    }),
  ]);
  return code;
}

/**
 * Issue a one-time code. Always resolves the same way whether or not the phone is
 * registered (no account enumeration); the SMS is only sent to known users.
 */
export async function requestOtp(
  phone: string,
  purpose: OtpPurpose = "LOGIN",
  opts: { ip?: string | null; locale?: string } = {},
): Promise<{ sent: boolean; expiresInSec: number }> {
  const perPhone = await hitRateLimit(`otp:phone:${phone}`, OTP_MAX_SENDS, OTP_SEND_WINDOW_SEC);
  const perIp = opts.ip
    ? await hitRateLimit(`otp:ip:${opts.ip}`, OTP_MAX_SENDS_PER_IP, OTP_SEND_WINDOW_SEC)
    : { allowed: true };
  if (!perPhone.allowed || !perIp.allowed) {
    throw new AppError(
      "RATE_LIMITED",
      "Too many code requests. Try again later.",
      "auth.errors.rateLimited",
    );
  }

  const user = await prisma.user.findUnique({
    where: { phone },
    select: { id: true, status: true, locale: true },
  });
  if (!user || user.status === "SUSPENDED") {
    return { sent: false, expiresInSec: OTP_TTL_MS / 1000 };
  }

  const code = await issueOtpCode(phone, purpose);

  const locale = opts.locale ?? user.locale;
  const body =
    locale === "kri"
      ? `AgriLink kod: ${code}. I go dɔn na 5 minit. Nɔ sheb am wit ɛnibɔdi.`
      : `Your AgriLink code is ${code}. It expires in 5 minutes. Never share it with anyone.`;
  await sendSms(phone, body, "otp");
  if (process.env.NODE_ENV === "development") {
    console.info(`🔐 [dev] OTP for ${phone}: ${code}  (${t("en", "auth.devHint")})`);
  }
  return { sent: true, expiresInSec: OTP_TTL_MS / 1000 };
}

/** Check a code; consumes it on success. Throws AppError on failure. */
export async function verifyOtp(
  phone: string,
  code: string,
  purpose: OtpPurpose = "LOGIN",
): Promise<void> {
  const otp = await prisma.otpCode.findFirst({
    where: { phone, purpose, usedAt: null },
    orderBy: { createdAt: "desc" },
  });
  if (!otp || otp.expiresAt < new Date()) {
    throw new AppError(
      "VALIDATION",
      "That code is wrong or has expired.",
      "auth.errors.invalidCode",
    );
  }
  if (otp.attempts >= OTP_MAX_ATTEMPTS) {
    throw new AppError(
      "LOCKED",
      "Too many wrong codes. Request a new code.",
      "auth.errors.tooManyAttempts",
    );
  }
  if (!safeEqual(otp.codeHash, codeHash(phone, purpose, code))) {
    const updated = await prisma.otpCode.update({
      where: { id: otp.id },
      data: { attempts: { increment: 1 } },
    });
    if (updated.attempts >= OTP_MAX_ATTEMPTS) {
      await prisma.otpCode.update({ where: { id: otp.id }, data: { usedAt: new Date() } });
      throw new AppError(
        "LOCKED",
        "Too many wrong codes. Request a new code.",
        "auth.errors.tooManyAttempts",
      );
    }
    throw new AppError(
      "VALIDATION",
      "That code is wrong or has expired.",
      "auth.errors.invalidCode",
    );
  }
  // Consume atomically (guards against double submit).
  const consumed = await prisma.otpCode.updateMany({
    where: { id: otp.id, usedAt: null },
    data: { usedAt: new Date() },
  });
  if (consumed.count !== 1) {
    throw new AppError(
      "VALIDATION",
      "That code is wrong or has expired.",
      "auth.errors.invalidCode",
    );
  }
}
