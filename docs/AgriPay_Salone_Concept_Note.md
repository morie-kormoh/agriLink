# AgriPay Salone — Concept Note

**Short name:** AgriPay
**Tagline:** _Empowering Farmers Through Digital Finance._
**Positioning:** A Digital Agricultural Financial Inclusion Platform
**Challenge:** Sierra Leone FinTech Innovation Challenge 2026 — _Growing Financial Inclusion Through Agricultural Innovation_ (UNCDF / Salone Access to Finance, with Bank of Sierra Leone, UNDP and the EU; managed by Muzambiringa)
**Use cases addressed (TOR §3):** Digital payments · Savings · Credit scoring · Record keeping · Digital transformation (with Insurance as a partner add-on in phase 2)
**Application deadline:** 20 November 2026

---

## 1. One-line pitch

AgriPay turns what a farmer already does — registering with a cooperative, planting, selling produce, receiving payments — into a **verified financial history** that unlocks **automatic seasonal savings, faster buyer payments and responsible credit**, on any phone, over any mobile money network.

## 2. What AgriPay is — and what it is not

AgriPay is **not another mobile money wallet**. Sierra Leone already has three mobile money operators (Orange Money, Afrimoney, QMoney) with more than 2.5 million active wallets, and the National Payment Switch (SaPS) now connects banks and mobile money. Building a fourth wallet would compete with that infrastructure instead of using it.

AgriPay sits **on top of** those rails as an **agricultural finance layer**:

| A mobile money app does…   | AgriPay does…                                                                                                   |
| -------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Move money between wallets | Knows _why_ money moved — which harvest, which buyer, which input loan                                          |
| Store a balance            | Splits each harvest payment into repayment, locked savings and spendable cash                                   |
| Show a transaction list    | Builds a **Farm Financial Passport**: a consented, explainable credit-readiness profile                         |
| Serve the individual       | Serves the whole value chain: farmer, cooperative, buyer/aggregator, input dealer, lender, government programme |

**Competitive advantage:** the link between _agricultural activity data_ (what was planted, how much was sold, to whom) and _financial transaction data_ (what was paid, saved and repaid). Lenders in rural Sierra Leone lack exactly that link, which is why they don't lend to smallholders.

## 3. Problem statement

**Who:** smallholder farmers (rice, cassava, cocoa, coffee, oil palm, vegetables, groundnut), farmer cooperatives / FBOs, and the agri-SMEs that buy from and sell inputs to them — with a deliberate focus on **women, youth and persons with disabilities**.

**The problem:**

1. **Farmers are financially invisible.** Financial inclusion in Sierra Leone stands at 39% (Global Findex 2024). Farmers have no records, no collateral and no credit history, so banks, community banks, MFIs and FSAs cannot assess them. Most institutions are concentrated in Freetown, Bo and Kenema and have no business case for reaching remote farmers.
2. **Payments are cash, late and leaky.** Buyers and cooperatives pay in cash at the farm gate. That brings theft risk, disputes over weights and prices, middleman deductions and no paper trail.
3. **Income is seasonal, spending isn't.** Cash arrives in a lump at harvest and is gone by planting season. Farmers then borrow inputs at high informal rates or plant less.
4. **Credit, when available, ignores the crop calendar.** Monthly repayment schedules don't fit farmers who earn once or twice a year, which drives default and makes lenders more reluctant.
5. **Programme data is fragmented.** Government and donor programmes (input subsidies, extension, food security) re-register the same farmers on paper or in separate systems, and payments to farmers are hard to target and audit.

**The cost:** low yields from under-investment in inputs, post-harvest losses, lost income to middlemen, and a rural economy that stays cash-based even where mobile money agents exist.

## 4. Solution overview

AgriPay combines five things into one system that runs on **smartphones, feature phones (USSD/SMS) and through field agents**:

### 4.1 Digital Farmer Registration (the foundation)

- Field agents, cooperative officers or the farmer (via USSD) register farmer profile, household, cooperative, farm plots (GPS point/polygon), crops and season.
- Identity linked to phone number + mobile money wallet + National Identification Number (NIN) where available. Records without an NIN aren't blocked; KYC is tiered.
- Works **offline**: agents capture data in the field and sync when connected.
- Output: a unique **AgriPay Farmer ID** and an SMS confirmation.

### 4.2 Farm Records (simple record-keeping)

- Log planting, inputs bought, labour costs, harvest quantity and sales — by voice-guided USSD menu, SMS shortcode, the app, or via the cooperative.
- Most records are captured **automatically**: when a buyer pays through AgriPay, the sale (crop, quantity, price, buyer) is recorded with no extra effort from the farmer.
- Farmer receives a seasonal **"Farm Profit Summary"** by SMS: what they spent, sold and earned.

