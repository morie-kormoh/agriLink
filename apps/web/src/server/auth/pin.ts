import "server-only";
import { hash, verify } from "@node-rs/argon2";
import { prisma } from "@agripay/db";
import { pinSchema } from "@agripay/validation";
import { audit } from "../audit";
import { AppError } from "../errors";
import { sendSms } from "../sms";

export const PIN_MAX_ATTEMPTS = 3;
export const PIN_LOCK_MS = 30 * 60 * 1000;

// argon2id, OWASP-recommended baseline parameters.
const ARGON_OPTS = { memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;

export async function hashPin(pin: string): Promise<string> {
  return hash(pin, ARGON_OPTS);
}

/**
 * Set or change a user's PIN. Changing an existing PIN requires the current PIN
 * (a forgotten PIN is reset by OTP + co-op/agent confirmation — module 13 support flow).
 */
export async function setPin(
  userId: string,
  newPin: string,
  currentPin?: string | null,
): Promise<void> {
  pinSchema.parse(newPin);
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (user.pinHash) {
    if (!currentPin) throw new AppError("VALIDATION", "Enter your current PIN.");
    const ok = await verifyPinForUser(userId, currentPin);
    if (!ok.ok) {
      throw new AppError(
        ok.locked ? "LOCKED" : "VALIDATION",
        ok.locked ? "PIN locked. Try again later." : "Current PIN is wrong.",
      );
    }
  }
  const pinHash = await hashPin(newPin);
  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: userId },
      data: { pinHash, pinFailedCount: 0, pinLockedUntil: null },
    });
    await audit(tx, {
      actor: { userId, role: "FARMER", orgId: null },
      action: user.pinHash ? "auth.pin_changed" : "auth.pin_set",
      entity: "User",
      entityId: userId,
    });
  });
  if (user.pinHash) {
    await sendSms(
      user.phone,
      "AgriPay: your PIN was changed. If this wasn't you, contact your cooperative or AgriPay support now.",
      "security",
    );
  }
}

export type PinCheck =
  { ok: true } | { ok: false; locked: boolean; remaining: number; lockedUntil?: Date };

/** Verify a PIN with lockout after PIN_MAX_ATTEMPTS wrong attempts. */
export async function verifyPinForUser(
  userId: string,
  pin: string,
  now = new Date(),
): Promise<PinCheck> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (!user.pinHash) return { ok: false, locked: false, remaining: 0 };
  if (user.pinLockedUntil && user.pinLockedUntil > now) {
    return { ok: false, locked: true, remaining: 0, lockedUntil: user.pinLockedUntil };
  }

  const valid = /^\d{4,5}$/.test(pin) && (await verify(user.pinHash, pin));
  if (valid) {
    if (user.pinFailedCount > 0 || user.pinLockedUntil) {
      await prisma.user.update({
        where: { id: userId },
        data: { pinFailedCount: 0, pinLockedUntil: null },
      });
    }
    return { ok: true };
  }

  // A lock that has expired starts a fresh count.
  const previous = user.pinLockedUntil && user.pinLockedUntil <= now ? 0 : user.pinFailedCount;
  const failed = previous + 1;
  const lock = failed >= PIN_MAX_ATTEMPTS;
  const lockedUntil = lock ? new Date(now.getTime() + PIN_LOCK_MS) : null;
  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: userId },
      data: { pinFailedCount: lock ? 0 : failed, pinLockedUntil: lockedUntil },
    });
    if (lock) {
      await audit(tx, {
        actor: { userId, role: "FARMER", orgId: null },
        action: "auth.pin_locked",
        entity: "User",
        entityId: userId,
        after: { lockedUntil },
      });
    }
  });
  if (lock) {
    await sendSms(
      user.phone,
      "AgriPay: your PIN is locked for 30 minutes after 3 wrong attempts. If this wasn't you, contact your cooperative.",
      "security",
    );
  }
  return lock
    ? { ok: false, locked: true, remaining: 0, lockedUntil: lockedUntil ?? undefined }
    : { ok: false, locked: false, remaining: PIN_MAX_ATTEMPTS - failed };
}

export async function verifyPinByPhone(
  phone: string,
  pin: string,
): Promise<PinCheck & { userId?: string }> {
  const user = await prisma.user.findUnique({
    where: { phone },
    select: { id: true, status: true },
  });
  if (!user || user.status === "SUSPENDED") return { ok: false, locked: false, remaining: 0 };
  return { ...(await verifyPinForUser(user.id, pin)), userId: user.id };
}

/** Admin action: clear a PIN lock. */
export async function unlockPin(actorUserId: string, userId: string) {
  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: userId },
      data: { pinFailedCount: 0, pinLockedUntil: null },
    });
    await audit(tx, {
      actor: { userId: actorUserId, role: "SUPER_ADMIN", orgId: null },
      action: "auth.pin_unlocked",
      entity: "User",
      entityId: userId,
    });
  });
}
