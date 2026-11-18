import { describe, expect, it } from "vitest";
import { buildApp } from "./app";

describe("ussd skeleton", () => {
  it("answers health checks", async () => {
    const app = buildApp();
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ status: "ok" });
  });

  it("ends the session with a placeholder and stays under 160 chars", async () => {
    const app = buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/ussd/callback",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      payload: "sessionId=abc&serviceCode=*123%23&phoneNumber=%2B23276123456&text=",
    });
    expect(res.body.startsWith("END ")).toBe(true);
    expect(res.body.length).toBeLessThanOrEqual(160);
  });
});