### 4.3 Digital Buyer Payments (Buyer-to-Farmer Pay)

- Cooperatives, aggregators, agribusinesses and processors record a purchase (weight, grade, price) at collection and pay the farmer **directly to their mobile money wallet** via the operator's API or SaPS.
- Bulk payment upload for large buyers; digital receipt to farmer by SMS.
- Every payment carries agricultural metadata, so it builds the farmer's history.

### 4.4 Smart Split & Harvest Savings (the key differentiator)

When a harvest payment arrives, AgriPay applies a **payment waterfall** the farmer agreed to in advance:

```
Harvest payment Le 5,000
 ├─ 1. Input loan repayment (if any) ........ Le 1,200 → lender
 ├─ 2. "Harvest Lock" savings (e.g. 15%) ..... Le   570 → locked savings account/wallet
 ├─ 3. Cooperative dues (if agreed) .......... Le    50 → cooperative
 └─ 4. Balance to farmer's wallet ............ Le 3,180
```

- **Harvest Lock:** savings are held with a partner bank, community bank, FSA or MFI (or a locked mobile money savings product) and released at the **start of the next planting season**, when farmers need inputs.
- **Group savings (digital Osusu / VSLA):** cooperatives and women's groups can run rotating or goal-based savings with transparent digital records.
- **Repayment at source** reduces default risk for lenders. That is why they would lend through AgriPay.

### 4.5 Farm Financial Passport & Responsible Credit

- An **explainable credit-readiness score** built from alternative data:
  - registration completeness and verified identity
  - cooperative membership and peer group record
  - consistency of farm records across seasons
  - volume and regularity of sales paid through AgriPay
  - savings behaviour (Harvest Lock, group savings)
  - repayment history of past AgriPay-facilitated loans
  - farm size, crop and verified buyer contracts
- The farmer **sees their own score** and simple tips to improve it ("Save for 2 more months to qualify for a larger input loan").
- With the farmer's **explicit consent**, the passport is shared with partner lenders (community banks, MFIs, FSAs, commercial banks).
- **Credit products** (designed with lenders, funded by lenders, not by AgriPay):
  - **Input credit** paid as a **restricted e-voucher** redeemable only at registered agro-dealers, so the loan goes to seed and fertiliser, not consumption.
  - **Harvest-aligned repayment** deducted automatically from the next buyer payment.
  - Small amounts first, growing with each repaid cycle (graduation model).
- Responsible lending guardrails: affordability check against recorded farm income, clear SMS disclosure of total cost in Leones, cooling-off period, no automatic loan rollover.

### 4.6 Partner & Programme Portals

- **Cooperative portal:** member registry, collections, bulk payments, group savings, member loans dashboard.
- **Buyer portal:** purchases, payments, supplier traceability (useful for cocoa/coffee export compliance).
- **Lender portal:** consented farmer passports, loan origination, disbursement to e-voucher, repayment tracking, portfolio risk.
- **Agro-dealer portal / USSD:** redeem input vouchers, get paid instantly.
- **Programme / government portal:** aggregated, anonymised dashboards by district and crop, and targeted digital disbursement for input subsidies or programme payments.

### 4.7 Phase 2 add-ons

- **Weather-index or area-yield micro-insurance**, bundled with input loans, through a licensed insurer partner.
- **Crowdfunded input finance**: diaspora and local individuals co-fund cooperative input loans, with repayment through the same waterfall.
- Market price SMS alerts and extension tips tied to each farmer's crop calendar.

## 5. Why a focused product, not a full "National Farmer Digital Platform"

A full national farmer platform (registry + extension + subsidies + markets + finance) is a multi-year government system. It depends on ministry ownership, procurement and data mandates, and it is beyond the scope of an early-stage grant.

AgriPay takes the **part of that vision that can work now and earn revenue**: farmer identity + records + payments + savings + credit, built so it can **feed a national registry later** instead of competing with one.

| Now (2026–2027)                                                             | Future (2028+)                                                                                             |
| --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Farmer registration through cooperatives and buyers who already pay farmers | Open API to sync with a Ministry of Agriculture national farmer registry                                   |
| Payments over existing MMO wallets and SaPS                                 | Interoperable payments across all banks/MMOs via SaPS as standard                                          |
| Rule-based, explainable credit score                                        | Machine-learning scoring once multi-season data exists, validated with lenders                             |
| Lender-funded input credit pilots                                           | Portfolio guarantees / blended finance with development partners                                           |
| Anonymised programme dashboards                                             | Digital delivery rail for government input subsidies and food-security programmes (e.g. under Feed Salone) |
| USSD + SMS + PWA                                                            | Voice/IVR in Krio, Mende, Temne, Limba; WhatsApp channel                                                   |

This answers the **Priority 1** goals — food security, agricultural financing, farmer identification and support for government programmes — with a product that can be piloted in 2027.

