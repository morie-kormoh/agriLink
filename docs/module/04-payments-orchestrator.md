# Module 04 — Payments Orchestrator & Ledger (TenkiPay)

## 1. Purpose

Move money **safely and traceably** between buyers, farmers, savings custodians, lenders, co-ops and agro-dealers, and apply the **Smart Split waterfall** that makes AgriLink different from a wallet.

All mobile money goes through **one integration: TenkiPay**, a Sierra Leonean payment gateway (Korlie Limited). TenkiPay gives AgriLink a single API, a single signing scheme and a single set of webhooks for the three networks farmers use:

| Network                                    | AgriLink `WalletNetwork` | TenkiPay destination | Status in TenkiPay's public docs (Nov 2026)  |
| ------------------------------------------ | ------------------------ | -------------------- | -------------------------------------------- |
| Orange Money                               | `ORANGE_MONEY`           | `ORANGE_MONEY`       | Documented                                   |
| Qcell Money (QMoney)                       | `QMONEY`                 | `QMONEY`             | Documented                                   |
| Africell Money (formerly Afrimoney)        | `AFRIMONEY`              | `AFRICELL_MONEY`     | **Not yet listed — confirm with TenkiPay** ⚠ |
| TenkiPay wallet (co-ops, lenders, dealers) | `TENKIPAY`               | `TENKIPAY`           | Documented                                   |

AgriLink **never holds customer funds**. Every transfer is made from the paying organisation's **own TenkiPay business account**; AgriLink only instructs TenkiPay on its behalf and keeps a **double-entry ledger** that mirrors what TenkiPay confirms.

The same code runs against the **TenkiPay sandbox** in development and test, and against **TenkiPay live** in production. Only the keys change.

## 2. Scope

**In:**

- the provider adapter interface, the mock adapter, and the TenkiPay adapter (sandbox and live);
- payment instructions, the waterfall engine and idempotency;
- TenkiPay webhooks, status polling, retries and reconciliation;
- the double-entry ledger and payment receipts;
- per-organisation TenkiPay credentials;
- collections (pay-ins) through TenkiPay Checkout and invoices.

**Out:**

- savings product rules (module 06) and loan rules (module 08), which register **split rules** with this module;
- bank transfers (SaPS), kept behind the same interface for later.

## 3. Dependencies

01, 02, 03, 10, 13.

## 4. How money moves (who pays whom)

```
Co-op / buyer TenkiPay business account (payer)
   ├── transfer → Farmer's Orange Money / QMoney / Africell Money number   (FARMER_WALLET)
   ├── transfer → Lender's TenkiPay wallet (collection account)            (LOAN_REPAYMENT)
   ├── transfer → Savings custodian's TenkiPay wallet                     (SAVINGS)
   └── no transfer: dues stay with the co-op (ledger only)               (COOP_DUES, when payer = co-op)
       or transfer → co-op TenkiPay wallet                                (COOP_DUES, when payer = buyer)

Lender TenkiPay business account
   ├── transfer → Agro-dealer's payout number or TenkiPay wallet          (DEALER_SETTLEMENT)
   └── transfer → Farmer's mobile money                                   (SAVINGS_RELEASE, early withdrawal)

Farmer / group member (pay-in)
   └── TenkiPay Checkout session or invoice → lender / group account     (manual loan repayment, contributions)
```

Each split is a **separate TenkiPay transfer** from the payer to its destination. Funds are never pooled in an AgriLink account.

## 5. Environments and configuration

