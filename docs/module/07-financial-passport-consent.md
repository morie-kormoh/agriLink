# Module 07 — Farm Financial Passport & Consent

## 1. Purpose

Turn each farmer's registration, records, sales, savings and repayments into an **explainable credit-readiness score** (the Farm Financial Passport) that the farmer can see and improve, and that lenders can view **only with the farmer's explicit consent**.

## 2. Scope

**In:** scoring engine (rule-based v1), factor breakdown, score bands, improvement tips, score history, recalculation triggers, consent requests/grants/revocations, consent log, lender passport view, model versioning.
**Out:** ML scoring (phase 2 FastAPI service — interface defined here), loan decisions (08).

## 3. Dependencies

02, 03, 04, 05, 06, 01 (PIN), 10, 13.

## 4. Data model (`prisma/schema/passport.prisma`)

```prisma
enum ScoreBand { BUILDING FAIR GOOD STRONG }
enum ConsentScope { PASSPORT_SUMMARY PASSPORT_DETAILED RECORDS_FULL }
enum ConsentStatus { REQUESTED GRANTED DECLINED REVOKED EXPIRED }

model CreditScore {
  id          String    @id @default(cuid())
  farmerId    String
  score       Int                         // 0–100
  band        ScoreBand
  factors     Json                        // [{key, label, points, max, evidence, tip}]
  modelVersion String                     // "rules-v1.0"
  inputsHash  String                      // hash of inputs for reproducibility
  computedAt  DateTime  @default(now())
  isCurrent   Boolean   @default(true)
  @@index([farmerId, isCurrent])
}

model ConsentRequest {
  id          String        @id @default(cuid())
  farmerId    String
  requesterOrgId String                    // lender / insurer / programme
  scope       ConsentScope
  purpose     String                       // "Assess input loan – 2027 main season"
  status      ConsentStatus @default(REQUESTED)
  expiresAt   DateTime                     // grant validity, e.g. 12 months
  grantedAt   DateTime?
  revokedAt   DateTime?
  channel     String?                      // USSD, APP, AGENT_ASSISTED
  createdAt   DateTime      @default(now())
}

model PassportAccessLog {
  id         String   @id @default(cuid())
  consentId  String
  viewerUserId String
  farmerId   String
  scope      ConsentScope
  viewedAt   DateTime @default(now())
}
```

## 5. Scoring rules v1 (`packages/scoring`)

| Factor key           | Max | Calculation                                                                                                                         |
| -------------------- | --- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `identity`           | 10  | tier1 = 4, tier2 = 7, tier3 = 10                                                                                                    |
| `coop_standing`      | 10  | member of co-op 10; group member 6; none 0; minus 5 if unresolved dispute in last season                                            |
| `records`            | 15  | seasons with ≥ 3 records (any) × 5, max 15; verified records weighted ×1, self-reported ×0.5                                        |
| `sales`              | 20  | verified sales value last 12 months banded (0 / <Le 1k / <Le 3k / <Le 7k / ≥ Le 7k → 0/5/10/15/20) + regularity bonus capped at max |
| `savings`            | 15  | Harvest Lock active 5 + months with savings credits (1 pt each, max 6) + group contributions on time ≥ 80% → 4                      |
| `repayment`          | 25  | no loans yet → 10 (neutral); each loan repaid on time +5 (max 25); late → −5 each; default → 0 and flag                             |
| `buyer_relationship` | 5   | sold to the same verified buyer/co-op in ≥ 2 seasons                                                                                |

- Bands: **0–39 Building · 40–59 Fair · 60–79 Good · 80–100 Strong**.
- Thresholds in Leones are config values, reviewed each season.
- **Fairness:** gender, age, disability, ethnicity and location are **never** inputs. Score distribution is monitored by gender and youth (module 11) to detect bias.
- Each factor returns a plain-language `tip` (English/Krio): e.g. "Sell through your co-op one more season to add up to 5 points."
- Engine is a pure function: `score(inputs, config) → { score, band, factors }`, versioned (`rules-v1.0`).
- Future ML: `POST {SCORING_ML_URL}/score` with same inputs; result stored with its `modelVersion`; rules remain a fallback and an explanation layer.