## 6. Target users and user journeys

### Personas

| User                                                                           | Device                            | Main need                                                                 |
| ------------------------------------------------------------------------------ | --------------------------------- | ------------------------------------------------------------------------- |
| **Aminata**, 34, rice & groundnut farmer, cooperative member, Bombali district | Basic feature phone, Orange Money | Get paid safely, keep money for planting season, get fertiliser on credit |
| **Mohamed**, 27, youth vegetable farmer near Kenema                            | Low-end Android                   | Keep records, prove income, get a small loan for irrigation               |
| **Cooperative secretary** (FBO of 300 members)                                 | Android tablet                    | Register members, record collections, pay members, run group savings      |
| **Aggregator / agribusiness buyer** (cocoa, rice, cassava)                     | Laptop + smartphone               | Pay hundreds of farmers digitally, cut cash handling, trace supply        |
| **Loan officer** at a community bank / MFI / FSA                               | Laptop                            | Find creditworthy farmers, disburse and collect cheaply                   |
| **Agro-dealer** in a district town                                             | Feature phone                     | Redeem input vouchers and be paid immediately                             |
| **AgriPay field agent** (youth, often a mobile money agent)                    | Android, offline-capable          | Register and support farmers, earn commission                             |

### Journey — Aminata (feature phone, USSD)

1. **Register:** the cooperative's field agent registers Aminata during a group meeting (offline). She receives an SMS with her AgriPay ID and dials `*XXX#` to set a PIN.
2. **Plant and record:** at planting, she dials USSD → _My Farm_ → _Planting_ and selects rice, 2 acres.
3. **Sell and get paid:** at harvest the cooperative weighs her 20 bags and records the sale. AgriPay pays her Orange Money wallet within minutes. SMS: _"You sold 20 bags rice @ Le 400 = Le 8,000. Saved Le 1,200 in Harvest Lock. Le 6,800 sent to your wallet."_
4. **Save automatically:** 15% goes into Harvest Lock, released at the start of the next planting season.
5. **Qualify for credit:** after one season her passport shows verified sales and savings. SMS: *"You can apply for a fertiliser loan up to Le 2,000. Dial _XXX# to see terms."_
6. **Use input credit:** she accepts with consent and PIN, receives an e-voucher code, and redeems it at the agro-dealer for fertiliser. The agro-dealer is paid instantly by the lender.
7. **Repay without effort:** at the next harvest the repayment is deducted from her buyer payment, and her next loan limit grows.

### Journey — Cooperative / buyer

Upload member list or register via app → record collections at weigh point (offline) → approve bulk payment → AgriPay sends instructions to the mobile money operator → every member gets an SMS receipt → dashboard shows paid, pending and failed payments with automatic retry.

### Journey — Lender

Create a loan product (amount, crop, season, price, eligibility rules) → view consented farmer passports that match → approve → disburse as an e-voucher → track repayments collected through the waterfall → see portfolio at-risk by district and crop.

## 7. Inclusion design (gender, youth, disability, offline)

- **Feature-phone first:** every core farmer action works over **USSD and SMS**. The smartphone app is a bonus, not a requirement.
- **Offline-first field tools:** agents and cooperatives capture data with no network and sync later.
- **Local languages:** English and Krio at launch; Mende, Temne and Limba next. Audio/IVR prompts for low-literacy users.
- **Women:** registration through women's groups and VSLAs; individual accounts for women within household farms, so income is paid to the person who grew the crop; group savings and group-guaranteed loans.
- **Youth:** recruited as paid AgriPay field agents (direct jobs) and supported with records that prove income from small plots.
- **Disability:** USSD flows with few steps, voice options, agent-assisted service, and accessible web portals (WCAG 2.1 AA, Radix primitives).
- **Trust:** SMS receipt for every transaction, a simple dispute line through the cooperative, and no hidden charges.

## 8. Business model

**Principle:** farmers use core services **free**. Revenue comes from the institutions that save money or gain business through AgriPay.

| Revenue stream                        | Who pays                                  | Basis                                                                                       |
| ------------------------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------- |
| Cooperative / buyer SaaS subscription | Cooperatives, aggregators, agribusinesses | Monthly fee by number of active members/suppliers                                           |
| Payment processing fee                | Buyers                                    | ~0.5% of digital farmer payment volume (cheaper than cash handling, transport and security) |
| Loan origination / facilitation fee   | Lenders                                   | ~2% of each loan originated and serviced through AgriPay                                    |
| Agro-dealer voucher commission        | Agro-dealers / input suppliers            | ~3% of input voucher value redeemed                                                         |
| Programme delivery contracts          | Government, NGOs, development partners    | Fee per farmer registered/paid, or per programme                                            |
| Revenue share (phase 2)               | Insurers, MMOs                            | Commission on insurance premiums; share of transaction fees                                 |

