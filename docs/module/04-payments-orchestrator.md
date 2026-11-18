# Module 04 — Payments Orchestrator & Ledger

## 1. Purpose

Move money **safely and traceably** between buyers, farmers, savings custodians, lenders, co-ops and agro-dealers over existing rails (Orange Money, Afrimoney, QMoney, SaPS/banks) and apply the **Smart Split waterfall** that makes AgriPay different from a wallet.

AgriPay **never holds customer funds**. It instructs licensed providers and keeps a **double-entry ledger** that mirrors what providers confirm.

## 2. Scope

**In:** provider adapter interface, mock adapter, sandbox/live adapters (one operator first), payment instructions, waterfall engine, idempotency, webhooks/callbacks, status polling, retries, reconciliation, double-entry ledger, payment receipts.
**Out:** Savings product rules (06), loan rules (08) — they register **split rules** with this module.

## 3. Dependencies

01, 02, 03, 10, 13.

## 4. Data model (`prisma/schema/payments.prisma`)

```prisma
enum PaymentStatus { PENDING PROCESSING SUCCESS FAILED REVERSED CANCELLED }
enum PaymentType { BUYER_TO_FARMER LOAN_DISBURSEMENT VOUCHER_SETTLEMENT SAVINGS_RELEASE COOP_DUES PROGRAMME_DISBURSEMENT }
enum SplitType { LOAN_REPAYMENT SAVINGS COOP_DUES INSURANCE_PREMIUM FARMER_WALLET }
enum ProviderCode { MOCK ORANGE_MONEY AFRIMONEY QMONEY SAPS BANK }

model Payment {
  id             String        @id @default(cuid())
  ref            String        @unique          // PAY-...
  type           PaymentType
  purchaseId     String?       @unique
  payerOrgId     String?
  farmerId       String?
  grossLe        Decimal       @db.Decimal(14,2)
  status         PaymentStatus @default(PENDING)
  idempotencyKey String        @unique
  approvedById   String?
  splits         PaymentSplit[]
  createdAt      DateTime      @default(now())
  completedAt    DateTime?
}

model PaymentSplit {
  id            String        @id @default(cuid())
  paymentId     String
  payment       Payment       @relation(fields: [paymentId], references: [id])
  order         Int
  type          SplitType
  amountLe      Decimal       @db.Decimal(14,2)
  targetType    String        // LOAN, SAVINGS_ACCOUNT, COOPERATIVE, WALLET, POLICY
  targetId      String
  status        PaymentStatus @default(PENDING)
  instructions  ProviderInstruction[]
}

model ProviderInstruction {
  id             String        @id @default(cuid())
  splitId        String
  split          PaymentSplit  @relation(fields: [splitId], references: [id])
  provider       ProviderCode
  direction      String        // DEBIT_PAYER, CREDIT_PAYEE, TRANSFER
  fromAccount    String
  toAccount      String
  amountLe       Decimal       @db.Decimal(14,2)
  idempotencyKey String        @unique
  providerRef    String?       @unique
  status         PaymentStatus @default(PENDING)
  attempts       Int           @default(0)
  lastError      String?
  requestPayload Json?
  responsePayload Json?
  nextRetryAt    DateTime?
  updatedAt      DateTime      @updatedAt
}

model SplitRule {                 // registered by modules 06, 08, 03
  id         String   @id @default(cuid())
  farmerId   String
  type       SplitType
  priority   Int                  // 1 = first
  mode       String               // PERCENT, FIXED, OUTSTANDING_BALANCE
  value      Decimal? @db.Decimal(14,2)
  capLe      Decimal? @db.Decimal(14,2)
  targetType String
  targetId   String
  active     Boolean  @default(true)
  consentId  String?              // farmer PIN-confirmed consent
  validFrom  DateTime @default(now())
  validTo    DateTime?
}

model LedgerAccount {
  id        String  @id @default(cuid())
  code      String  @unique       // e.g. FARMER:AP-BOM-000123:WALLET, LOAN:LN-1:RECEIVABLE
  ownerType String
  ownerId   String
  kind      String                // ASSET, LIABILITY, CLEARING
}

model LedgerEntry {
  id          String   @id @default(cuid())
  journalId   String                    // groups balanced lines
  accountId   String
  debitLe     Decimal  @db.Decimal(14,2) @default(0)
  creditLe    Decimal  @db.Decimal(14,2) @default(0)
  paymentId   String?
  memo        String?
  createdAt   DateTime @default(now())
  @@index([accountId])
  @@index([journalId])
}

model ProviderCallback {
  id         String   @id @default(cuid())
  provider   ProviderCode
  headers    Json
  body       Json
  signatureOk Boolean
  processedAt DateTime?
  receivedAt DateTime @default(now())
}

model ReconciliationRun {
  id         String   @id @default(cuid())
  provider   ProviderCode
  periodFrom DateTime
  periodTo   DateTime
  matched    Int
  mismatched Int
  missing    Int
  reportKey  String?
  createdAt  DateTime @default(now())
}
```

