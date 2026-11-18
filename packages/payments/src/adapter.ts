/**
 * Provider adapter interface (module 04). One implementation per rail:
 * Orange Money, Afrimoney, QMoney, SaPS/bank — plus the MockAdapter for demos and tests.
 * Adapters must be idempotent on `idempotencyKey` (same key → same transfer, never a second one).
 */
export type ProviderCode = "MOCK" | "ORANGE_MONEY" | "AFRIMONEY" | "QMONEY" | "SAPS" | "BANK";

export type ProviderStatus = "PENDING" | "SUCCESS" | "FAILED";

export interface ProviderResult {
  status: ProviderStatus;
  providerRef?: string;
  /** Machine-readable failure code, e.g. INSUFFICIENT_FUNDS, ACCOUNT_NOT_FOUND, TIMEOUT */
  errorCode?: string;
  error?: string;
  /** Whether trying again later may succeed */
  retryable?: boolean;
  raw?: unknown;
}

export interface DisburseRequest {
  idempotencyKey: string;
  from: string;
  to: string;
  amountLe: string;
  narration: string;
}

export interface PaymentAdapter {
  readonly code: ProviderCode;
  lookupAccountName(msisdn: string): Promise<{ name: string } | null>;
  disburse(req: DisburseRequest): Promise<ProviderResult>;
  /** Look up a transfer by provider ref or our idempotency key. Must be called before any re-send. */
  getStatus(ref: {
    providerRef?: string | null;
    idempotencyKey: string;
  }): Promise<ProviderResult | null>;
  verifyCallback(headers: Record<string, string>, rawBody: string): boolean;
  parseCallback(rawBody: string): (ProviderResult & { idempotencyKey?: string }) | null;
}

export class ProviderNotConfiguredError extends Error {
  constructor(code: ProviderCode) {
    super(
      `Payment provider ${code} is not configured yet (PAYMENT_PROVIDER_MODE=mock uses the mock adapter).`,
    );
    this.name = "ProviderNotConfiguredError";
  }
}