### Illustrative 3-year projection (assumptions, USD)

|                                 | Year 1 (pilot, 2027) | Year 2       | Year 3        |
| ------------------------------- | -------------------- | ------------ | ------------- |
| Active farmers                  | 5,000                | 25,000       | 75,000        |
| Paying cooperatives/buyers      | 20                   | 80           | 200           |
| SaaS (avg $25–30/month)         | 6,000                | 24,000       | 72,000        |
| Farmer payment volume           | 400,000              | 2,500,000    | 8,000,000     |
| Payment fees (0.5%)             | 2,000                | 12,500       | 40,000        |
| Loans facilitated (count × avg) | 800 × $150           | 5,000 × $180 | 15,000 × $200 |
| Origination fees (2%)           | 2,400                | 18,000       | 60,000        |
| Input vouchers redeemed         | 60,000               | 400,000      | 1,200,000     |
| Voucher commission (3%)         | 1,800                | 12,000       | 36,000        |
| Programme contracts             | 10,000               | 30,000       | 50,000        |
| **Total revenue**               | **22,200**           | **96,500**   | **258,000**   |

_These are planning assumptions to be validated during the accelerator and pilot. Main cost drivers: field agents, SMS/USSD session costs, hosting, compliance and partnerships._

**Path to sustainability:** USSD/SMS costs are covered by buyer and lender fees. Field agent commissions are paid per active farmer, not per registration, to avoid ghost farmers. Break-even is targeted in Year 3 as transaction and lending volume grows.

## 9. Regulatory & compliance approach

- **AgriPay does not hold customer funds.** Money moves through licensed MMOs, banks and SaPS. AgriPay is the technology, data and orchestration layer. This lowers regulatory and capital requirements at the start.
- Engage the **Bank of Sierra Leone regulatory sandbox** for the payment-split and e-voucher features. Map the licence path (e.g. payment service provider) for later phases.
- **Data protection by design:** explicit, granular farmer consent for any data sharing; consent log; right to view and withdraw; encryption at rest and in transit; role-based access; full audit trail. Comply with applicable Sierra Leone data protection law and BSL guidance.
- **Consumer protection:** plain-language disclosure of all loan costs in Leones before acceptance, complaint handling, and no harassment-style collection.
- **KYC:** tiered — phone + cooperative attestation for basic tier, NIN for higher limits, aligned with MMO and lender KYC rules.

## 10. Technology architecture

### 10.1 Core stack (as specified)

| Layer                | Technology                                                                                 |
| -------------------- | ------------------------------------------------------------------------------------------ |
| Language             | **TypeScript** throughout                                                                  |
| JavaScript framework | **React** with **Next.js** (App Router, Server Components, Server Actions, Route Handlers) |
| UI                   | **Tailwind CSS**, **shadcn/ui**, **Radix UI** primitives                                   |
| Icons                | **Lucide**                                                                                 |
| Server runtime       | **Node.js** (LTS)                                                                          |
| Database             | **PostgreSQL** with **Prisma ORM**                                                         |

### 10.2 Recommended additions

| Need            | Recommendation                                                                                                                                                                          | Why                                                                     |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Monorepo        | **Turborepo + pnpm workspaces**                                                                                                                                                         | Share DB schema, UI and business logic across web, USSD and worker apps |
| Validation      | **Zod** + **React Hook Form**                                                                                                                                                           | One schema for forms, APIs and USSD inputs                              |
| Data fetching   | **TanStack Query** (client) + Server Components                                                                                                                                         | Caching and retries on weak networks                                    |
| Tables / charts | **TanStack Table**, **Recharts** (shadcn charts)                                                                                                                                        | Cooperative, lender and programme dashboards                            |
| Auth            | **Auth.js** or **Better Auth** with **phone + OTP** and **PIN**, plus role-based access control                                                                                         | Farmers have phone numbers, not emails                                  |
| i18n            | **next-intl**                                                                                                                                                                           | English, Krio and later local languages                                 |
| Offline / PWA   | **Serwist** (service worker) + **Dexie (IndexedDB)** + a sync queue with conflict rules                                                                                                 | Field agents work without network                                       |
| Background jobs | **Redis + BullMQ**                                                                                                                                                                      | Bulk payments, retries, SMS, scoring, reconciliation                    |
| USSD / SMS      | Separate **Node USSD service** (Fastify) with a session state machine; SMS/USSD through an aggregator or direct MNO connection with coverage in Sierra Leone (Orange, Africell, QCell)  | Feature-phone access                                                    |
| Payments        | **Payment adapter layer** — one interface, separate adapters for Orange Money, Afrimoney, QMoney and SaPS/bank APIs; idempotency keys; webhook verification; double-entry ledger tables | Network-agnostic and safe for retries                                   |
| Geo             | **PostGIS** extension                                                                                                                                                                   | Farm plots, district analytics                                          |
| Files           | **S3-compatible storage** (e.g. MinIO / AWS S3)                                                                                                                                         | ID images, receipts, documents                                          |
| Credit scoring  | Phase 1: **rule-based explainable scorecard** in a TypeScript package. Phase 2: **Python FastAPI** ML service once multi-season data exists                                             | Transparent to farmers and lenders now, smarter later                   |
| Observability   | **Sentry**, structured logs (Pino), **OpenTelemetry**                                                                                                                                   | Track failed payments and USSD timeouts                                 |
| Testing         | **Vitest**, **Playwright**, Prisma test DB                                                                                                                                              | Payment and waterfall logic must be well tested                         |
| DevOps          | **Docker**, **GitHub Actions** CI/CD; hosting with a region close to West Africa; daily encrypted Postgres backups                                                                      | Reliability and data safety                                             |

