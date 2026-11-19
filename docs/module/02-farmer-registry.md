# Module 02 — Farmer Registry (offline-capable)

## 1. Purpose

Create a trusted digital identity for each smallholder farmer — profile, location, farm plots, crops, wallets and cooperative link — captured by field agents **even without network**, and issue a unique **AgriLink Farmer ID**.

## 2. Scope

**In:** farmer profile, household info, wallets, plots (GPS), crop cycles per season, co-op membership, agent assignment, KYC tier, duplicate detection, offline capture + sync, bulk CSV import, farmer self-view.
**Out:** Farm records (05), score (07).

## 3. Dependencies

00, 01, 10 (SMS), 13 (audit).

## 4. Data model (`prisma/schema/farmer.prisma`)

```prisma
enum Gender { FEMALE MALE OTHER UNDISCLOSED }
enum MobileMoneyProvider { ORANGE_MONEY AFRIMONEY QMONEY }
enum FarmerStatus { DRAFT ACTIVE INACTIVE DUPLICATE_SUSPECTED }

model Farmer {
  id             String       @id @default(cuid())
  agrilinkId      String       @unique          // AP-BOM-000123
  userId         String       @unique
  fullName       String
  gender         Gender
  dateOfBirth    DateTime?
  nin            String?      @unique
  hasDisability  Boolean      @default(false)
  householdSize  Int?
  isHouseholdHead Boolean?
  districtId     String
  chiefdomId     String
  community      String
  photoKey       String?                       // S3 object key
  status         FarmerStatus @default(ACTIVE)
  kycTier        Int          @default(1)
  cooperativeId  String?
  registeredById String?                       // agent userId
  registeredVia  String                        // AGENT_APP, USSD, CSV, COOP_PORTAL
  clientRef      String?      @unique          // offline client UUID for idempotent sync
  wallets        Wallet[]
  plots          FarmPlot[]
  createdAt      DateTime     @default(now())
  updatedAt      DateTime     @updatedAt
  @@index([districtId, chiefdomId])
  @@index([cooperativeId])
}

model Wallet {
  id         String              @id @default(cuid())
  farmerId   String
  farmer     Farmer              @relation(fields: [farmerId], references: [id])
  provider   MobileMoneyProvider
  msisdn     String
  accountName String?            // name returned by provider lookup
  verified   Boolean             @default(false)
  isPrimary  Boolean             @default(false)
  @@unique([provider, msisdn])
}

model FarmPlot {
  id         String      @id @default(cuid())
  farmerId   String
  farmer     Farmer      @relation(fields: [farmerId], references: [id])
  name       String?
  sizeAcres  Decimal     @db.Decimal(8,2)
  tenure     String?     // OWNED, FAMILY, RENTED, SHARECROP, COMMUNITY
  latitude   Float?
  longitude  Float?
  // geom geometry(Polygon,4326) added via SQL migration
  cropCycles CropCycle[]
}

model CropCycle {
  id              String    @id @default(cuid())
  plotId          String
  plot            FarmPlot  @relation(fields: [plotId], references: [id])
  cropId          String
  season          String    // 2027-MAIN, 2027-DRY
  plantedAt       DateTime?
  expectedHarvest DateTime?
  harvestedAt     DateTime?
  expectedYieldKg Decimal?  @db.Decimal(12,2)
  actualYieldKg   Decimal?  @db.Decimal(12,2)
}

model AgentAssignment {
  id            String @id @default(cuid())
  agentUserId   String
  cooperativeId String?
  chiefdomId    String?
  active        Boolean @default(true)
}
```

## 5. Business rules

- **Minimum to register (tier 1):** name, gender, phone, district, chiefdom, community, one crop. Everything else optional, so registration takes **under 3 minutes**.
- **Tier 2:** + verified wallet name match **or** co-op attestation. **Tier 3:** + NIN.
- **AgriLink ID:** `AP-{DISTRICT_CODE}-{6-digit sequence}`; never reused.
- **Duplicates:** flag `DUPLICATE_SUSPECTED` if the same phone or NIN exists, or same name + DOB + chiefdom (fuzzy, trigram similarity > 0.8). The agent sees a warning; a co-op admin resolves.
- **Women in household farms** are registered as individual farmers, so payments go to the person who grew the crop.
- Phone of a family member allowed (shared phones are common) but flagged `sharedPhone: true` in metadata; the wallet must still be the farmer's own or nominated.
- Offline records carry a `clientRef` UUID → server upsert is **idempotent**.

## 6. API / server actions