| Setting                              | Development / test                                                      | Production                                           |
| ------------------------------------ | ----------------------------------------------------------------------- | ---------------------------------------------------- |
| `PAYMENT_PROVIDER_MODE`              | `mock` (unit tests, offline demo) or `tenkipay`                         | `tenkipay`                                           |
| `TENKIPAY_BASE_URL`                  | `https://me.tenkipay.com`                                               | `https://me.tenkipay.com`                            |
| Key prefix (selects the environment) | `pk_test_…` / `sk_test_…`                                               | `pk_live_…` / `sk_live_…`                            |
| Webhook secret                       | `whsec_…` (sandbox app)                                                 | `whsec_…` (live app)                                 |
| Webhook URL                          | tunnel, e.g. `https://<id>.ngrok.app/api/webhooks/tenkipay/<accountId>` | `https://<domain>/api/webhooks/tenkipay/<accountId>` |
| Real money moves                     | **No** — transfers are simulated                                        | Yes                                                  |

TenkiPay uses one base URL for both environments; the **key prefix** decides whether a call is sandbox or live.

**Safety guards (enforced at start-up and on every call):**

- `NODE_ENV !== "production"` with any `pk_live_`/`sk_live_` key → refuse to start. Developers can never move real money by mistake.
- `NODE_ENV === "production"` with a `pk_test_` key → allowed only when `DEMO_MODE=true` (public demo on sandbox). Otherwise refuse.
- Each request asserts that the public and secret key prefixes match (`test` with `test`, `live` with `live`).
- The admin header shows a **SANDBOX** or **LIVE** badge for payments.

**Credentials are stored per paying organisation**, not as one global key, because each organisation pays from its own TenkiPay account (section 7).

- `TENKIPAY_PLATFORM_*` env vars hold only the demo/sandbox organisation used when no organisation account is connected.
- Secrets are encrypted at rest with `PAYMENTS_ENCRYPTION_KEY` (AES-256-GCM) and are never sent to the browser or written to logs.

## 6. TenkiPay API (what the adapter uses)

Base path: `/api/v1/merchant`. JSON in and out. Amounts are **decimal strings** with two places (`"250.00"`). The currency is `SLE`.

### 6.1 Request signing

Every request carries:

| Header                 | Value                                                                    |
| ---------------------- | ------------------------------------------------------------------------ |
| `X-TenkiPay-Key`       | public key (`pk_test_…` / `pk_live_…`)                                   |
| `X-TenkiPay-Timestamp` | ISO-8601 UTC with milliseconds, e.g. `2026-11-21T08:15:30.123Z` (±5 min) |
| `X-TenkiPay-Signature` | lowercase hex `HMAC-SHA256(secretKey, stringToSign)`                     |
| `Idempotency-Key`      | required on every write; 8–191 chars `[A-Za-z0-9._:-]`                   |

```
stringToSign = timestamp + "\n" + METHOD + "\n" + path + "\n" + rawBody
```

- `path` is the request path only (with the leading `/`, no host, no query string).
- `rawBody` is the exact JSON string sent. For a GET it is empty, so the string ends with `"\n"`.
- Serialise the body **once** and use the same string for signing and sending.

### 6.2 Endpoints used by AgriLink

| Purpose                         | Endpoint                                | Notes                                            |
| ------------------------------- | --------------------------------------- | ------------------------------------------------ |
| Payer balance before approving  | `GET /balance`                          | `null` in sandbox → skip the check               |
| Fee and total debit for a split | `POST /transfers/quote`                 | shown to the approver; fee is borne by the payer |
| **Disburse a split**            | `POST /transfers`                       | `Idempotency-Key` = our instruction key          |
| Transfer status (polling)       | `GET /transfers/{id}`                   | before any re-send                               |
| Pay-in by hosted page           | `POST /checkout/sessions`               | returns `session_id` (`CS-…`) and `checkout_url` |
| Pay-in status                   | `GET /checkout/sessions/{session_id}`   |                                                  |
| Pay-in by invoice (SMS link)    | `POST /invoices`, `GET /invoices/{ref}` | for loan instalments and group contributions     |

### 6.3 Status mapping

