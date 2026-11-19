# Module 08 — Credit & Input Vouchers

## 1. Purpose

Let partner lenders offer **responsible, harvest-aligned input credit** to farmers, paid as **restricted e-vouchers** redeemable only at registered agro-dealers, and repaid automatically from the next harvest payment (module 04 waterfall). **Lenders fund the loans**; AgriLink originates, disburses vouchers and services repayments.

## 2. Scope

**In:** lender loan products, eligibility, affordability check, application (farmer-initiated or lender offer), disclosure & PIN acceptance, approval workflow, voucher issuance, agro-dealer onboarding & catalogue, voucher redemption, dealer settlement, repayment split rule, schedules, arrears, restructuring, group-guaranteed loans, portfolio dashboard.
**Out:** Lender's core banking; loan capital.

## 3. Dependencies

01, 02, 04, 06, 07, 10, 13.

## 4. Data model (`prisma/schema/credit.prisma`)

```prisma
enum LoanStatus { APPLIED OFFERED ACCEPTED APPROVED DISBURSED REPAYING REPAID LATE DEFAULTED RESTRUCTURED WRITTEN_OFF CANCELLED DECLINED }
enum VoucherStatus { ISSUED PARTIALLY_REDEEMED REDEEMED EXPIRED CANCELLED }

model LoanProduct {
  id              String   @id @default(cuid())
  lenderOrgId     String
  name            String                       // "Rice Fertiliser Loan 2027"
  purpose         String                       // INPUTS, EQUIPMENT, IRRIGATION
  cropIds         String[]
  districtIds     String[]
  minAmountLe     Decimal  @db.Decimal(14,2)
  maxAmountLe     Decimal  @db.Decimal(14,2)
  firstCycleMaxLe Decimal  @db.Decimal(14,2)   // graduation start
  flatFeePct      Decimal  @db.Decimal(5,2)    // total cost as % (simple, disclosed)
  minBand         String                       // FAIR / GOOD / STRONG
  maxDebtToIncomePct Decimal @db.Decimal(5,2)  // affordability, e.g. 40
  repaymentMode   String                       // HARVEST_DEDUCTION, LUMP_SUM_DATE, INSTALMENTS
  dueMonthDay     String?                      // fallback due date if no harvest sale
  maxRepaymentPctPerSale Decimal @db.Decimal(5,2) @default(60)
  requiresGroupGuarantee Boolean @default(false)
  voucherOnly     Boolean  @default(true)
  eligibleDealerIds String[]
  active          Boolean  @default(true)
}

model Loan {
  id            String     @id @default(cuid())
  ref           String     @unique            // LN-...
  farmerId      String
  productId     String
  lenderOrgId   String
  status        LoanStatus @default(APPLIED)
  requestedLe   Decimal    @db.Decimal(14,2)
  approvedLe    Decimal?   @db.Decimal(14,2)
  feeLe         Decimal?   @db.Decimal(14,2)
  totalDueLe    Decimal?   @db.Decimal(14,2)
  repaidLe      Decimal    @db.Decimal(14,2) @default(0)
  season        String
  dueDate       DateTime?
  scoreAtApplication Int?
  bandAtApplication  String?
  affordability Json?                         // inputs + result
  disclosureAcceptedAt DateTime?
  acceptedVia   String?                       // USSD, APP
  approvedById  String?
  splitRuleId   String?
  groupId       String?
  voucher       InputVoucher?
  repayments    LoanRepayment[]
  createdAt     DateTime   @default(now())
}

model LoanRepayment {
  id        String   @id @default(cuid())
  loanId    String
  loan      Loan     @relation(fields: [loanId], references: [id])
  amountLe  Decimal  @db.Decimal(14,2)
  source    String   // HARVEST_SPLIT, MANUAL_MOBILE_MONEY, GROUP
  paymentId String?
  createdAt DateTime @default(now())
}

model AgroDealer {
  id        String  @id @default(cuid())
  orgId     String  @unique
  districtId String
  payoutMsisdn String
  payoutProvider String
  verified  Boolean @default(false)
  catalogue DealerItem[]
}

model DealerItem {
  id        String  @id @default(cuid())
  dealerId  String
  dealer    AgroDealer @relation(fields: [dealerId], references: [id])
  name      String                           // "NPK 15-15-15 50kg"
  category  String                           // SEED, FERTILISER, AGROCHEM, TOOLS
  unitPriceLe Decimal @db.Decimal(14,2)
  active    Boolean @default(true)
}

model InputVoucher {
  id          String        @id @default(cuid())
  code        String        @unique          // 8-char, no ambiguous chars
  loanId      String?       @unique          // or programme disbursement
  loan        Loan?         @relation(fields: [loanId], references: [id])
  farmerId    String
  valueLe     Decimal       @db.Decimal(14,2)
  remainingLe Decimal       @db.Decimal(14,2)
  allowedCategories String[]
  allowedDealerIds  String[]
  status      VoucherStatus @default(ISSUED)
  expiresAt   DateTime
  redemptions VoucherRedemption[]
}

model VoucherRedemption {
  id         String   @id @default(cuid())
  voucherId  String
  voucher    InputVoucher @relation(fields: [voucherId], references: [id])
  dealerId   String
  items      Json                            // [{itemId, qty, unitPriceLe}]
  amountLe   Decimal  @db.Decimal(14,2)
  farmerOtpVerified Boolean
  settlementPaymentId String?
  createdAt  DateTime @default(now())
}
```

