import "server-only";
import type { MobileMoneyProvider, ProviderCode } from "@agripay/db";
import { MockAdapter, type PaymentAdapter, ProviderNotConfiguredError } from "@agripay/payments";

const globalForAdapters = globalThis as unknown as { __agripayMock?: MockAdapter };

export function mockAdapter(): MockAdapter {
  globalForAdapters.__agripayMock ??= new MockAdapter({
    callbackSecret: process.env.PAYMENT_CALLBACK_SECRET ?? "mock-secret",
  });
  return globalForAdapters.__agripayMock;
}

export function paymentMode(): "mock" | "sandbox" | "live" {
  const m = process.env.PAYMENT_PROVIDER_MODE ?? "mock";
  return m === "sandbox" || m === "live" ? m : "mock";
}

/** Which rail carries a transfer to this wallet. In mock mode everything goes through the mock provider. */
export function providerForWallet(provider: MobileMoneyProvider | null | undefined): ProviderCode {
  if (paymentMode() === "mock") return "MOCK";
  return provider ?? "SAPS";
}

export function adapterFor(code: ProviderCode): PaymentAdapter {
  if (code === "MOCK") return mockAdapter();
  // Real adapters (Orange Money, Afrimoney, QMoney, SaPS) are added as API access is granted.
  throw new ProviderNotConfiguredError(code);
}