| TenkiPay status                                      | AgriLink `ProviderStatus` | Notes                                                 |
| ---------------------------------------------------- | ------------------------- | ----------------------------------------------------- |
| Transfer `QUEUED`, `PROCESSING`                      | `PENDING`                 |                                                       |
| Transfer `READY_FOR_PICKUP`                          | `PENDING`                 | agent cash pickup only; not used for farmer splits    |
| Transfer `COMPLETED`                                 | `SUCCESS`                 |                                                       |
| Transfer `FAILED`                                    | `FAILED`                  | `retryable` from the error code                       |
| Transfer `REVERSED`                                  | `REVERSED`                | posts a reversing ledger journal and alerts the co-op |
| Checkout `AUTH_PENDING`                              | `PENDING`                 |                                                       |
| Checkout `ACSC`                                      | `SUCCESS`                 | the **only** success status                           |
| Checkout `RJCT`, `FAILED`, `EXPIRED`, `CANCELLED`    | `FAILED`                  | not retryable; create a new session                   |
| HTTP `409` (same key, different body or in progress) | —                         | never re-send; call `getStatus` and wait              |

### 6.4 Webhooks

Events: `transfer.completed`, `transfer.failed`, `transfer.reversed`, `transfer.ready_for_pickup`, `checkout.payment_completed`.

| Header                 | Meaning                                                               |
| ---------------------- | --------------------------------------------------------------------- |
| `X-TenkiPay-Delivery`  | unique delivery id → **deduplication key**                            |
| `X-TenkiPay-Event`     | event name                                                            |
| `X-TenkiPay-Timestamp` | Unix seconds                                                          |
| `X-TenkiPay-Signature` | `v1=` + lowercase hex `HMAC-SHA256(whsec, timestamp + "." + rawBody)` |

To process a webhook:

1. Store the raw request in `ProviderCallback`.
2. Reject the delivery if the timestamp is more than 300 s old.
3. Verify the signature with a constant-time compare before parsing anything.
4. Ignore deliveries already processed, matched on `X-TenkiPay-Delivery`.
5. Update the instruction and call `maybeCompletePayment()`.
6. Return `2xx` quickly.

TenkiPay retries after about 1, 5, 15 and 60 minutes, then gives up. The status poller (section 10) covers deliveries that never arrive.

## 7. Data model changes (`prisma/schema/payments.prisma`)

Existing models (`Payment`, `PaymentSplit`, `ProviderInstruction`, `SplitRule`, `LedgerAccount`, `LedgerEntry`, `ProviderCallback`, `ReconciliationRun`) stay. Changes:

```prisma
enum ProviderCode { MOCK TENKIPAY ORANGE_MONEY AFRIMONEY QMONEY SAPS BANK }   // + TENKIPAY (rail)
enum WalletNetwork { ORANGE_MONEY AFRIMONEY QMONEY TENKIPAY }                  // AFRIMONEY = Africell Money
enum PaymentEnvironment { SANDBOX LIVE }
enum PaymentStatus { PENDING PROCESSING SUCCESS PARTIAL FAILED REVERSED CANCELLED }

/// A paying organisation's TenkiPay business account (co-op, buyer, lender, custodian, dealer).
model OrgPaymentAccount {
  id               String             @id @default(cuid())
  orgId            String
  provider         ProviderCode       @default(TENKIPAY)
  environment      PaymentEnvironment
  publicKey        String             // pk_test_… / pk_live_…
  secretKeyEnc     String             // AES-256-GCM, never returned by any API
  webhookSecretEnc String
  walletNumber     String?            // TenkiPay wallet number that receives transfers
  label            String
  active           Boolean            @default(true)
  verifiedAt       DateTime?          // last successful signed call (GET /balance)
  createdAt        DateTime           @default(now())
  @@unique([orgId, provider, environment])
}

model ProviderInstruction {
  // … existing fields …
  provider          ProviderCode       // TENKIPAY
  network           WalletNetwork?     // destination network for this transfer
  environment       PaymentEnvironment
  payerAccountId    String?            // OrgPaymentAccount used to sign
  providerFeeLe     Decimal?           @db.Decimal(14, 2)  // from /transfers/quote
  providerStatusRaw String?            // e.g. COMPLETED, READY_FOR_PICKUP
}

model ProviderCallback {
  // … existing fields …
  deliveryId   String?  @unique        // X-TenkiPay-Delivery
  event        String?
  accountId    String?                 // OrgPaymentAccount from the URL
}

/// Pay-ins (manual loan repayment, group contributions, co-op top-ups).
model Collection {
  id             String        @id @default(cuid())
  ref            String        @unique         // COL-000123
  purpose        String        // LOAN_REPAYMENT, GROUP_CONTRIBUTION
  targetId       String        // loan / group contribution id
  payeeAccountId String        // OrgPaymentAccount receiving the money
  amountLe       Decimal       @db.Decimal(14, 2)
  sessionId      String?       @unique         // CS-… or invoice ref
  checkoutUrl    String?
  status         PaymentStatus @default(PENDING)
  idempotencyKey String        @unique
  createdAt      DateTime      @default(now())
  completedAt    DateTime?
}
```