### 10.3 System architecture

```
                ┌───────────────────────── Channels ─────────────────────────┐
 Feature phone ─┤ USSD / SMS gateway ──► apps/ussd (Node/Fastify state machine) │
 Smartphone ────┤ PWA (Next.js, offline sync)                                 │
 Agents/Co-ops ─┤ PWA offline field app                                       │
 Partners ──────┤ Web portals: Co-op · Buyer · Lender · Agro-dealer · Admin   │
                └───────────────────────────┬────────────────────────────────┘
                                            ▼
                ┌──────────────── apps/web (Next.js + Node) ─────────────────┐
                │ Auth & RBAC · Farmer Registry · Farm Records · Purchases    │
                │ Payment Orchestrator (waterfall) · Savings · Credit/Vouchers│
                │ Consent Manager · Notifications · Reporting · Audit Log     │
                └───────┬──────────────┬───────────────┬─────────────────────┘
                        ▼              ▼               ▼
                 PostgreSQL +     Redis/BullMQ     Scoring engine
                 PostGIS (Prisma) (jobs, retries)  (TS rules → FastAPI ML)
                        │
                        ▼
        ┌───────────── Payment adapters ─────────────┐
        │ Orange Money · Afrimoney · QMoney · SaPS/Banks │
        └────────────────────────────────────────────┘
```

### 10.4 Proposed repository structure (`Development/agripay`)

```
agripay/
├─ apps/
│  ├─ web/            # Next.js: farmer PWA + co-op, buyer, lender, dealer, admin portals
│  ├─ ussd/           # Node/Fastify USSD + SMS service
│  └─ worker/         # BullMQ jobs: payments, reconciliation, SMS, scoring
├─ packages/
│  ├─ db/             # Prisma schema, migrations, seed (districts, chiefdoms, crops)
│  ├─ ui/             # shadcn/ui + Radix components, Tailwind preset, Lucide icons
│  ├─ payments/       # payment adapter interface + MMO/SaPS adapters + ledger
│  ├─ scoring/        # Farm Financial Passport rules engine
│  ├─ validation/     # shared Zod schemas
│  └─ i18n/           # en, kri (Krio), men, tem translation files
├─ docs/
│  ├─ concept_note.md
│  └─ modules/
├─ docker-compose.yml # postgres+postgis, redis, minio
└─ turbo.json
```

### 10.5 Core data model (Prisma sketch)

