import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@agripay/db";
import { OPENAPI_ENDPOINT_COUNT, buildOpenApi } from "@/server/api/openapi";
import {
  ACCESS_TTL_MS,
  issueMobileSession,
  refreshMobileSession,
  signAccessToken,
  verifyAccessToken,
} from "@/server/auth/tokens";
import { nextPhone, resetDb } from "./helpers";

beforeEach(resetDb);
afterAll(() => prisma.$disconnect());

describe("mobile tokens", () => {
  it("signs and verifies access tokens; rejects tampering and expiry", () => {
    const { token } = signAccessToken("sess_1");
    expect(verifyAccessToken(token)).toBe("sess_1");
    expect(verifyAccessToken(token.replace("sess_1", "sess_2"))).toBeNull();
    expect(verifyAccessToken(`${token.slice(0, -2)}xx`)).toBeNull();
    expect(verifyAccessToken(token, Date.now() + ACCESS_TTL_MS + 1000)).toBeNull();
    expect(verifyAccessToken("garbage")).toBeNull();
  });

  it("rotates refresh tokens and revokes the session when an old one is re-used", async () => {
    const user = await prisma.user.create({ data: { phone: nextPhone() } });
    const first = await issueMobileSession(user.id, { deviceName: "Tecno Spark" });
    const session = await prisma.session.findUniqueOrThrow({ where: { id: first.sessionId } });
    expect(session).toMatchObject({ kind: "MOBILE", deviceName: "Tecno Spark" });
    expect(verifyAccessToken(first.accessToken)).toBe(first.sessionId);

    const second = await refreshMobileSession(first.refreshToken);
    expect(second.sessionId).toBe(first.sessionId);
    expect(second.refreshToken).not.toBe(first.refreshToken);

    // Re-using the first (already rotated) token = theft → session revoked, new token dead too.
    await expect(refreshMobileSession(first.refreshToken)).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    expect((await prisma.session.findUniqueOrThrow({ where: { id: first.sessionId } })).revokedAt).not.toBeNull();
    await expect(refreshMobileSession(second.refreshToken)).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
  });

  it("refuses suspended users and unknown tokens", async () => {
    const user = await prisma.user.create({ data: { phone: nextPhone() } });
    const t = await issueMobileSession(user.id);
    await prisma.user.update({ where: { id: user.id }, data: { status: "SUSPENDED" } });
    await expect(refreshMobileSession(t.refreshToken)).rejects.toThrow(/suspended/);
    await expect(refreshMobileSession("rt_nope")).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
  });
});

describe("OpenAPI", () => {
  it("builds a valid-looking 3.1 document covering every endpoint", () => {
    const doc = buildOpenApi("http://localhost:3000");
    expect(doc.openapi).toBe("3.1.0");
    const ops = Object.values(doc.paths).reduce((n, p) => n + Object.keys(p).length, 0);
    expect(ops).toBe(OPENAPI_ENDPOINT_COUNT);
    const register = doc.paths["/farmers"]?.post as { requestBody: { content: { "application/json": { schema: { properties: Record<string, unknown> } } } } };
    expect(Object.keys(register.requestBody.content["application/json"].schema.properties ?? {})).toEqual(expect.arrayContaining([]));
    const purchase = doc.paths["/purchases"]?.post as { requestBody: { content: { "application/json": { schema: { properties: Record<string, unknown> } } } } };
    expect(purchase.requestBody.content["application/json"].schema.properties).toHaveProperty("farmerId");
  });

  it("every documented path is served by a route file", async () => {
    const { readdirSync, statSync } = await import("node:fs");
    const path = await import("node:path");
    const root = path.resolve(import.meta.dirname, "../src/app/api/v1");
    const routes: RegExp[] = [];
    const walk = (dir: string, rel: string[]) => {
      for (const name of readdirSync(dir)) {
        const full = path.join(dir, name);
        if (statSync(full).isDirectory()) walk(full, [...rel, name]);
        else if (name === "route.ts") routes.push(new RegExp(`^/${rel.map((s) => (s.startsWith("[") ? "[^/]+" : s)).join("/")}$`));
      }
    };
    walk(root, []);
    const doc = buildOpenApi("http://localhost:3000");
    const missing = Object.keys(doc.paths).filter((p) => !routes.some((r) => r.test(p.replace(/\{\w+\}/g, "X"))));
    expect(missing).toEqual([]);
  });
});

describe("internal token", () => {
  it("accepts INTERNAL_API_TOKEN or a long CRON_SECRET (Vercel Cron), nothing else", async () => {
    const { requireInternalToken } = await import("@/server/api");
    const req = (t: string) => new Request("http://x/api/internal/jobs/daily", { headers: { authorization: `Bearer ${t}` } });
    const saved = process.env.CRON_SECRET;
    process.env.CRON_SECRET = "cron-secret-of-sufficient-length";
    expect(() => requireInternalToken(req("cron-secret-of-sufficient-length"))).not.toThrow();
    expect(() => requireInternalToken(req("wrong"))).toThrow();
    process.env.CRON_SECRET = "short";
    expect(() => requireInternalToken(req("short"))).toThrow();
    process.env.CRON_SECRET = saved;
  });
});
