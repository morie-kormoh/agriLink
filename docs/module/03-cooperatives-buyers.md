# Module 03 — Cooperatives, Buyers & Purchases

## 1. Purpose

Digitise the moment money is created in the value chain: a **cooperative or buyer weighs and buys produce from a farmer**. Each purchase becomes a verified sale record and the trigger for a digital payment (module 04).

## 2. Scope

**In:** cooperative profile & settings, buyer profile, collection points, price lists, purchase recording (single & batch, offline), purchase approval, purchase receipts, buyer–co-op relationships, co-op dues rules.
**Out:** Moving money (04), savings rules (06).

## 3. Dependencies

01, 02, 13.

## 4. Data model (`prisma/schema/trade.prisma`)

```prisma
enum PurchaseStatus { DRAFT RECORDED APPROVED PAYMENT_PENDING PAID CANCELLED DISPUTED }
enum BuyerType { AGGREGATOR PROCESSOR EXPORTER TRADER COOPERATIVE INSTITUTION }

model Cooperative {
  id             String   @id @default(cuid())
  orgId          String   @unique             // Organization (type COOPERATIVE)
  registrationNo String?
  districtId     String
  chiefdomId     String?
  mainCrops      String[]
  duesPct        Decimal? @db.Decimal(5,2)     // optional % of each sale
  duesFlatLe     Decimal? @db.Decimal(14,2)
  members        Farmer[]
  collectionPoints CollectionPoint[]
}

model Buyer {
  id       String    @id @default(cuid())
  orgId    String    @unique                  // Organization (type BUYER)
  type     BuyerType
  crops    String[]
  fundingWalletRef String?                    // buyer's disbursement account at provider
}

model CollectionPoint {
  id            String   @id @default(cuid())
  cooperativeId String?
  buyerId       String?
  name          String
  community     String
  latitude      Float?
  longitude     Float?
}

model PriceList {
  id         String   @id @default(cuid())
  ownerOrgId String
  cropId     String
  grade      String?
  unit       String   @default("kg")
  priceLe    Decimal  @db.Decimal(14,2)
  validFrom  DateTime
  validTo    DateTime?
}

model PurchaseBatch {
  id          String     @id @default(cuid())
  ref         String     @unique              // BAT-...
  ownerOrgId  String                          // co-op or buyer
  collectionPointId String?
  status      String     @default("OPEN")     // OPEN, SUBMITTED, APPROVED, PAID
  createdById String
  approvedById String?
  purchases   Purchase[]
  createdAt   DateTime   @default(now())
}

model Purchase {
  id            String         @id @default(cuid())
  ref           String         @unique        // PUR-...
  clientRef     String?        @unique        // offline idempotency
  farmerId      String
  buyerOrgId    String                        // who pays (co-op or buyer org)
  cooperativeId String?
  batchId       String?
  batch         PurchaseBatch? @relation(fields: [batchId], references: [id])
  cropId        String
  cropCycleId   String?
  grade         String?
  quantity      Decimal        @db.Decimal(12,2)
  unit          String         @default("kg")
  bags          Int?
  unitPriceLe   Decimal        @db.Decimal(14,2)
  grossLe       Decimal        @db.Decimal(14,2)
  deductionsLe  Decimal        @db.Decimal(14,2) @default(0) // e.g. transport, agreed in writing
  netLe         Decimal        @db.Decimal(14,2)
  status        PurchaseStatus @default(RECORDED)
  recordedById  String
  recordedAt    DateTime       @default(now())
  latitude      Float?
  longitude     Float?
  farmerAcknowledged Boolean   @default(false) // via USSD/SMS reply
  disputeReason String?
  @@index([farmerId])
  @@index([buyerOrgId, status])
}
```

## 5. Business rules

- `grossLe = quantity × unitPriceLe`; `netLe = grossLe − deductionsLe`. Computed on the server, never trusted from the client.
- Default price comes from the active `PriceList`; overriding it requires a reason and is audited.
- Deductions must be itemised (type + amount) and shown in the farmer's SMS receipt.
- **Approval:** purchases above a co-op-defined threshold, and all batches, need approval by a second user (maker–checker) before payment.
- When approved → emit `purchase.approved` → module 04 creates the payment with the waterfall.
- **Farmer acknowledgement:** farmer gets an SMS; can reply `1` to confirm or `2` to dispute within 48 hours. A dispute freezes payment until a co-op admin resolves it.
- Cancellation allowed only before payment starts.
- Purchases are also written as `FarmRecord` type `SALE` (module 05) via event.