## 6. Consent rules

- A lender **cannot see anything** about a farmer without a `GRANTED`, unexpired consent for that lender and scope.
- Consent is requested by the lender (or triggered when the farmer applies for a loan product) and **granted by the farmer with PIN** (USSD or app). Agent-assisted grants still need the farmer's PIN.
- Consent text is short and in the farmer's language: who, what, why, how long.
- Farmer can **revoke anytime**; revoke stops future access but does not affect existing loans.
- Every lender view is logged in `PassportAccessLog`; farmer can see who viewed their passport.
- Default expiry 12 months.

## 7. API / server actions

| Function                                   | Who                                                                                                                     |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| `computeScore(farmerId)`                   | system (worker)                                                                                                         |
| Triggers                                   | `payment.succeeded`, `savings.credited`, `loan.repaid/late/defaulted`, `record.added` (debounced 10 min), nightly batch |
| `getMyPassport()`                          | FARMER                                                                                                                  |
| `requestConsent(farmerId, scope, purpose)` | LENDER_OFFICER, programme                                                                                               |
| `respondConsent(requestId, grant           | decline, pin)`                                                                                                          | FARMER |
| `revokeConsent(consentId, pin)`            | FARMER                                                                                                                  |
| `getPassportForLender(farmerId)`           | LENDER_* with valid consent (logs access)                                                                               |
| `searchEligibleFarmers(productId)`         | LENDER_* — returns only consented farmers, or anonymised counts of eligible farmers otherwise                           |

## 8. UI screens & routes

- `/(farmer)/passport`: score dial, band badge, factor bars with tips, history sparkline, "Who can see my passport" list with revoke buttons.
- `/(farmer)/consents`: pending requests (accept/decline), history.
- `/(lender)/farmers`: consented farmers list with band, filter by crop/district.
- `/(lender)/farmers/[id]/passport`: detailed view (watermarked with viewer name and time), records summary, savings and repayment history.
- `/(lender)/consents`: requests sent and status.

## 9. USSD / SMS touchpoints

- USSD _My AgriPay Score_: "Score 62 (Good). Tip: Keep saving monthly to add points."
- USSD _Requests_: "Rokel Community Bank wants to see your AgriPay passport to assess a fertiliser loan for 12 months. 1 Accept 2 Decline" → PIN.
- SMS when the score changes band, and when a lender views the passport.

## 10. Step-by-step implementation

1. Add `passport.prisma`; migrate.
2. `packages/scoring`: config types, factor functions, `score()`; table-driven tests per factor and boundary.
3. Input builder (`server/passport/inputs.ts`): query farmer tier, co-op, records, sales, savings, loans → typed `ScoreInputs`.
4. Worker job `scoring:compute` with debounce (BullMQ job id per farmer); mark previous score `isCurrent=false`.
5. Farmer passport page (radial progress, factor list with `Progress` bars and tips).
6. Consent service: request, respond (PIN), revoke, expiry job.
7. Authorisation hook: module 01 `can()` for LENDER_* checks consent via `hasConsent(lenderOrgId, farmerId, scope)`.
8. Lender pages with access logging and watermark.
9. Notifications: consent request SMS/USSD prompt; view alerts; band change.
10. Krio translations for factor labels and tips.
11. Bias monitoring query for module 11 (score distribution by gender/youth).
    ✅ _Checkpoint:_ after a paid purchase and Harvest Lock credit, the farmer's score updates; a lender sees the passport only after the farmer accepts with PIN.

## 11. Acceptance criteria

- Same inputs always give the same score (reproducible, versioned).
- Farmer sees every factor, its points and a tip.
- No lender access without valid consent; every access is logged and visible to the farmer.
- Protected attributes are not used as inputs.

## 12. Tests

- Unit: every factor + band boundaries; config changes don't break determinism.
- Integration: consent required (403 without); revoke blocks access immediately; expiry job.
- E2E: lender requests → farmer accepts on USSD simulator → lender views passport.