## 5. Adapter interface (`packages/payments/src/adapter.ts`)

```ts
export interface PaymentAdapter {
  code: ProviderCode;
  lookupAccountName(msisdn: string): Promise<{ name: string } | null>;
  disburse(req: {
    idempotencyKey: string;
    to: string;
    amountLe: Decimal;
    narration: string;
  }): Promise<ProviderResult>;
  collect?(req: {
    idempotencyKey: string;
    from: string;
    amountLe: Decimal;
    narration: string;
  }): Promise<ProviderResult>;
  getStatus(providerRefOrKey: string): Promise<ProviderResult>;
  verifyCallback(headers: Record<string, string>, rawBody: string): boolean;
  parseCallback(body: unknown): ProviderResult;
}
type ProviderResult = {
  status: "PENDING" | "SUCCESS" | "FAILED";
  providerRef?: string;
  error?: string;
  raw?: unknown;
};
```

- `MockAdapter`: configurable success rate, delay and failure codes. Used for the demo and tests.
- `routeProvider(msisdn)`: picks the adapter from the wallet provider. Fallback to SaPS for bank accounts.

## 6. Waterfall engine (`packages/payments/src/waterfall.ts`)

```ts
function computeWaterfall(grossLe: Decimal, rules: SplitRule[], ctx): SplitPlan[];
```

Rules:

1. Sort active rules by `priority`.
2. `OUTSTANDING_BALANCE` (loan) takes `min(outstanding, remaining × maxRepaymentPct)`. **Default `maxRepaymentPct` = 60%**, so the farmer always keeps cash.
3. `PERCENT` takes `remaining × value%` (or of gross — configured per rule).
4. `FIXED` takes `min(value, remaining)`.
5. Apply `capLe`.
6. **Farmer protection floor:** the farmer wallet split must be ≥ **30% of gross** (configurable). If not, reduce lower-priority splits first.
7. Remainder → `FARMER_WALLET`.
8. Round to 2 dp; any rounding difference goes to the farmer.
9. Return the plan with explanations (used in previews and SMS).

**Pure function, 100% unit-tested.**

## 7. Payment flow (BUYER_TO_FARMER)

```
purchase.approved
  → createPayment (idempotencyKey = purchaseId)
  → computeWaterfall → PaymentSplits
  → for each split: ProviderInstruction(s)
       buyer funding account → farmer wallet (FARMER_WALLET)
       buyer funding account → custodian savings account (SAVINGS)
       buyer funding account → lender collection account (LOAN_REPAYMENT)
       buyer funding account → co-op account (COOP_DUES)
  → enqueue "payments:execute"
  → worker calls adapter.disburse() with instruction idempotencyKey
  → callback or polling updates status
  → when all splits SUCCESS → Payment SUCCESS → ledger journal → events:
       payment.succeeded, savings.credited, loan.repaid, coop.dues_received
  → SMS receipt with breakdown
```

