# Module 06 — Savings (Harvest Lock & Group Savings)

## 1. Purpose

Help farmers smooth seasonal income: automatically save part of every harvest payment (**Harvest Lock**) and release it when the next planting season starts, plus digital **group savings** (VSLA / Osusu) for cooperatives and women's groups.

## 2. Scope

**In:** savings products (configured per custodian), farmer savings accounts, auto-save split rules, locked periods and release schedules, early withdrawal rules, group savings (contributions, cycle, payouts), statements, balance views.
**Out:** The custodian's own core banking. Funds are held by a **licensed partner** (bank, community bank, FSA, MFI or MMO savings product). AgriLink records instructions and mirrors balances.

## 3. Dependencies

01, 02, 04, 10, 13.

## 4. Data model (`prisma/schema/savings.prisma`)

```prisma
enum SavingsType { HARVEST_LOCK GOAL GROUP }
enum SavingsStatus { ACTIVE LOCKED RELEASED CLOSED }

model SavingsProduct {
  id              String   @id @default(cuid())
  custodianOrgId  String                       // licensed partner
  name            String                       // "Harvest Lock – Rice"
  type            SavingsType
  defaultPct      Decimal? @db.Decimal(5,2)    // e.g. 15.00
  minPct          Decimal? @db.Decimal(5,2)
  maxPct          Decimal? @db.Decimal(5,2)
  releaseRule     String                       // FIXED_DATE, SEASON_START, GOAL_REACHED
  releaseMonthDay String?                      // e.g. "04-01" for rainy-season planting
  earlyWithdrawalAllowed Boolean @default(true)
  earlyWithdrawalFeePct  Decimal? @db.Decimal(5,2)
  interestNote    String?                      // disclosure text
  active          Boolean  @default(true)
}

model SavingsAccount {
  id            String        @id @default(cuid())
  ref           String        @unique         // SAV-...
  farmerId      String?
  groupId       String?
  productId     String
  custodianAccountRef String?                 // account no. at partner
  status        SavingsStatus @default(ACTIVE)
  autoSavePct   Decimal?      @db.Decimal(5,2)
  goalLe        Decimal?      @db.Decimal(14,2)
  goalLabel     String?                       // "Fertiliser", "School fees"
  lockedUntil   DateTime?
  splitRuleId   String?                       // module 04 SplitRule
  createdAt     DateTime      @default(now())
}

model SavingsTransaction {
  id         String   @id @default(cuid())
  accountId  String
  type       String   // CREDIT_AUTO, CREDIT_MANUAL, RELEASE, EARLY_WITHDRAWAL, FEE, INTEREST
  amountLe   Decimal  @db.Decimal(14,2)
  paymentId  String?
  balanceAfterLe Decimal @db.Decimal(14,2)
  createdAt  DateTime @default(now())
}

model SavingsGroup {
  id            String   @id @default(cuid())
  name          String
  cooperativeId String?
  type          String   // VSLA, OSUSU_ROTATING, GOAL
  contributionLe Decimal @db.Decimal(14,2)
  frequency     String   // WEEKLY, MONTHLY
  cycleStart    DateTime
  cycleEnd      DateTime
  members       SavingsGroupMember[]
}

model SavingsGroupMember {
  id        String @id @default(cuid())
  groupId   String
  group     SavingsGroup @relation(fields: [groupId], references: [id])
  farmerId  String
  role      String @default("MEMBER")       // CHAIR, TREASURER, SECRETARY, MEMBER
  payoutOrder Int?
  @@unique([groupId, farmerId])
}

model GroupContribution {
  id        String   @id @default(cuid())
  groupId   String
  farmerId  String
  periodNo  Int
  amountLe  Decimal  @db.Decimal(14,2)
  method    String   // MOBILE_MONEY, CASH_RECORDED
  recordedById String
  createdAt DateTime @default(now())
}
```

## 5. Business rules