```prisma
enum Role { FARMER AGENT COOP_ADMIN BUYER LENDER AGRO_DEALER PROGRAMME_OFFICER SUPER_ADMIN }
enum Gender { FEMALE MALE OTHER UNDISCLOSED }
enum MobileMoneyProvider { ORANGE_MONEY AFRIMONEY QMONEY }
enum PaymentStatus { PENDING PROCESSING SUCCESS FAILED REVERSED }
enum LoanStatus { APPLIED APPROVED DISBURSED REPAYING REPAID DEFAULTED WRITTEN_OFF }

model User {
  id          String   @id @default(cuid())
  phone       String   @unique
  role        Role
  pinHash     String?
  language    String   @default("en")
  farmer      Farmer?
  createdAt   DateTime @default(now())
}

model Farmer {
  id             String   @id @default(cuid())
  agripayId      String   @unique           // e.g. AP-BOM-000123
  userId         String   @unique
  user           User     @relation(fields: [userId], references: [id])
  fullName       String
  gender         Gender
  dateOfBirth    DateTime?
  nin            String?  @unique            // National Identification Number (optional tier)
  hasDisability  Boolean  @default(false)
  district       String
  chiefdom       String
  community      String
  cooperativeId  String?
  cooperative    Cooperative? @relation(fields: [cooperativeId], references: [id])
  registeredById String?                      // field agent
  kycTier        Int      @default(1)
  wallets        Wallet[]
  plots          FarmPlot[]
  records        FarmRecord[]
  sales          Purchase[]
  savings        SavingsAccount[]
  loans          Loan[]
  consents       Consent[]
  scores         CreditScore[]
  createdAt      DateTime @default(now())
}

model Wallet {
  id        String              @id @default(cuid())
  farmerId  String
  farmer    Farmer              @relation(fields: [farmerId], references: [id])
  provider  MobileMoneyProvider
  msisdn    String
  verified  Boolean             @default(false)
  isPrimary Boolean             @default(false)
}

model Cooperative {
  id        String   @id @default(cuid())
  name      String
  district  String
  members   Farmer[]
  purchases Purchase[]
}

model FarmPlot {
  id        String  @id @default(cuid())
  farmerId  String
  farmer    Farmer  @relation(fields: [farmerId], references: [id])
  sizeAcres Decimal
  latitude  Float?
  longitude Float?
  // PostGIS polygon managed via raw SQL migration
  crops     CropCycle[]
}

model CropCycle {
  id          String   @id @default(cuid())
  plotId      String
  plot        FarmPlot @relation(fields: [plotId], references: [id])
  crop        String   // RICE, CASSAVA, COCOA, ...
  season      String   // e.g. 2027-MAIN
  plantedAt   DateTime?
  harvestedAt DateTime?
  expectedYieldKg Decimal?
}

model FarmRecord {
  id        String   @id @default(cuid())
  farmerId  String
  farmer    Farmer   @relation(fields: [farmerId], references: [id])
  type      String   // INPUT_COST, LABOUR, HARVEST, SALE, OTHER
  amountLe  Decimal?
  quantity  Decimal?
  unit      String?
  note      String?
  source    String   // USSD, APP, AGENT, AUTO_PURCHASE
  recordedAt DateTime @default(now())
}

model Buyer {
  id        String     @id @default(cuid())
  name      String
  type      String     // AGGREGATOR, PROCESSOR, EXPORTER, COOPERATIVE
  purchases Purchase[]
}

model Purchase {
  id            String   @id @default(cuid())
  farmerId      String
  farmer        Farmer   @relation(fields: [farmerId], references: [id])
  buyerId       String?
  buyer         Buyer?   @relation(fields: [buyerId], references: [id])
  cooperativeId String?
  cooperative   Cooperative? @relation(fields: [cooperativeId], references: [id])
  crop          String
  quantityKg    Decimal
  grade         String?
  unitPriceLe   Decimal
  totalLe       Decimal
  payment       Payment?
  createdAt     DateTime @default(now())
}

model Payment {
  id             String        @id @default(cuid())
  purchaseId     String?       @unique
  purchase       Purchase?     @relation(fields: [purchaseId], references: [id])
  grossLe        Decimal
  status         PaymentStatus @default(PENDING)
  idempotencyKey String        @unique
  splits         PaymentSplit[]
  providerRef    String?
  createdAt      DateTime      @default(now())
}

model PaymentSplit {            // the waterfall
  id        String  @id @default(cuid())
  paymentId String
  payment   Payment @relation(fields: [paymentId], references: [id])
  order     Int
  type      String  // LOAN_REPAYMENT, SAVINGS, COOP_DUES, FARMER_WALLET
  amountLe  Decimal
  targetRef String  // loanId / savingsAccountId / walletId
  status    PaymentStatus @default(PENDING)
}

model SavingsAccount {
  id          String   @id @default(cuid())
  farmerId    String
  farmer      Farmer   @relation(fields: [farmerId], references: [id])
  type        String   // HARVEST_LOCK, GROUP, GOAL
  partnerFi   String   // custodian institution
  balanceLe   Decimal  @default(0)
  autoSavePct Decimal? // e.g. 15.00
  lockedUntil DateTime?
}

model Lender {
  id       String @id @default(cuid())
  name     String
  type     String // COMMERCIAL_BANK, COMMUNITY_BANK, MFI, FSA
  products LoanProduct[]
}

model LoanProduct {
  id             String  @id @default(cuid())
  lenderId       String
  lender         Lender  @relation(fields: [lenderId], references: [id])
  name           String
  crop           String?
  maxAmountLe    Decimal
  flatFeePct     Decimal
  minScore       Int
  repaymentMode  String  // HARVEST_DEDUCTION, LUMP_SUM, INSTALMENTS
  loans          Loan[]
}

model Loan {
  id            String      @id @default(cuid())
  farmerId      String
  farmer        Farmer      @relation(fields: [farmerId], references: [id])
  productId     String
  product       LoanProduct @relation(fields: [productId], references: [id])
  principalLe   Decimal
  totalDueLe    Decimal
  repaidLe      Decimal     @default(0)
  status        LoanStatus  @default(APPLIED)
  voucher       InputVoucher?
  dueSeason     String
  createdAt     DateTime    @default(now())
}

model InputVoucher {
  id          String    @id @default(cuid())
  loanId      String    @unique
  loan        Loan      @relation(fields: [loanId], references: [id])
  code        String    @unique
  valueLe     Decimal
  redeemedAt  DateTime?
  agroDealerId String?
}

model Consent {
  id          String    @id @default(cuid())
  farmerId    String
  farmer      Farmer    @relation(fields: [farmerId], references: [id])
  grantedTo   String    // lenderId / programme id
  scope       String    // PASSPORT_SUMMARY, FULL_RECORDS
  grantedAt   DateTime  @default(now())
  revokedAt   DateTime?
  channel     String    // USSD, APP, AGENT
}

model CreditScore {
  id         String   @id @default(cuid())
  farmerId   String
  farmer     Farmer   @relation(fields: [farmerId], references: [id])
  score      Int      // 0–100
  band       String   // BUILDING, FAIR, GOOD, STRONG
  factors    Json     // explainable factor breakdown shown to farmer and lender
  modelVer   String
  computedAt DateTime @default(now())
}

model AuditLog {
  id        String   @id @default(cuid())
  actorId   String?
  action    String
  entity    String
  entityId  String
  meta      Json?
  createdAt DateTime @default(now())
}
```