Each split goes directly from payer to its destination. AgriPay never pools funds.

## 8. Failure handling

- Retries: exponential backoff (1m, 5m, 15m, 1h, 6h), max 5; only for retryable errors.
- **Never re-send** an instruction without first calling `getStatus` (avoids double payment).
- If the farmer split fails but others succeed → mark payment `PARTIAL` in the UI, alert co-op, keep retrying the farmer split first.
- Manual actions (admin): retry, mark failed, reverse (if provider supports).
- Stuck `PROCESSING` > 30 min → status poll job.

## 9. Ledger

- Every successful instruction posts a balanced journal (sum debits = sum credits), enforced by a DB check in the service and a nightly integrity job.
- Ledger balances = **mirror** of provider-confirmed movements; used for farmer statements, savings balances, loan outstanding.

## 10. API / server actions & routes

| Function                                  | Who                                             |
| ----------------------------------------- | ----------------------------------------------- |
| `previewWaterfall(farmerId, grossLe)`     | co-op/buyer staff (no side-effects)             |
| `createPaymentForPurchase(purchaseId)`    | event consumer                                  |
| `POST /api/webhooks/payments/[provider]`  | provider (signature verified, stored raw first) |
| `retryInstruction(id)`, `markFailed(id)`  | SUPER_ADMIN                                     |
| `runReconciliation(provider, period)`     | SUPER_ADMIN / scheduled                         |
| `getFarmerStatement(farmerId, period)`    | FARMER, scoped staff                            |
| `registerSplitRule / deactivateSplitRule` | internal (06, 08, 03)                           |

UI:

- `/(coop)/payments`: payment list with split breakdown, statuses, retry indicator.
- `/(admin)/payments/instructions`: failed/stuck instructions, actions.
- `/(admin)/reconciliation`: runs, mismatches, CSV upload of provider statement (until an API exists).
- `/(farmer)/statement`.

## 11. Step-by-step implementation

1. Add `payments.prisma`; migrate.
2. `packages/payments`: adapter interface, `MockAdapter`, `routeProvider`.
3. Implement and fully test `computeWaterfall` (table-driven tests: no rules, savings only, loan larger than payment, floor protection, rounding).
4. `paymentService.createForPurchase()` (idempotent on `purchaseId`).
5. Worker `payments:execute` processor: per instruction → status check → disburse → persist response.
6. Callback route: store raw → verify signature → update instruction → `maybeCompletePayment()`.
7. Status poller (repeatable job every 5 min for PROCESSING > 5 min).
8. `maybeCompletePayment()`: all splits final → set status → ledger journal → emit events → SMS (module 10).
9. Ledger service: `postJournal(lines)` with balance assertion; `balanceOf(accountCode)`.
10. Split rule registry API for modules 06/08/03.
11. `previewWaterfall` used by co-op batch approval UI.
12. Admin screens for instructions and reconciliation (CSV statement import → match by providerRef/amount/date).
13. Account name lookup (`lookupAccountName`) for wallet verification (module 02).
14. **Sandbox adapter** for the first operator once API access is granted (keep behind `PAYMENT_PROVIDER_MODE`).
    ✅ _Checkpoint (demo):_ approve a batch → farmer gets SMS showing loan repayment, Harvest Lock savings and wallet amount; ledger balances.

## 12. Acceptance criteria

- Same purchase can never create two payments (idempotency).
- Waterfall never leaves the farmer less than the configured floor.
- Every successful payment has a balanced ledger journal.
- Webhooks are verified, stored raw and safe to replay.
- Failed instructions are visible and retryable by admins.

## 13. Tests

- Unit: waterfall (≥ 20 cases), rounding, ledger balance assertion.
- Integration: mock adapter success/failure/timeout; duplicate callback; partial failure.
- Property-based (fast-check): sum of splits always equals gross.