| Function                       | Who                     | Notes                                                                        |
| ------------------------------ | ----------------------- | ---------------------------------------------------------------------------- |
| `registerFarmer(input)`        | AGENT, COOP_*           | creates User(FARMER) + Farmer + Wallet + Plot + CropCycle in one transaction |
| `POST /api/sync/farmers`       | AGENT (PWA)             | batch upsert by `clientRef`, returns per-record status                       |
| `updateFarmer(id, patch)`      | AGENT (own), COOP_*     |                                                                              |
| `addWallet / verifyWallet`     | AGENT, FARMER           | verify = provider name lookup (module 04 adapter)                            |
| `addPlot`, `addCropCycle`      | AGENT, FARMER           |                                                                              |
| `searchFarmers(q, filters)`    | scoped by role          | by name, phone, AgriLink ID                                                  |
| `importFarmersCsv(file)`       | COOP_ADMIN              | dry run → preview errors → commit                                            |
| `resolveDuplicate(id, action)` | COOP_ADMIN, SUPER_ADMIN | merge / keep both                                                            |

## 7. UI screens & routes

- `/(agent)/farmers/new`: **multi-step wizard** — (1) Person (2) Location (3) Phone & wallet (4) Farm & crop (5) Photo & consent to register (6) Review. Large inputs, works offline, progress saved locally.
- `/(agent)/farmers`: list with sync status badge (Synced / Pending / Error).
- `/(agent)/sync`: queue view, retry, last sync time.
- `/(coop)/members`: member table, filters (gender, crop, chiefdom, tier), import CSV, duplicates tab.
- `/(coop)/members/[id]`: profile, plots map (Leaflet or MapLibre), crops, wallets.
- `/(farmer)/profile`: farmer self-view with AgriLink ID card.

## 8. Offline design (agent PWA)

- **Serwist** service worker caches the app shell and reference data (districts, chiefdoms, crops, the agent's co-op members).
- **Dexie (IndexedDB)** tables: `pendingFarmers`, `pendingPhotos`, `referenceData`, `syncLog`.
- Sync: on `online` event + every 5 min + manual button; batches of 25; exponential backoff; photos uploaded after the record via presigned S3 URL.
- Conflict rule: server wins for verified fields (wallet, NIN); last-write-wins for the rest, with an audit entry.
- GPS captured from the browser geolocation API with accuracy; stored only if accuracy < 50 m.

## 9. USSD / SMS touchpoints

- SMS after registration: "Welcome to AgriLink, {name}. Your ID is AP-BOM-000123. Dial *XXX# to set your PIN."
- USSD _My Profile_: shows ID, co-op, primary wallet.
- USSD self-registration (basic tier, optional): name → district → chiefdom → crop.

## 10. Step-by-step implementation

1. Add `farmer.prisma`; migrate; add SQL migration for `geom` column + GIST index and `pg_trgm` for fuzzy search.
2. Zod schemas: `farmerCoreSchema`, `walletSchema`, `plotSchema`, `cropCycleSchema`, `registerFarmerSchema` (composition).
3. ID generator: Postgres sequence per district; `nextFarmerId(districtCode)`.
4. `farmerService.register()` in a transaction: create User → Farmer → Wallet → Plot → CropCycle → audit → emit `farmer.registered` → enqueue welcome SMS.
5. Duplicate check service (phone, NIN, trigram name + chiefdom).
6. Online wizard UI (shadcn `Form`, `Stepper` component, district → chiefdom dependent selects).
7. Farmer list & profile pages for co-op portal (DataTable, filters, map).
8. **Offline:** add Serwist, PWA manifest (icons, theme colour), Dexie schema, `useOfflineForm` hook writing to IndexedDB.
9. Sync endpoint `/api/sync/farmers` (idempotent by `clientRef`, per-record result) + client sync engine.
10. Photo upload: presigned URL route, client compression (max 200 KB).
11. CSV import: template download, parse with Papaparse, validate rows with Zod, preview table, commit in chunks.
12. Duplicates resolution screen.
13. Wallet verification hook (calls module 04 `lookupAccountName` when available; mock in MVP).
14. Seed 60 farmers across 2 co-ops (≥50% women, mix of crops).
    ✅ _Checkpoint:_ register a farmer in airplane mode → reconnect → appears in co-op member list with SMS logged.

## 11. Acceptance criteria

- Registration with minimum fields takes < 3 minutes on a low-end Android.
- Offline-captured records sync without duplicates, even if sync is retried.
- Co-op admin sees only own members; agent only assigned farmers.
- Duplicate phone/NIN is flagged.
- Gender, youth (age 18–35) and disability fields available for disaggregated reporting.

## 12. Tests

- Unit: ID generation, duplicate scoring, Zod schemas.
- Integration: register transaction rolls back fully on failure; sync idempotency (same `clientRef` twice).
- E2E: agent wizard happy path; offline → online sync (Playwright `context.setOffline(true)`).