`AFRIMONEY` keeps its database value so no data migrates. The UI label becomes **"Africell Money"**.

## 8. Adapter interface (`packages/payments/src/adapter.ts`)

```ts
export type WalletNetwork = "ORANGE_MONEY" | "AFRIMONEY" | "QMONEY" | "TENKIPAY";

export interface DisburseRequest {
  idempotencyKey: string; // = ProviderInstruction.idempotencyKey
  payer: PayerCredentials; // decrypted OrgPaymentAccount (server only)
  to: { network: WalletNetwork; number: string }; // E.164 for mobile money, wallet no. for TENKIPAY
  amountLe: string; // "1250.00"
  narration: string; // ≤ 100 chars, shown on the farmer's statement
  reference: string; // PAY-…/split order, for reconciliation
}

export interface PaymentAdapter {
  readonly code: ProviderCode;
  quote?(
    req: Omit<DisburseRequest, "idempotencyKey">,
  ): Promise<{ feeLe: string; totalDebitLe: string }>;
  disburse(req: DisburseRequest): Promise<ProviderResult>;
  getStatus(ref: {
    providerRef?: string | null;
    idempotencyKey: string;
    payer: PayerCredentials;
  }): Promise<ProviderResult | null>;
  balance?(payer: PayerCredentials): Promise<string | null>;
  createCheckout?(
    req: CheckoutRequest,
  ): Promise<{ sessionId: string; checkoutUrl: string; status: ProviderStatus }>;
  verifyCallback(headers: Record<string, string>, rawBody: string, webhookSecret: string): boolean;
  parseCallback(
    rawBody: string,
  ): (ProviderResult & { idempotencyKey?: string; event?: string }) | null;
  lookupAccountName(network: WalletNetwork, msisdn: string): Promise<{ name: string } | null>;
}
```

The `ProviderResult` status gains `"REVERSED"`.

**Implementations**

- `MockAdapter` (existing): configurable success rate, delay and failure codes. Used for unit tests and offline demos.
- `TenkiPayAdapter` (new, `packages/payments/src/tenkipay/`):
  - `signing.ts`: `buildStringToSign`, `sign`, `verifyWebhook`. Pure functions with test vectors.
  - `client.ts`: fetch wrapper. Serialises the body once, adds the four headers, sets a 15 s timeout, and maps `409`, `401`, `422` and `5xx` to `ProviderResult` codes.
  - `adapter.ts`: implements `PaymentAdapter` and maps the AgriLink network to the TenkiPay destination type.
  - `mapping.ts`: status and error-code mapping (section 6.3).
- `routeProvider(wallet)` returns `TENKIPAY` for every mobile money network when `PAYMENT_PROVIDER_MODE=tenkipay`, and `MOCK` otherwise. The network is kept on the instruction.

**Account name lookup.** TenkiPay's public docs don't list a name-lookup endpoint. Until TenkiPay confirms one, `lookupAccountName` returns `null`, and module 02 keeps "wallet verified" as an agent confirmation with a one-time SMS code to the number.

