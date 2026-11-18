# Module 12 — Insurance & Crowdfunding Integrations (Phase 2)

## 1. Purpose

Extend AgriPay with two TOR use cases once the core is piloted:

- **Digitally enabled agri-insurance**: weather-index or area-yield micro-insurance bundled with input loans, underwritten by a **licensed insurer**.
- **Crowdfunded input finance**: individuals (including diaspora) co-fund cooperative input-loan pools through a regulated partner, repaid through the same harvest waterfall.

AgriPay acts as **distribution and servicing platform only**; it does not underwrite risk or hold investor funds.

## 2. Scope

**In:** insurer/product integration, enrolment (standalone or bundled), premium collection via split rule or loan add-on, trigger data intake, claims/payouts, policy SMS; crowdfunding campaigns per co-op/loan pool, pledges via partner, allocation, repayment distribution, campaign pages.
**Out:** Actuarial pricing, investor licensing (partner's responsibility).

## 3. Dependencies

04, 07, 08, 10, 11, 13. **Regulatory prerequisites:** insurer partnership agreement; crowdfunding only through a licensed/approved partner or under BSL sandbox approval.

## 4. Data model (`prisma/schema/phase2.prisma`)

```prisma
model InsuranceProduct {
  id           String  @id @default(cuid())
  insurerOrgId String
  name         String                 // "Rice Rainfall Cover 2028"
  type         String                 // WEATHER_INDEX, AREA_YIELD, CREDIT_LIFE
  cropIds      String[]
  districtIds  String[]
  premiumPct   Decimal @db.Decimal(5,2)  // of sum insured
  sumInsuredRule String               // e.g. LOAN_AMOUNT, FIXED
  triggerSpec  Json                   // thresholds per district/period
  bundleWithLoanProductIds String[]
  active       Boolean @default(true)
}

model Policy {
  id          String   @id @default(cuid())
  ref         String   @unique
  productId   String
  farmerId    String
  loanId      String?
  sumInsuredLe Decimal @db.Decimal(14,2)
  premiumLe   Decimal  @db.Decimal(14,2)
  premiumPaidLe Decimal @db.Decimal(14,2) @default(0)
  status      String   // QUOTED, ACTIVE, LAPSED, CLAIMED, EXPIRED
  coverFrom   DateTime
  coverTo     DateTime
  insurerPolicyNo String?
}

model TriggerEvent {
  id         String   @id @default(cuid())
  productId  String
  districtId String
  period     String
  source     String   // insurer feed / weather data partner
  data       Json
  triggered  Boolean
  payoutPct  Decimal? @db.Decimal(5,2)
  createdAt  DateTime @default(now())
}

model Claim {
  id        String   @id @default(cuid())
  policyId  String
  triggerEventId String?
  amountLe  Decimal  @db.Decimal(14,2)
  status    String   // PENDING, APPROVED, PAID, REJECTED
  paymentId String?
}

model Campaign {
  id           String   @id @default(cuid())
  cooperativeId String
  partnerOrgId String                 // licensed crowdfunding / finance partner
  title        String
  story        String
  targetLe     Decimal  @db.Decimal(14,2)
  raisedLe     Decimal  @db.Decimal(14,2) @default(0)
  expectedReturnPct Decimal? @db.Decimal(5,2)
  riskDisclosure String
  status       String   // DRAFT, LIVE, FUNDED, DEPLOYED, REPAYING, CLOSED
  opensAt      DateTime
  closesAt     DateTime
}

model Pledge {
  id          String  @id @default(cuid())
  campaignId  String
  backerName  String
  backerContact String
  amountLe    Decimal @db.Decimal(14,2)
  partnerRef  String?                 // funds held by partner
  status      String  // PLEDGED, CONFIRMED, REFUNDED, REPAID
}
```

## 5. Business rules

- Insurance enrolment needs simple disclosure (what is covered, premium, cover dates, how payout works) + farmer PIN.
- Premium collection: added to loan (financed) **or** as a `SplitRule` `INSURANCE_PREMIUM`; never deducted without consent.
- Index-trigger payouts are automatic to all active policies in the affected district/period via module 04, with SMS.
- Crowdfunding: funds collected and held by the partner; campaigns show risk disclosure; AgriPay shows aggregated, anonymised farmer impact only; repayments from loans in the pool distributed by the partner.

## 6. Step-by-step implementation

1. Partner discovery & agreements (insurer, crowdfunding partner) — **non-technical gate**.
2. Add schema; migrate.
3. Insurer product configuration UI (`/(admin)/insurance/products`).
4. Bundled enrolment in the loan acceptance flow (08) + standalone enrolment (app/USSD).
5. Premium handling (loan add-on or split rule) and policy SMS.
6. Trigger data ingestion endpoint/CSV upload; trigger evaluation job; claims creation; payouts via 04.
7. Insurer reporting (policies, premiums, claims) + reconciliation.
8. Campaign builder for co-ops (with partner approval), public campaign page (artifact-style landing), pledge flow redirecting to partner checkout.
9. Pledge webhooks from partner; campaign progress; deployment to loan pool (08).
10. Repayment reporting to partner.
11. Analytics additions (11): insured farmers, claims paid, crowdfunded volume.

## 7. Acceptance criteria

- No premium or pledge handled outside licensed partners.
- Payouts reach all eligible policyholders automatically after a trigger.
- Disclosures shown and accepted with PIN before enrolment.

## 8. Tests

- Unit: premium and payout calculations; trigger evaluation.
- Integration: bundled enrolment with loan; payout batch idempotency; pledge webhook handling.