- Opening Harvest Lock and setting the % requires **farmer PIN consent** (USSD or app). Agents cannot set it alone.
- Auto-save registered as a `SplitRule` (module 04) with `type=SAVINGS`, `mode=PERCENT`, priority after loan repayment.
- Default 15%; allowed range per product (e.g. 5–40%).
- **Release:** at `SEASON_START` / fixed date, the worker creates `SAVINGS_RELEASE` payments to the farmer wallet, and sends an SMS 7 days before.
- **Early withdrawal:** allowed if the product permits; fee disclosed before PIN confirmation; limited to once per season (emergency use).
- Farmer can change % or pause auto-save anytime (takes effect on the next payment).
- Group savings: contributions recorded by treasurer; mobile money contributions verified via module 04; rotating payouts follow `payoutOrder`; every member gets an SMS after each meeting with their total.
- Balances shown = ledger mirror; daily reconciliation against custodian statement.

## 6. API / server actions

| Function                                                         | Who                                                 |
| ---------------------------------------------------------------- | --------------------------------------------------- |
| `createSavingsProduct`                                           | custodian admin (LENDER_ADMIN for FIs), SUPER_ADMIN |
| `openHarvestLock(farmerId, productId, pct, pin)`                 | FARMER (or agent-assisted with farmer PIN)          |
| `updateAutoSave(accountId, pct                                   | paused, pin)`                                       | FARMER |
| `requestEarlyWithdrawal(accountId, amountLe, pin)`               | FARMER                                              |
| `runScheduledReleases()`                                         | worker (daily)                                      |
| `createGroup / addMember / recordContribution / payout`          | COOP_ADMIN, group treasurer                         |
| `getSavingsSummary(farmerId)`                                    | FARMER, scoped staff                                |
| Event consumer `payment.succeeded` → credit savings transactions | worker                                              |

## 7. UI screens & routes

- `/(farmer)/savings`: Harvest Lock card (balance, release date countdown, % slider with preview "On a Le 5,000 sale you'll save Le 750"), goals, history.
- `/(agent)/farmers/[id]/savings/open`: assisted opening (farmer enters PIN on agent device or confirms via USSD push).
- `/(coop)/groups`, `/(coop)/groups/[id]`: members, contribution grid per period, payouts.
- `/(lender)/savings`: custodian view of accounts and balances (for FI partners).

## 8. USSD / SMS touchpoints

- USSD _Savings → Harvest Lock_: balance, release date, change %, early withdrawal.
- SMS on credit: "Le 750 saved to Harvest Lock. Total Le 2,350. Unlocks 1 Apr for planting."
- SMS 7 days before release; SMS on release.

## 9. Step-by-step implementation

1. Add `savings.prisma`; migrate; seed one custodian org and two products (Harvest Lock, Goal).
2. `savingsService.openHarvestLock()` → verify PIN (01) → create account → register `SplitRule` (04) → audit → SMS.
3. Consumer: `payment.succeeded` with SAVINGS split → `SavingsTransaction` + balance update in same transaction as ledger read.
4. Farmer savings UI with % slider + live preview (uses `computeWaterfall` with a sample amount).
5. Release scheduler (BullMQ repeatable daily job): due accounts → create `SAVINGS_RELEASE` payment → status `RELEASED` on success.
6. Early withdrawal flow with fee disclosure and PIN.
7. Group savings: group CRUD, member roles, contribution grid, rotating payout logic, SMS statements.
8. Custodian portal view and CSV statement reconciliation (reuse 04 reconciliation tools).
9. USSD handlers.
   ✅ _Checkpoint:_ open Harvest Lock at 15% → record & approve purchase → savings balance increases → force-run release job → farmer wallet credited.

## 10. Acceptance criteria

- No savings rule can be activated without farmer PIN confirmation.
- Savings credits match the SAVINGS split amount exactly.
- Releases happen automatically on schedule, with prior SMS notice.
- Group members can see their own contribution totals.

## 11. Tests

- Unit: release date calculation, early withdrawal fee, rotating payout order.
- Integration: payment → savings credit idempotency; pause auto-save removes split from next waterfall.