### 10.6 Farm Financial Passport — v1 scorecard (explainable)

| Factor                                                     | Max points | Evidence                                                       |
| ---------------------------------------------------------- | ---------- | -------------------------------------------------------------- |
| Verified identity (phone + wallet + NIN/co-op attestation) | 10         | Registration & KYC                                             |
| Cooperative / group membership in good standing            | 10         | Co-op records                                                  |
| Farm records completeness (≥1 full season)                 | 15         | FarmRecord                                                     |
| Sales paid via AgriPay (volume & regularity)               | 20         | Purchase + Payment                                             |
| Savings behaviour (Harvest Lock / group savings)           | 15         | SavingsAccount                                                 |
| Repayment history on AgriPay loans                         | 25         | Loan                                                           |
| Verified buyer relationship / forward contract             | 5          | Buyer                                                          |
| **Total**                                                  | **100**    | Bands: 0–39 Building · 40–59 Fair · 60–79 Good · 80–100 Strong |

The lender sets the minimum band per product. The farmer always sees the factors and how to improve them.

## 11. Platform modules

| #   | Module                                                              | MVP?                      |
| --- | ------------------------------------------------------------------- | ------------------------- |
| 01  | Identity, Auth & Access (phone OTP, PIN, RBAC)                      | ✅                        |
| 02  | Farmer Registry (offline agent registration, plots, crops)          | ✅                        |
| 03  | Cooperatives & Buyers (members, collections, purchases)             | ✅                        |
| 04  | Payments Orchestrator (adapters, waterfall, ledger, reconciliation) | ✅ (sandbox/mock adapter) |
| 05  | Farm Records & Profit Summary                                       | ✅                        |
| 06  | Savings (Harvest Lock, group savings)                               | ✅                        |
| 07  | Farm Financial Passport & Consent                                   | ✅                        |
| 08  | Credit & Input Vouchers (lender products, agro-dealer redemption)   | Pilot                     |
| 09  | USSD & SMS channel                                                  | ✅ (core menus)           |
| 10  | Notifications & i18n                                                | ✅                        |
| 11  | Programme & Analytics Dashboards                                    | Pilot                     |
| 12  | Insurance & Crowdfunding integrations                               | Phase 2                   |
| 13  | Admin, Audit & Compliance                                           | ✅                        |

## 12. MVP scope and demo (mandatory for screening)

The TOR **requires a working prototype/MVP and a demo**. Minimum demo scope:

1. Agent registers a farmer (PWA, works offline, then syncs).
2. Cooperative records a purchase and triggers payment (mock MMO adapter showing the waterfall split).
3. Farmer receives a simulated SMS receipt and checks balance/savings through a **USSD simulator** in the browser.
4. Farm Financial Passport generated, with factor breakdown.
5. Farmer gives consent; lender portal shows the passport, approves a loan and issues an e-voucher; agro-dealer redeems it.
6. Dashboard: farmers registered, payments, savings and loans by district, disaggregated by gender and youth.

**Demo artefacts to submit:** demo link, 6–8 screenshots, 2–3 minute walkthrough video.

## 13. Roadmap

