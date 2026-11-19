# Application checklist (deadline 20 November 2026)

Form: https://fintech.muzambiringa.org

## Must submit

| Item the TOR asks for                  | What to give                                                                                         | Status |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------- | ------ |
| Brief problem statement                | Harvest cash is spent before planting; no records, so no credit (see README "pitch in one sentence") | ☐      |
| Solution overview                      | The harvest-to-credit loop (README diagram + table)                                                  | ☐      |
| Target users and user journey          | Smallholders (Aminata), co-ops, community banks/MFIs, agro-dealers; journey = demo-script steps      | ☐      |
| Business model and revenue assumptions | See below; replace the assumptions with your own numbers                                             | ☐      |
| Team profile                           | Roles and experience (your credit and field data background is relevant)                             | ☐      |
| Current stage and artefacts            | **MVP**; public demo link, 5–6 screenshots, 2-minute video                                           | ☐      |
| User testing / traction (optional)     | Even 3–5 farmer or co-op conversations help; note what they said                                     | ☐      |

Eligibility to double-check yourself: legally registered in Sierra Leone with at least 1 year of operation, not profitable, under $15,000 raised.

## Before you submit

- ☐ Demo site public (Vercel Deployment Protection off) and sign-in working
- ☐ Demo data reset to the start of the story
- ☐ Screenshots: Smart Split payment · Harvest Lock · Passport · Loan terms · Dealer redeem · Loan repaid
- ☐ 2-minute video recorded (demo-script.md)

## How the MVP answers each scoring criterion

| Criterion (weight)             | What to point to                                                                                                                          |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Relevance to the problem (25%) | Four TOR use cases in one flow: payments, savings, credit scoring, record keeping                                                         |
| Business model & stage (25%)   | Working MVP with tested code and a demo link; revenue tied to each transaction and loan (below)                                           |
| Team (15%)                     | Your profile; built and tested end to end                                                                                                 |
| Innovation & scalability (15%) | Harvest-linked Smart Split + consent-based passport; works with any mobile money operator; a mobile app can use the same API              |
| Inclusivity (10%)              | Feature phones via SMS (USSD next); PIN and consent protect farmers; score excludes gender, age and location; reports by gender and youth |
| Sustainability (10%)           | Revenue from co-ops, lenders and dealers, not farmers; AgriLink holds no funds, so low capital needs                                      |

## Business model (assumptions to replace with your own)

These are placeholders to show the shape of the model. Change the numbers before submitting.

| Who pays                    | For what                                           | Example assumption                                            |
| --------------------------- | -------------------------------------------------- | ------------------------------------------------------------- |
| Co-ops / buyers             | Each harvest payment processed with Smart Split    | small % of the payment value, or a monthly fee per co-op      |
| Lenders (banks, MFIs, FSAs) | Each loan originated and serviced through AgriLink | % of the loan amount                                          |
| Agro-dealers                | Voucher sales they receive                         | small % per redemption, offset by guaranteed same-day payment |
| Farmers                     | Nothing for core services                          | free, which keeps adoption high                               |