## 9. Waterfall engine (`packages/payments/src/waterfall.ts`)

Unchanged. Pure function, fully unit-tested:

1. Sort active rules by `priority`.
2. `OUTSTANDING_BALANCE` (loan) takes `min(outstanding, remaining × maxRepaymentPct)`. The default `maxRepaymentPct` is 60%.
3. `PERCENT` takes `remaining × value%`. `FIXED` takes `min(value, remaining)`. Apply `capLe`.
4. **Farmer floor:** the farmer receives at least **30% of gross**. Lower-priority splits shrink first.
5. The remainder and any rounding go to `FARMER_WALLET`. Amounts have two decimal places.
6. Return the plan with explanations for previews and SMS.

**Transfer fees** are not taken from the farmer. The co-op approves the quoted fees, which are added to its debit (section 10, step 3).

## 10. Payment flow (BUYER_TO_FARMER) with TenkiPay

```
purchase.approved (maker–checker passed)
  → createPayment (idempotencyKey = purchaseId)
  → computeWaterfall → PaymentSplits
  → for each split: ProviderInstruction { provider: TENKIPAY, network, environment, payerAccountId,
                                          idempotencyKey = "pay:<paymentId>:<splitOrder>" }
  → (batch approval screen) GET /balance  +  POST /transfers/quote per split
        → show total incl. fees; block if balance < total (live only)
  → enqueue "payments:execute"
  → worker, per instruction:
        1. if providerRef or attempts > 0 → GET /transfers/{id} first (never blind re-send)
        2. POST /transfers  (Idempotency-Key = instruction key, destination = network + number)
        3. save transfer id, status, fee, raw response
  → webhook transfer.completed | transfer.failed | transfer.reversed   (or poller)
  → maybeCompletePayment(): all splits final
        → Payment SUCCESS / PARTIAL / FAILED
        → ledger journal per successful split (onSplitSucceeded hook: savings, loan, dealer)
        → events + SMS receipt with breakdown (module 10)
```

**Collections (pay-in) flow**

1. The farmer taps "Pay now", or the co-op sends a pay link.
2. `POST /checkout/sessions` (or `/invoices`) is created in the **payee's** TenkiPay account.
3. AgriLink SMSes the `checkout_url`.
4. The farmer pays with the TenkiPay app, web login, Orange Money or QMoney.
5. The `checkout.payment_completed` webhook arrives (status `ACSC`).
6. AgriLink applies the repayment or contribution and posts it to the ledger.

## 11. Failure handling

- Retries use exponential backoff (1 min, 5 min, 15 min, 1 h, 6 h), at most 5, and only for retryable errors (timeout, `5xx`, rate limit).
- **Never re-send without `getStatus` first.** The same `Idempotency-Key` with the same body returns the stored result, so a retry after a timeout is safe. A `409` means "still processing or body changed": stop and poll.
- `INSUFFICIENT_FUNDS` on the payer account:
  - not retried automatically;
  - the payment shows **"Top up your TenkiPay account"** to the co-op, with a retry button.
- Invalid number or unsupported network: not retryable. The farmer is flagged "wallet needs checking" in module 02.
- The farmer split fails while others succeed: the payment is `PARTIAL`. The co-op is alerted, and the farmer split is retried first.
- `transfer.reversed`: post a reversing journal, mark the split `REVERSED`, and alert the co-op and admin.
- Stuck in `PROCESSING` for more than 15 minutes: the status poller runs `GET /transfers/{id}`.
- Admin manual actions: retry, mark failed, re-query status. Refunds aren't in TenkiPay's public API yet, so a refund is a new transfer back, which needs maker–checker.

## 12. Ledger

