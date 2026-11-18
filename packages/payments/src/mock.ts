import { createHmac, timingSafeEqual } from "node:crypto";
import type { DisburseRequest, PaymentAdapter, ProviderResult } from "./adapter";

/**
 * Mock mobile-money provider for demos and tests. Idempotent on idempotencyKey.
 *
 * Special destination numbers (last 3 digits) let you demo failures:
 *   …999 → temporary failure (TIMEOUT, retryable) on the first 2 attempts, then success
 *   …998 → permanent failure (ACCOUNT_NOT_FOUND)
 *   …997 → PENDING; becomes SUCCESS on the next status check (simulates async confirmation)
 * Everything else succeeds immediately.
 */
export class MockAdapter implements PaymentAdapter {
  readonly code = "MOCK" as const;
  private transfers = new Map<string, ProviderResult & { attempts: number }>();
  private seq = 0;

  constructor(
    private readonly opts: { callbackSecret?: string; names?: Record<string, string> } = {},
  ) {}

  async lookupAccountName(msisdn: string) {
    const name = this.opts.names?.[msisdn];
    return name ? { name } : null;
  }

  async disburse(req: DisburseRequest): Promise<ProviderResult> {
    const existing = this.transfers.get(req.idempotencyKey);
    if (existing && existing.status !== "FAILED") return strip(existing);
    const attempts = (existing?.attempts ?? 0) + 1;
    const providerRef =
      existing?.providerRef ??
      `MOCK-${Date.now().toString(36).toUpperCase()}-${(++this.seq).toString().padStart(4, "0")}`;
    let result: ProviderResult;
    if (req.to.endsWith("998")) {
      result = {
        status: "FAILED",
        providerRef,
        errorCode: "ACCOUNT_NOT_FOUND",
        error: "Destination wallet not found",
        retryable: false,
      };
    } else if (req.to.endsWith("999") && attempts <= 2) {
      result = {
        status: "FAILED",
        providerRef,
        errorCode: "TIMEOUT",
        error: "Provider timeout",
        retryable: true,
      };
    } else if (req.to.endsWith("997")) {
      result = { status: "PENDING", providerRef };
    } else {
      result = { status: "SUCCESS", providerRef };
    }
    this.transfers.set(req.idempotencyKey, { ...result, attempts, raw: { mock: true, req } });
    return result;
  }

  async getStatus(ref: {
    providerRef?: string | null;
    idempotencyKey: string;
  }): Promise<ProviderResult | null> {
    const t = this.transfers.get(ref.idempotencyKey);
    if (!t) return null;
    if (t.status === "PENDING") {
      // Async confirmation arrives on the first poll.
      t.status = "SUCCESS";
    }
    return strip(t);
  }

  sign(rawBody: string): string {
    return createHmac("sha256", this.opts.callbackSecret ?? "mock-secret")
      .update(rawBody)
      .digest("hex");
  }

  verifyCallback(headers: Record<string, string>, rawBody: string): boolean {
    const given = headers["x-mock-signature"] ?? "";
    const expected = this.sign(rawBody);
    return (
      given.length === expected.length && timingSafeEqual(Buffer.from(given), Buffer.from(expected))
    );
  }

  parseCallback(rawBody: string) {
    try {
      const body = JSON.parse(rawBody) as {
        idempotencyKey?: string;
        providerRef?: string;
        status?: string;
        errorCode?: string;
      };
      if (body.status !== "SUCCESS" && body.status !== "FAILED" && body.status !== "PENDING")
        return null;
      return {
        status: body.status,
        providerRef: body.providerRef,
        idempotencyKey: body.idempotencyKey,
        errorCode: body.errorCode,
        retryable: body.status === "FAILED" ? false : undefined,
      } satisfies ProviderResult & { idempotencyKey?: string };
    } catch {
      return null;
    }
  }

  /** Test helper: forget all transfers. */
  reset() {
    this.transfers.clear();
  }
}

function strip(t: ProviderResult & { attempts?: number }): ProviderResult {
  const { attempts: _a, ...rest } = t;
  return rest;
}