## 5. Business rules (responsible lending)

- **Eligibility:** current passport band ≥ product `minBand`, valid consent to lender, no active defaulted loan, crop/district match.
- **Graduation:** first loan ≤ `firstCycleMaxLe`; each on-time repaid cycle raises the limit (e.g. +50%) up to `maxAmountLe`.
- **Affordability:** `totalDue ≤ maxDebtToIncomePct × expected harvest sales` (from last season's verified sales or expected yield × co-op price, whichever is lower).
- **Disclosure before acceptance** (USSD and app): amount, fee in Leones, total to repay, how repayment works (up to X% of each sale), due date, what happens if late. Farmer accepts with **PIN**. A **24-hour cooling-off** cancel window if the voucher is unused.
- **Voucher:** issued only after lender approval; valid 60 days; redeemable only at allowed dealers and categories; farmer confirms each redemption with an OTP or PIN.
- **Settlement:** after redemption, lender pays dealer (module 04 `VOUCHER_SETTLEMENT`) same day.
- **Repayment:** loan registers a `SplitRule` (`LOAN_REPAYMENT`, `OUTSTANDING_BALANCE`, priority 1) capped by `maxRepaymentPctPerSale`. Manual mobile money repayment also allowed.
- **Arrears:** after `dueDate` + 14 days with balance → `LATE` (score impact). After 90 days → `DEFAULTED` (lender decides). No automatic rollover; restructure only by lender with farmer PIN acceptance.
- **Collections conduct:** reminder SMS only (max 1 per week); no public shaming; no contacting other people except group guarantors who agreed.
- **Group loans:** group members co-guarantee; group shown repayment status of members.

## 6. API / server actions

| Function                                   | Who                                                            |
| ------------------------------------------ | -------------------------------------------------------------- |
| `createLoanProduct / updateLoanProduct`    | LENDER_ADMIN                                                   |
| `checkEligibility(farmerId, productId)`    | FARMER, LENDER_*                                               |
| `applyForLoan(productId, amountLe)`        | FARMER (USSD/app) → triggers consent if missing                |
| `makeOffer(farmerId, productId, amountLe)` | LENDER_OFFICER                                                 |
| `acceptLoan(loanId, pin)`                  | FARMER                                                         |
| `approveLoan / declineLoan`                | LENDER_OFFICER (maker), LENDER_ADMIN (checker above threshold) |
| `issueVoucher(loanId)`                     | system after approval                                          |
| `redeemVoucher(code, items, farmerOtp)`    | AGRO_DEALER                                                    |
| `settleRedemption(redemptionId)`           | worker → module 04                                             |
| `recordManualRepayment(loanId, amountLe)`  | system via provider callback                                   |
| `runArrearsJob()`                          | worker daily                                                   |
| `restructureLoan(loanId, terms)`           | LENDER_ADMIN + farmer PIN                                      |
| `getPortfolio(lenderOrgId, filters)`       | LENDER_*                                                       |

## 7. UI screens & routes

- `/(lender)/products`, `/(lender)/products/new`: product builder with live disclosure preview.
- `/(lender)/applications`: queue with passport band, affordability result, approve/decline.
- `/(lender)/loans/[id]`: timeline (applied → accepted → approved → voucher → redeemed → repayments).
- `/(lender)/portfolio`: disbursed, outstanding, repayment rate, PAR30/PAR90 by district/crop/gender.
- `/(farmer)/loans`: eligible offers, active loan with progress bar, voucher code & where to use it.
- `/(dealer)/redeem`: enter voucher code → farmer name & remaining value → pick items from catalogue → farmer OTP → confirm.
- `/(dealer)/catalogue`, `/(dealer)/settlements`.

## 8. USSD / SMS touchpoints

- USSD _Loans → Check offers → Accept (disclosure screens) → PIN_.
- SMS voucher: "Your AgriLink input voucher: K7P4-R2QX, Le 2,000, valid to 30 May at {dealer list}. Show this code to the dealer."
- Dealer USSD _Redeem_: code → amount → farmer receives OTP → dealer enters OTP.
- SMS after harvest split: "Le 1,200 paid to your fertiliser loan. Remaining Le 0. Loan fully repaid! Your new limit is Le 3,000."

## 9. Step-by-step implementation

1. Add `credit.prisma`; migrate; seed 1 lender, 1 product, 2 agro-dealers with catalogues.
2. Eligibility + affordability service (pure functions + data loaders) with explanations.
3. Product builder UI + disclosure generator (shared text for app and USSD, translated).
4. Application/offer flows, consent hook into module 07.
5. Acceptance with PIN + cooling-off timer job.
6. Approval workflow with maker–checker thresholds.
7. Voucher service: code generator (Crockford base32, check digit), issue, expiry job, SMS.
8. Dealer onboarding (org type AGRO_DEALER), catalogue CRUD.
9. Redemption flow with farmer OTP; partial redemption; audit; emit `voucher.redeemed` (module 05 record).
10. Settlement → module 04 `VOUCHER_SETTLEMENT` payment from lender to dealer.
11. Register repayment `SplitRule`; consumer for `payment.succeeded` LOAN_REPAYMENT splits → `LoanRepayment`, update balance/status, recompute score.
12. Arrears job, reminder SMS, status transitions.
13. Lender portfolio dashboard (PAR, repayment rate, disaggregation).
14. Group loan support (group link, guarantor view).
    ✅ _Checkpoint (demo):_ lender creates product → farmer accepts on USSD simulator → voucher SMS → dealer redeems → dealer settled → next harvest payment repays loan → score increases.

## 10. Acceptance criteria

- No loan without consent, eligibility, affordability check, disclosure and PIN.
- Vouchers can only be spent at allowed dealers/categories and require farmer OTP.
- Repayment deduction never exceeds `maxRepaymentPctPerSale`, and the farmer floor (04) is respected.
- Portfolio metrics match loan records.

## 11. Tests

- Unit: eligibility, affordability, graduation, voucher code validation, arrears transitions.
- Integration: double redemption prevented; cooling-off cancel; repayment from split updates loan and score.
- E2E: full credit cycle demo path.