- Every successful transfer posts a balanced journal: debits equal credits. This is checked by the service, the database trigger and the nightly integrity job.
- Ledger balances **mirror** what TenkiPay confirmed. They feed farmer statements, savings balances and loan outstanding.
- Each journal stores the TenkiPay transfer id, fee and environment.
- **Sandbox journals are never mixed with live:** each `LedgerAccount` code is suffixed with `@SANDBOX` when the environment is SANDBOX.

## 13. Reconciliation

- **Daily job, per `OrgPaymentAccount`:**
  1. List AgriLink instructions finished in the last 48 h.
  2. Re-query each via `GET /transfers/{id}`.
  3. Compare status, amount and fee.
  4. Write a `ReconciliationRun` row with matched, mismatched and missing counts.
- **CSV import stays as a fallback:** upload a statement exported from the TenkiPay dashboard and match it on transfer id, amount and date.
- **Mismatches** appear in `/admin/reconciliation`, and no ledger is changed automatically.

## 14. API, server actions and routes

| Function / route                                        | Who                                                                  |
| ------------------------------------------------------- | -------------------------------------------------------------------- |
| `previewWaterfall(farmerId, grossLe)`                   | co-op/buyer staff (no side effects)                                  |
| `quoteBatch(batchId)`                                   | co-op manager (balance + fees before approval)                       |
| `createPaymentForPurchase(purchaseId)`                  | event consumer                                                       |
| `POST /api/webhooks/tenkipay/[accountId]`               | TenkiPay (raw stored, signature verified with that account's secret) |
| `connectPaymentAccount(orgId, keys)` / `testConnection` | ORG_ADMIN, LENDER_ADMIN (keys encrypted; `GET /balance` to verify)   |
| `createCollection(purpose, targetId, amountLe)`         | farmer, co-op staff                                                  |
| `retryInstruction(id)`, `markFailed(id)`, `requery(id)` | SUPER_ADMIN                                                          |
| `runReconciliation(accountId, period)`                  | SUPER_ADMIN / scheduled                                              |
| `getFarmerStatement(farmerId, period)`                  | FARMER, scoped staff                                                 |
| `registerSplitRule` / `deactivateSplitRule`             | internal (03, 06, 08)                                                |

**Screens**

- `/coop/settings/payments`, `/lender/institution`, `/dealer/profile`:
  - connect a TenkiPay account (public key, secret key, webhook secret, wallet number);
  - "Test connection";
  - SANDBOX/LIVE badge;
  - balance.
- `/coop/collections/[id]`: before approving, shows the total including TenkiPay fees and the balance check.
- `/coop/payments`, `/admin/payments/instructions`: each split shows its network logo (Orange Money, Africell Money, QMoney) and its TenkiPay transfer id.
- `/admin/reconciliation`: runs and mismatches, per account.

## 15. Step-by-step implementation

1. **Schema:** add `TENKIPAY`, `WalletNetwork`, `PaymentEnvironment`, `OrgPaymentAccount`, `Collection`, and the new instruction and callback fields. Migrate and back-fill `environment = SANDBOX` on existing rows.
2. **Secrets:** `packages/payments/src/crypto.ts` with AES-256-GCM encrypt/decrypt using `PAYMENTS_ENCRYPTION_KEY`; add the start-up guards from section 5.
3. **Signing:** `tenkipay/signing.ts`, plus unit tests with fixed vectors for GET (empty body) and POST, webhook `v1=` verification, old timestamps and tampered bodies.
4. **Client and adapter:** `tenkipay/client.ts` and `adapter.ts` (`quote`, `disburse`, `getStatus`, `balance`, `createCheckout`, `parseCallback`), plus `mapping.ts`.
5. **Routing:** `routeProvider` reads `PAYMENT_PROVIDER_MODE`; `adapterFor("TENKIPAY")` builds the adapter with the payer's decrypted credentials.
6. **Account connection UI and actions**, with a "Test connection" call to `GET /balance`.
7. **Webhook route** `/api/webhooks/tenkipay/[accountId]`:
   1. Read the raw body.
   2. Store it.
   3. Verify the signature.
   4. Deduplicate on the delivery id.
   5. Update the instruction or collection.
   6. Call `maybeCompletePayment()`.
8. **Worker:** `payments:execute` follows status → transfer → persist. The poller job runs every 5 min for instructions `PROCESSING` longer than 15 min.
9. **Batch approval:** `quoteBatch` shows fees and the balance, and blocks on insufficient balance (live only).
10. **Collections:** `createCollection`, then an SMS with `checkout_url`; the webhook `checkout.payment_completed` applies the repayment or contribution.
11. **Reconciliation:** the daily job per account, with the CSV fallback kept.
12. **Sandbox end-to-end (development):** with `pk_test_`/`sk_test_` keys and a tunnel for webhooks:
    1. Approve a batch.
    2. TenkiPay simulates each transfer.
    3. Webhooks arrive.
    4. The ledger balances.
    5. The SMS receipt is sent.

    Use the TenkiPay simulator to force **failed** and **reversed** transfers, and a duplicate webhook delivery.

    ✅ _Checkpoint (demo):_ the same story as the MVP demo runs on the TenkiPay sandbox, not on the mock.

13. **Go-live (production):**
    1. TenkiPay reviews the integration and the business.
    2. Each organisation connects its `pk_live_`/`sk_live_` keys.
    3. Register the live webhook URL.
    4. Pilot with small amounts (≤ Le 500 per transfer for the first week).
    5. Reconcile daily.
    6. Hold a BSL sandbox or partner sign-off.

## 16. Open questions to confirm with TenkiPay before go-live

1. **Africell Money (Afrimoney)** as a transfer destination and checkout method. The public docs list only Orange Money, QMoney, TenkiPay wallets and agent cash.
2. **Connected or platform accounts:** can AgriLink act for many organisations with one integration, or does each organisation create its own API app and keys, as this design assumes?
3. **Account name lookup** for a mobile number before paying, by network.
4. **Refunds and reversals** through the API (not documented).
5. **Sandbox test numbers and simulator triggers** for success, failure, reversal and timeout, per network.
6. **Fees, limits and settlement times** per network, and who bears the fee.
7. **Rate limits, IP allow-listing and a status page** or incident contact.
8. **Statement or export API** for reconciliation (otherwise the CSV import is used).

## 17. Acceptance criteria

- The same purchase can never create two payments, and the same instruction can never create two TenkiPay transfers (one idempotency key end to end).
- The waterfall never leaves the farmer less than the configured floor. TenkiPay fees are never taken from the farmer.
- Live keys can't be used outside production. Sandbox and live ledgers never mix.
- Every successful transfer has a balanced ledger journal with its TenkiPay transfer id.
- Webhooks are stored raw, signature-verified, deduplicated by delivery id and safe to replay.
- A failed or reversed transfer is visible to the co-op and admins, with a clear next action.
- One code path serves Orange Money, Africell Money and QMoney. Adding a network is a mapping change, not a new integration.

## 18. Tests

- **Unit:**
  - waterfall (≥ 20 cases) and rounding;
  - TenkiPay signing vectors;
  - webhook verification (good, tampered, stale, wrong secret);
  - status and error mapping;
  - key-prefix guards.
- **Integration with a stubbed TenkiPay HTTP server (msw):**
  - success;
  - `409` replay;
  - timeout then status query;
  - insufficient funds;
  - reversed;
  - duplicate webhook;
  - partial failure.
- **Sandbox contract tests (tagged, run manually and nightly in CI with `sk_test_` secrets):** create quote → transfer → poll to final status for each network the sandbox supports.
- **Property-based (fast-check):** the sum of splits always equals gross, and fees are never deducted from the farmer split.

## References

- TenkiPay developer documentation: https://me.tenkipay.com/developers/docs
- TenkiPay code samples: https://me.tenkipay.com/developers/code-samples
- TenkiPay (Korlie Limited): https://tenkipay.com/about.html
