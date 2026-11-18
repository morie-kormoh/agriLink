# Module 05 — Farm Records & Profit Summary

## 1. Purpose

Give farmers a simple digital farm book: what they spent, what they harvested and what they earned each season. Records also feed the Farm Financial Passport (07). **Most records are created automatically** from purchases and vouchers, so farmers do little manual entry.

## 2. Scope

**In:** manual records (inputs, labour, other costs, harvest, sales outside AgriPay), automatic records from events, crop-cycle linking, season summaries, profit summary SMS, record verification levels, co-op view.
**Out:** Accounting-grade bookkeeping for agri-SMEs (future).

## 3. Dependencies

01, 02, 03, 04, 10.

## 4. Data model (`prisma/schema/records.prisma`)

```prisma
enum RecordType { INPUT_PURCHASE LABOUR LAND_PREP TRANSPORT OTHER_COST HARVEST SALE OTHER_INCOME }
enum RecordSource { USSD APP AGENT COOP AUTO_PURCHASE AUTO_VOUCHER AUTO_PAYMENT }
enum Verification { SELF_REPORTED AGENT_CONFIRMED SYSTEM_VERIFIED }

model FarmRecord {
  id           String       @id @default(cuid())
  farmerId     String
  cropCycleId  String?
  season       String
  type         RecordType
  description  String?
  quantity     Decimal?     @db.Decimal(12,2)
  unit         String?
  amountLe     Decimal?     @db.Decimal(14,2)
  occurredAt   DateTime
  source       RecordSource
  verification Verification @default(SELF_REPORTED)
  sourceRef    String?      @unique          // purchaseId / voucherId for auto records
  createdById  String?
  createdAt    DateTime     @default(now())
  @@index([farmerId, season])
}

model SeasonSummary {
  id           String   @id @default(cuid())
  farmerId     String
  season       String
  totalCostLe  Decimal  @db.Decimal(14,2)
  totalSalesLe Decimal  @db.Decimal(14,2)
  harvestKg    Decimal  @db.Decimal(12,2)
  netLe        Decimal  @db.Decimal(14,2)
  recordCount  Int
  verifiedShare Decimal @db.Decimal(5,2)     // % of value system-verified
  generatedAt  DateTime @default(now())
  @@unique([farmerId, season])
}
```

## 5. Business rules

- `SALE` records from AgriPay purchases are `SYSTEM_VERIFIED`; input vouchers redeemed are `SYSTEM_VERIFIED`; agent-entered records are `AGENT_CONFIRMED`; farmer-entered are `SELF_REPORTED`.
- The passport (07) weights verified records more than self-reported ones.
- Season codes: `{YEAR}-MAIN` (rainy season) and `{YEAR}-DRY`; default derived from `occurredAt` with co-op override.
- Farmers can edit/delete only their `SELF_REPORTED` records within 30 days.
- Profit summary SMS sent at season close (co-op triggers) or on request via USSD.

## 6. API / server actions

| Function                                  | Who                                                                                                |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `addRecord(input)`                        | FARMER, AGENT, COOP_STAFF                                                                          |
| `listRecords(farmerId, season)`           | scoped                                                                                             |
| `updateRecord / deleteRecord`             | owner rules                                                                                        |
| `generateSeasonSummary(farmerId, season)` | system / co-op                                                                                     |
| `closeSeason(coopId, season)`             | COOP_ADMIN → summaries + SMS for all members                                                       |
| Event consumers                           | `purchase.recorded` → SALE; `voucher.redeemed` → INPUT_PURCHASE; `crop.harvest_recorded` → HARVEST |

## 7. UI screens & routes

- `/(farmer)/records`: season tabs, quick-add buttons with icons (Seed, Fertiliser, Labour, Transport, Harvest, Sale), list with verification badges.
- `/(farmer)/records/summary`: cards: spent / earned / net, simple bar chart by category.
- `/(agent)/farmers/[id]/records`: agent-assisted entry.
- `/(coop)/seasons`: close season, member summary table, export.

## 8. USSD / SMS touchpoints

- USSD _My Farm → Add expense_: type → amount → confirm.
- USSD _My Farm → Season summary_.
- SMS at season close: "AgriPay 2027 main season: You spent Le 1,800, sold Le 8,000 (20 bags rice). Net Le 6,200. Saved Le 1,200. Keep recording to grow your AgriPay score."

## 9. Step-by-step implementation

1. Add `records.prisma`; migrate.
2. Zod schemas per record type (e.g. HARVEST requires quantity + unit; costs require amount).
3. `recordService.add()` with ownership and verification level from actor role.
4. Event consumers (worker): purchase → SALE (idempotent via `sourceRef`), voucher → INPUT_PURCHASE.
5. `summaryService.generate(farmerId, season)` aggregation query + upsert `SeasonSummary`.
6. Farmer records UI (mobile-first quick-add sheet).
7. Summary page with Recharts bar chart (via shadcn chart wrapper).
8. Co-op season close: batch job over members → summaries → SMS.
9. USSD handlers (module 09 calls `recordService`).
   ✅ _Checkpoint:_ a purchase from module 03 automatically shows as a verified SALE in the farmer's records.

## 10. Acceptance criteria

- Purchases and vouchers create records automatically, once.
- Farmer sees season totals that match ledger figures for verified sales.
- Self-reported records clearly labelled.
- Season-close SMS delivered to all members of the co-op.

## 11. Tests

- Unit: summary aggregation, season derivation.
- Integration: event consumer idempotency; edit window rules.
