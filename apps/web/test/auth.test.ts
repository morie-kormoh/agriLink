import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@agripay/db";
import {
  devFixedOtp,
  OTP_MAX_ATTEMPTS,
  OTP_MAX_SENDS,
  requestOtp,
  verifyOtp,
} from "@/server/auth/otp";
import { PIN_LOCK_MS, setPin, verifyPinForUser } from "@/server/auth/pin";
import { INACTIVITY_TIMEOUT_MS, isSessionValid } from "@/server/auth/session";
import { acceptInvitation, getInvitationByToken, inviteMember } from "@/server/auth/invitations";
import { audit, maskForAudit, verifyAuditChain } from "@/server/audit";
import { AppError } from "@/server/errors";
import { smsOutbox } from "@/server/sms";
import { makeOrgWithMember, nextPhone, resetDb } from "./helpers";

beforeEach(resetDb);
afterAll(() => prisma.$disconnect());

function lastCode(phone: string): string {
  const msg = [...smsOutbox()].reverse().find((m) => m.to === phone && m.kind === "otp");
  const code = msg?.body.match(/\b(\d{6})\b/)?.[1];
  if (!code) throw new Error("no OTP sent");
  return code;
}

describe("OTP", () => {
  it("sends a code to a known user and verifies it once", async () => {
    const user = await prisma.user.create({ data: { phone: nextPhone() } });
    const r = await requestOtp(user.phone);
    expect(r.sent).toBe(true);
    const code = lastCode(user.phone);
    await expect(verifyOtp(user.phone, code)).resolves.toBeUndefined();
    // single use
    await expect(verifyOtp(user.phone, code)).rejects.toBeInstanceOf(AppError);
    // stored hashed, never plain
    const stored = await prisma.otpCode.findFirstOrThrow({ where: { phone: user.phone } });
    expect(stored.codeHash).not.toContain(code);
  });

  it("does not reveal unknown numbers and sends nothing", async () => {
    const phone = nextPhone();
    const r = await requestOtp(phone);
    expect(r.sent).toBe(false);
    expect(smsOutbox().filter((m) => m.to === phone)).toHaveLength(0);
  });

  it("only the newest code is valid", async () => {
    const user = await prisma.user.create({ data: { phone: nextPhone() } });
    await requestOtp(user.phone);
    const first = lastCode(user.phone);
    await requestOtp(user.phone);
    const second = lastCode(user.phone);
    if (first !== second) await expect(verifyOtp(user.phone, first)).rejects.toThrow();
    await expect(verifyOtp(user.phone, second)).resolves.toBeUndefined();
  });

  it(`locks after ${OTP_MAX_ATTEMPTS} wrong attempts`, async () => {
    const user = await prisma.user.create({ data: { phone: nextPhone() } });
    await requestOtp(user.phone);
    const good = lastCode(user.phone);
    const bad = good === "000000" ? "111111" : "000000";
    for (let i = 0; i < OTP_MAX_ATTEMPTS - 1; i++) {
      await expect(verifyOtp(user.phone, bad)).rejects.toMatchObject({ code: "VALIDATION" });
    }
    await expect(verifyOtp(user.phone, bad)).rejects.toMatchObject({ code: "LOCKED" });
    await expect(verifyOtp(user.phone, good)).rejects.toThrow();
  });

  it("expires after 5 minutes", async () => {
    const user = await prisma.user.create({ data: { phone: nextPhone() } });
    await requestOtp(user.phone);
    const code = lastCode(user.phone);
    await prisma.otpCode.updateMany({
      where: { phone: user.phone },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    await expect(verifyOtp(user.phone, code)).rejects.toMatchObject({
      messageKey: "auth.errors.invalidCode",
    });
  });

  it(`rate-limits to ${OTP_MAX_SENDS} sends per window`, async () => {
    const user = await prisma.user.create({ data: { phone: nextPhone() } });
    for (let i = 0; i < OTP_MAX_SENDS; i++) await requestOtp(user.phone);
    await expect(requestOtp(user.phone)).rejects.toMatchObject({ code: "RATE_LIMITED" });
  });
});

describe("DEV_OTP_CODE", () => {
  const env = process.env as Record<string, string | undefined>;
  const saved = { NODE_ENV: env.NODE_ENV, DEV_OTP_CODE: env.DEV_OTP_CODE };
  afterAll(() => Object.assign(env, saved));

  it("is used only in development and only when it is 6 digits", () => {
    env.DEV_OTP_CODE = "123456";
    env.NODE_ENV = "development";
    expect(devFixedOtp()).toBe("123456");
    env.NODE_ENV = "production";
    expect(devFixedOtp()).toBeNull();
    env.NODE_ENV = "test";
    expect(devFixedOtp()).toBeNull();
    env.NODE_ENV = "development";
    env.DEV_OTP_CODE = "12ab";
    expect(devFixedOtp()).toBeNull();
    Object.assign(env, saved);
  });
});

describe("PIN", () => {
  it("sets, verifies and locks after 3 wrong attempts", async () => {
    const user = await prisma.user.create({ data: { phone: nextPhone() } });
    await setPin(user.id, "4826");
    expect((await verifyPinForUser(user.id, "4826")).ok).toBe(true);

    expect(await verifyPinForUser(user.id, "1111")).toMatchObject({
      ok: false,
      locked: false,
      remaining: 2,
    });
    expect(await verifyPinForUser(user.id, "1111")).toMatchObject({
      ok: false,
      locked: false,
      remaining: 1,
    });
    expect(await verifyPinForUser(user.id, "1111")).toMatchObject({ ok: false, locked: true });
    // even the right PIN is refused while locked
    expect(await verifyPinForUser(user.id, "4826")).toMatchObject({ ok: false, locked: true });
    // after the lock window it works again
    expect(
      (await verifyPinForUser(user.id, "4826", new Date(Date.now() + PIN_LOCK_MS + 1000))).ok,
    ).toBe(true);
  });

  it("requires the current PIN to change it and rejects weak PINs", async () => {
    const user = await prisma.user.create({ data: { phone: nextPhone() } });
    await expect(setPin(user.id, "1234")).rejects.toThrow();
    await setPin(user.id, "4826");
    await expect(setPin(user.id, "7391")).rejects.toThrow(/current PIN/i);
    await setPin(user.id, "7391", "4826");
    expect((await verifyPinForUser(user.id, "7391")).ok).toBe(true);
    const stored = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(stored.pinHash).toMatch(/^\$argon2id\$/);
  });
});

describe("sessions", () => {
  const base = {
    revokedAt: null,
    createdAt: new Date(),
    lastSeenAt: new Date(),
    expiresAt: new Date(Date.now() + 3600_000),
  };
  it("rejects expired and revoked sessions", () => {
    expect(isSessionValid({ ...base, activeRole: "AGENT" })).toBe(true);
    expect(
      isSessionValid({ ...base, activeRole: "AGENT", expiresAt: new Date(Date.now() - 1) }),
    ).toBe(false);
    expect(isSessionValid({ ...base, activeRole: "AGENT", revokedAt: new Date() })).toBe(false);
  });
  it("applies the 30-minute inactivity timeout to lender/admin roles only", () => {
    const idle = new Date(Date.now() - INACTIVITY_TIMEOUT_MS - 1000);
    expect(isSessionValid({ ...base, lastSeenAt: idle, activeRole: "LENDER_OFFICER" })).toBe(false);
    expect(isSessionValid({ ...base, lastSeenAt: idle, activeRole: "AGENT" })).toBe(true);
  });
  it("limits SUPER_ADMIN sessions to 12 hours", () => {
    const old = new Date(Date.now() - 13 * 3600_000);
    expect(isSessionValid({ ...base, createdAt: old, activeRole: "SUPER_ADMIN" })).toBe(false);
  });
});

describe("invitations", () => {
  it("invites by phone and only that phone can accept", async () => {
    const { actor, org } = await makeOrgWithMember("COOPERATIVE", "COOP_ADMIN");
    const phone = nextPhone();
    const { url } = await inviteMember(actor, { phone, role: "AGENT", name: "New Agent" });
    const token = url.split("/invite/")[1]!;
    expect(smsOutbox().some((m) => m.to === phone && m.kind === "invite")).toBe(true);

    const inv = await getInvitationByToken(token);
    expect(inv?.usable).toBe(true);

    const stranger = await prisma.user.create({ data: { phone: nextPhone() } });
    await expect(acceptInvitation(token, stranger.id)).rejects.toMatchObject({ code: "FORBIDDEN" });

    const invited = await prisma.user.findUniqueOrThrow({ where: { phone } });
    expect(invited.status).toBe("INVITED");
    await expect(acceptInvitation(token, invited.id)).resolves.toEqual({
      orgId: org.id,
      role: "AGENT",
    });
    expect((await prisma.user.findUniqueOrThrow({ where: { phone } })).status).toBe("ACTIVE");
    await expect(acceptInvitation(token, invited.id)).rejects.toThrow(); // single use
  });

  it("blocks inviting roles the inviter may not grant", async () => {
    const { actor } = await makeOrgWithMember("COOPERATIVE", "COOP_ADMIN");
    await expect(
      inviteMember(actor, { phone: nextPhone(), role: "SUPER_ADMIN" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("audit log", () => {
  it("masks secrets and keeps a verifiable hash chain", async () => {
    expect(
      maskForAudit({
        pin: "1234",
        phone: "+23276123456",
        nin: "AB123456",
        nested: { codeHash: "x" },
      }),
    ).toEqual({
      pin: "***",
      phone: "+23276***456",
      nin: "***456",
      nested: { codeHash: "***" },
    });
    for (let i = 0; i < 5; i++) {
      await audit(prisma, {
        action: "test.event",
        entity: "Test",
        entityId: String(i),
        after: { b: i, a: { z: 1, y: [2, 1] } },
      });
    }
    expect(await verifyAuditChain()).toMatchObject({ ok: true, checked: 5 });
  });

  it("is append-only at the database level", async () => {
    await audit(prisma, { action: "test.event", entity: "Test", entityId: "x" });
    await expect(prisma.auditLog.updateMany({ data: { action: "tampered" } })).rejects.toThrow(
      /append-only/,
    );
    await expect(prisma.auditLog.deleteMany({})).rejects.toThrow(/append-only/);
  });
});
