import { describe, expect, it } from "vitest";
import { MockAdapter } from "../mock";

const req = (to: string, key = `k-${to}`) => ({
  idempotencyKey: key,
  from: "FUND",
  to,
  amountLe: "100.00",
  narration: "test",
});

describe("MockAdapter", () => {
  it("succeeds and is idempotent on the key", async () => {
    const m = new MockAdapter();
    const a = await m.disburse(req("+23276123456"));
    const b = await m.disburse(req("+23276123456"));
    expect(a.status).toBe("SUCCESS");
    expect(b.providerRef).toBe(a.providerRef);
  });

  it("simulates retryable then successful transfers (…999)", async () => {
    const m = new MockAdapter();
    expect((await m.disburse(req("+23276123999"))).retryable).toBe(true);
    expect((await m.disburse(req("+23276123999"))).status).toBe("FAILED");
    expect((await m.disburse(req("+23276123999"))).status).toBe("SUCCESS");
  });

  it("simulates permanent failures (…998) and async confirmation (…997)", async () => {
    const m = new MockAdapter();
    expect(await m.disburse(req("+23276123998"))).toMatchObject({
      status: "FAILED",
      retryable: false,
    });
    expect((await m.disburse(req("+23276123997"))).status).toBe("PENDING");
    expect((await m.getStatus({ idempotencyKey: "k-+23276123997" }))?.status).toBe("SUCCESS");
    expect(await m.getStatus({ idempotencyKey: "unknown" })).toBeNull();
  });

  it("verifies callback signatures", () => {
    const m = new MockAdapter({ callbackSecret: "s" });
    const body = JSON.stringify({ idempotencyKey: "k", status: "SUCCESS" });
    expect(m.verifyCallback({ "x-mock-signature": m.sign(body) }, body)).toBe(true);
    expect(m.verifyCallback({ "x-mock-signature": "bad" }, body)).toBe(false);
    expect(m.parseCallback(body)).toMatchObject({ idempotencyKey: "k", status: "SUCCESS" });
    expect(m.parseCallback("not json")).toBeNull();
  });
});