| Phase              | Dates                   | Milestones                                                                                                                                                     |
| ------------------ | ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **0. Application** | by 20 Nov 2026          | Concept, working demo, video, team CVs, registration documents                                                                                                 |
| **1. Accelerator** | 1 Dec 2026 – 8 Jan 2027 | User testing with 2 cooperatives (≥50 farmers, ≥50% women); refine USSD flows; MOU talks with 1 MMO, 1 community bank/MFI/FSA, 1 buyer; regulatory action plan |
| **2. Demo Day**    | 15 Jan 2027             | Pitch deck, live demo, pilot plan                                                                                                                              |
| **3. Pilot**       | Jan – Dec 2027          | 2 districts (e.g. Bombali and Kenema), 5,000 farmers, 20 cooperatives, live payments with 1–2 MMOs, first input-credit cycle with one lender                   |
| **4. Scale**       | 2028+                   | 5+ districts, all three MMOs via SaPS, insurance bundle, government programme integration, ML scoring                                                          |

## 14. Impact metrics (for quarterly reporting)

- Farmers registered — **% women, % youth (18–35), % with disability**
- Farmers with first-ever formal digital transaction
- Value and number of buyer-to-farmer digital payments; % of cooperative payments moved from cash to digital
- Farmers saving; total Harvest Lock savings released at planting
- Farmers with a Farm Financial Passport; % in "Fair" band or better
- Loans facilitated, value, **repayment rate**, % first-time borrowers
- Input vouchers redeemed; agro-dealers onboarded
- Jobs created (field agents, staff) — % youth and women
- Average time from sale to payment (target: same day)
- Farmer-reported change in income and input use (pilot survey baseline vs endline)

## 15. Risks and mitigation

| Risk                                      | Mitigation                                                                                                    |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Delays in MMO API access                  | Start with one MMO; bulk payment file fallback; SaPS route; mock adapter for demo                             |
| Low digital literacy                      | USSD with few steps, voice prompts, agent-assisted onboarding, Krio content                                   |
| Agent liquidity shortages for cash-out    | Encourage in-wallet use (vouchers, dues, savings); partner with MMOs on rural agent liquidity                 |
| Loan default / over-indebtedness          | Harvest deduction, small first loans, affordability checks, group guarantees, lender-funded capital           |
| Side-selling to avoid repayment deduction | Buyer partnerships, co-op peer accountability, incentives (lower fees and larger limits for repayers)         |
| Data privacy concerns                     | Consent-first design, minimal data sharing, audit log, local hosting options                                  |
| Ghost or duplicate farmers                | Phone + wallet + NIN/co-op attestation, GPS-tagged registration, duplicate detection, agents paid on activity |
| Weak connectivity                         | Offline PWA, USSD (works on 2G), SMS fallback                                                                 |

## 16. Team profile (to complete)

| Role                               | Responsibility                                             | Person / experience                                                                                                                                                                                                                                                                     |
| ---------------------------------- | ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Founder / Product & Technical Lead | Product, architecture, full-stack development              | Morie — full-stack web developer building government-facing civic tech platforms; MSc in Supply Chain, Procurement & Logistics (in progress); former Credit Officer at BRAC (rural lending, client assessment, repayment); former Lead Data Collector at CET-SL (field data collection) |
| Agri-finance / Partnerships Lead   | Lender, MMO and cooperative partnerships                   | _to add_                                                                                                                                                                                                                                                                                |
| Field Operations Lead              | Agent network, farmer onboarding, training                 | _to add_                                                                                                                                                                                                                                                                                |
| Backend / Mobile Developer         | Payments, USSD, offline sync                               | _to add_                                                                                                                                                                                                                                                                                |
| Advisors                           | Agriculture value chains, BSL regulation, gender inclusion | _to add_                                                                                                                                                                                                                                                                                |

**Decision-making & accountability:** weekly product and ops review; documented decision log; board/advisor review quarterly; financial controls with dual approval for payments.

## 17. Use of grant (illustrative, for a ~US$12,000 award)

| Item                                                         | %   | US$   |
| ------------------------------------------------------------ | --- | ----- |
| Product development (payments, USSD, offline sync, security) | 40% | 4,800 |
| Field pilot (agents, onboarding, cooperative training)       | 25% | 3,000 |
| SMS/USSD sessions and hosting                                | 10% | 1,200 |
| Compliance, legal & data protection                          | 10% | 1,200 |
| User research, gender-inclusive design & M&E                 | 15% | 1,800 |

## 18. Application readiness checklist

- [ ] Company legally registered in Sierra Leone with **≥1 year of operation** (TOR qualification)
- [ ] Raised **≤ US$15,000** in grants, loans or equity; not yet profitable
- [ ] **Working demo** (link) — mandatory
- [ ] Screenshots and 2–3 minute video
- [ ] CVs of all team members
- [ ] Articles of incorporation and licence to operate
- [ ] Any user-testing evidence: letters of interest from cooperatives, buyers or lenders, farmer feedback
- [ ] Submit at **https://fintech.muzambiringa.org** before **20 November 2026**

---

_AgriPay Salone — Empowering Farmers Through Digital Finance._
