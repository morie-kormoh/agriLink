# AgriPay Salone — Implementation Modules

This folder breaks the AgriPay Salone platform (see `../../AgriPay_Salone_Concept_Note.md`) into **14 implementation modules**. Each module file follows the same template so it can be picked up as a work package:

1. Purpose
2. Scope (in / out)
3. Dependencies
4. Data model (Prisma)
5. Business rules
6. API / server actions
7. UI screens & routes
8. USSD / SMS touchpoints (where relevant)
9. **Step-by-step implementation tasks** (with checkpoints)
10. Acceptance criteria
11. Tests

## Module index

| #   | Module                                    | File                               | Phase               |
| --- | ----------------------------------------- | ---------------------------------- | ------------------- |
| 00  | Foundation & Project Setup                | `00-foundation-setup.md`           | MVP                 |
| 01  | Identity, Authentication & Access Control | `01-identity-auth-access.md`       | MVP                 |
| 02  | Farmer Registry (offline-capable)         | `02-farmer-registry.md`            | MVP                 |
| 03  | Cooperatives, Buyers & Purchases          | `03-cooperatives-buyers.md`        | MVP                 |
| 04  | Payments Orchestrator & Ledger            | `04-payments-orchestrator.md`      | MVP (mock adapter)  |
| 05  | Farm Records & Profit Summary             | `05-farm-records.md`               | MVP                 |
| 06  | Savings (Harvest Lock & Group Savings)    | `06-savings.md`                    | MVP                 |
| 07  | Farm Financial Passport & Consent         | `07-financial-passport-consent.md` | MVP                 |
| 08  | Credit & Input Vouchers                   | `08-credit-input-vouchers.md`      | MVP demo → Pilot    |
| 09  | USSD & SMS Channel                        | `09-ussd-sms-channel.md`           | MVP (simulator)     |
| 10  | Notifications & Internationalisation      | `10-notifications-i18n.md`         | MVP                 |
| 11  | Programme & Analytics Dashboards          | `11-programme-analytics.md`        | MVP (basic) → Pilot |
| 12  | Insurance & Crowdfunding Integrations     | `12-insurance-crowdfunding.md`     | Phase 2             |
| 13  | Admin, Audit & Compliance                 | `13-admin-audit-compliance.md`     | MVP (core)          |

## Dependency graph

```
00 Foundation
 └─ 01 Identity & Access
     ├─ 13 Admin/Audit (audit log used by every module from here on)
     ├─ 10 Notifications & i18n
     └─ 02 Farmer Registry
         ├─ 05 Farm Records
         └─ 03 Co-ops, Buyers & Purchases
             └─ 04 Payments Orchestrator & Ledger
                 ├─ 06 Savings
                 └─ 07 Financial Passport & Consent
                     └─ 08 Credit & Input Vouchers
                         └─ 11 Analytics
 09 USSD/SMS sits on top of 01, 02, 04, 05, 06, 07, 08 (thin channel, no business logic)
 12 Insurance/Crowdfunding plugs into 04 + 08 (phase 2)
```

## Recommended build order

| Order | Module(s)                | Why                                                   |
| ----- | ------------------------ | ----------------------------------------------------- |
| 1     | 00                       | Monorepo, DB, UI kit, CI                              |
| 2     | 01 + 13 (audit log only) | Every later action needs a user, role and audit trail |
| 3     | 10 (SMS + i18n base)     | Registration and payments send SMS                    |
| 4     | 02                       | Farmers are the core entity                           |
| 5     | 03                       | Purchases create the first financial events           |
| 6     | 04                       | Waterfall split is the core differentiator            |
| 7     | 05, 06                   | Records and savings consume purchase/payment events   |
| 8     | 07                       | Score needs records, sales and savings                |
| 9     | 08                       | Credit needs the passport                             |
| 10    | 09                       | USSD layer over finished services                     |
| 11    | 11                       | Dashboards over real data                             |
| 12    | 13 (full), 12            | Hardening, then phase 2                               |

## Sprint plan

### Sprint 0 — Application demo (now → 20 Nov 2026)

Goal: **a working, clickable demo** satisfying the TOR's mandatory criterion.

- 00 setup (minimal), 01 phone/OTP login (OTP printed to console in dev), 02 agent registration form, 03 purchase recording, 04 waterfall with **mock adapter**, 06 Harvest Lock balance, 07 score with factor breakdown, 08 lender approve → voucher → redeem, 09 **browser USSD simulator**, 11 one summary dashboard.
- Seed realistic data (2 co-ops, 60 farmers, 1 buyer, 1 lender, 1 agro-dealer).
- Record a 2–3 minute walkthrough video.

### Sprint 1–2 — Accelerator (1 Dec 2026 – 8 Jan 2027)

- Offline PWA for agents (02), real SMS provider (10), Krio translations, user testing with 2 co-ops, harden 04 (idempotency, reconciliation), consent UX (07), audit and RBAC review (13).

### Sprint 3+ — Pilot (from Jan 2027)

- Live MMO adapter (one operator first), real USSD shortcode, lender pilot (08), programme dashboards (11), monitoring and backups.

## Shared conventions (apply to every module)

- **Language:** TypeScript strict mode everywhere.
- **Money:** Sierra Leone Leone (`SLE`), stored as `Decimal @db.Decimal(14,2)`. Never use JS `number` for money; use `Prisma.Decimal` / `decimal.js`.
- **IDs:** `cuid()` internal IDs; human IDs like `AP-BOM-000123` for farmers, `PUR-…`, `PAY-…`, `LN-…`.
- **Validation:** every input validated with a Zod schema from `packages/validation`. The same schema is used by forms, server actions, route handlers and USSD.
- **Server code:** business logic lives in `apps/web/src/server/<module>/service.ts` (pure functions taking a Prisma client/transaction). Server actions and route handlers are thin wrappers. USSD calls the same services via an internal API.
- **Authorisation:** every service function receives an `actor` (`{ userId, role, scope }`) and checks permissions through `can(actor, action, resource)` from module 01.
- **Audit:** every state-changing service calls `audit.log()` (module 13) inside the same DB transaction.
- **Events:** domain events (`purchase.recorded`, `payment.succeeded`, `loan.disbursed`, …) are published to a BullMQ queue so modules stay decoupled.
- **Prisma multi-file schema:** one `.prisma` file per module in `packages/db/prisma/schema/`.
- **Routes:** portal routes are grouped by role: `(farmer)`, `(agent)`, `(coop)`, `(buyer)`, `(lender)`, `(dealer)`, `(programme)`, `(admin)`.
- **Definition of done (per task):** typed, validated, authorised, audited, tested (unit + one e2e for the main flow), translated strings, works on a 360px-wide screen.