## 6. API / server actions

| Function                               | Who                                           |
| -------------------------------------- | --------------------------------------------- |
| `upsertCooperativeSettings`            | COOP_ADMIN                                    |
| `createCollectionPoint`                | COOP_ADMIN, BUYER_ADMIN                       |
| `setPrice(cropId, grade, priceLe)`     | COOP_ADMIN, BUYER_ADMIN                       |
| `recordPurchase(input)`                | COOP_STAFF, BUYER_STAFF, AGENT                |
| `POST /api/sync/purchases`             | offline field app (idempotent by `clientRef`) |
| `openBatch / addToBatch / submitBatch` | staff                                         |
| `approvePurchase / approveBatch`       | COOP_ADMIN, BUYER_ADMIN (not the creator)     |
| `cancelPurchase(id, reason)`           | admin                                         |
| `acknowledgePurchase(ref, accept       | dispute)`                                     | FARMER (USSD/SMS) |
| `resolveDispute(id, outcome)`          | COOP_ADMIN                                    |
| `listPurchases(filters)`               | scoped                                        |

## 7. UI screens & routes

- `/(coop)/collections/new`: fast weigh-point screen — scan/search farmer (ID, phone, name), crop, grade, bags, kg, price auto-filled, live gross/net, save & next. Works offline.
- `/(coop)/collections`: batches by day/collection point with totals.
- `/(coop)/collections/[batchId]`: review list, edit before submit, **Approve & Pay** button (shows waterfall preview from 04).
- `/(coop)/prices`: price list management.
- `/(coop)/disputes`.
- `/(buyer)/purchases`, `/(buyer)/suppliers` (farmers supplied, volumes; traceability export CSV).
- `/(coop)/settings`: dues %, approval threshold, collection points.

## 8. USSD / SMS touchpoints

- SMS receipt: "AgriPay: {coop} bought 20 bags (1,000kg) RICE grade A @ Le 4.00/kg = Le 4,000. Deductions Le 0. Reply 1 to confirm, 2 to report a problem. Ref PUR-8F2K."
- USSD _My Sales_: last 5 purchases with status.

## 9. Step-by-step implementation

1. Add `trade.prisma`; link `Farmer.cooperativeId` to `Cooperative`; migrate.
2. Seed: 2 co-ops (Bombali rice, Kenema cocoa), 1 buyer (aggregator), collection points, price lists.
3. Zod: `recordPurchaseSchema` (quantity > 0, price > 0, max quantity sanity check per crop).
4. `pricingService.getActivePrice(org, crop, grade, date)`.
5. `purchaseService.record()` — compute amounts, attach crop cycle (latest open cycle for that crop), audit, emit `purchase.recorded`, enqueue SMS receipt.
6. Batch service: open/add/submit/approve with **maker–checker** enforcement.
7. Approval → emit `purchase.approved` (consumed by module 04).
8. Weigh-point UI with farmer search (command palette), keyboard-friendly, offline queue (reuse sync engine from module 02).
9. Batch review page + waterfall preview (calls 04 `previewWaterfall`).
10. SMS reply handler for acknowledgement/dispute (module 09 inbound SMS → `acknowledgePurchase`).
11. Disputes page and resolution flow (unfreezes or cancels).
12. Buyer supplier report + CSV export (traceability).
13. Event consumer: `purchase.recorded` → create `FarmRecord(SALE)` (module 05).
    ✅ _Checkpoint:_ record 10 purchases offline → sync → submit batch → second user approves → payments created in 04.

## 10. Acceptance criteria

- Same person cannot both submit and approve a batch.
- Amounts always computed by the server; price override requires a reason.
- Farmer receives SMS receipt with quantity, price, deductions and reference.
- A disputed purchase is not paid until resolved.
- Buyer can export supplier list with farmer ID, location, crop and volumes.

## 11. Tests

- Unit: amount calculation with decimals; price lookup by date/grade.
- Integration: maker–checker; offline idempotency; dispute freezes payment.
- E2E: weigh-point → batch approve → payment created.
