# Implementation status — Modules 00–08

_Last updated: 17 Nov 2026_

## Module 00 — Foundation ✅

- Turborepo + pnpm workspaces; shared tsconfig/ESLint (`packages/config`), Prettier, Husky + lint-staged.
- `docker-compose.yml`: PostGIS 16, Redis 7, MinIO (+ bucket init), optional Mailpit. `infra/postgres/init.sql` enables `postgis`/`pg_trgm` and creates `agripay_test`.
- `packages/db`: Prisma 7 multi-file schema (`base`, `geo`, `identity`, `farmer`, `audit`), driver adapter (`@prisma/adapter-pg`), lazy client singleton, atomic ID sequences (`nextFarmerId`). Seed: 5 regions, 16 districts (3-letter codes), chiefdoms for the pilot districts (Bombali, Kenema) + "Other (not listed)" elsewhere, 10 crops, demo orgs/users/60 farmers (≈60% women).
- `packages/ui`: shadcn/ui components on Radix (button, input, select, dialog, sheet, dropdown, table, tabs, sonner, form, checkbox, switch, radio, progress, alert, avatar…), plus `PageHeader`, `StatCard`, `EmptyState`, `DataTable` (TanStack), `OtpInput`, `Stepper`. Green/gold theme, 44px touch targets. Showcase at `/dev/ui`.
- `packages/validation`: `phoneSL` (normalises to `+232…`), money helpers (decimal.js, `formatLe`), seasons/youth helpers, all Zod schemas.
- `packages/i18n`: English + draft Krio (falls back to English), `t()` for USSD/SMS; next-intl in the web app (cookie-based locale).
- `apps/ussd` (Fastify) and `apps/worker` (BullMQ) skeletons; CI workflow; Dockerfiles.

## Module 01 — Identity, Authentication & Access ✅

- Phone + 6-digit OTP login (HMAC-hashed codes, 5-min expiry, 5 attempts, 3 sends/15 min per phone + per-IP limit; no account enumeration).
- Custom DB sessions (sha256-hashed token cookie, 7 days; SUPER_ADMIN 12 h; 30-min inactivity for lender/admin roles), revoke other sessions.
- Workspaces: org memberships + "my farm"; auto-select when only one; `/select-context`.
- Permission matrix + `can()` scope rules (`packages/validation/permissions.ts`), portal gating per URL prefix, server-action checks.
- Transaction PIN (argon2id), weak-PIN rules, 3 wrong attempts → 30-min lock, SMS security alerts, admin unlock; internal `POST /api/internal/auth/pin/verify` for USSD.
- Invitations by SMS link (`/invite/[token]`), revoke, remove members; `/settings/team`.
- Admin: users (suspend/activate/unlock PIN), organisations (create + invite admin, activate/deactivate), audit viewer.
- **Audit log (module 13 core):** masked, hash-chained, written in the same transaction, append-only enforced by a DB trigger.
- Next.js 16 `proxy.ts` (cookie gate + request id).

## Module 02 — Farmer Registry ✅

- 6-step registration wizard (person → location → phone & wallet → farm & crop + GPS → photo & consent → review), mobile-first.
- **Offline-first:** registrations queue in IndexedDB (Dexie) with a client UUID; sync on reconnect, every 5 min and on demand; batches of 25; backoff; per-agent queues on shared devices; photos (compressed ≤200 KB) uploaded after the record via presigned S3 URL; service worker caches the app shell (production builds).
- `POST /api/sync/farmers`: idempotent per `clientRef`, per-record results.
- AgriLink IDs `AP-{DISTRICT}-{000123}`; KYC tiers 1–3; wallet name verification (mock provider until module 04).
- Duplicate detection: same NIN, same phone + similar name (pg_trgm), near-identical name in the same chiefdom with compatible DOB; shared-phone handling; co-op review screen.
- Co-op portal: dashboard (women/youth/disability/district), members list with search & filters, profiles with ID card, CSV import (template → dry-run preview → commit, idempotent), CSV export, duplicates.
- PostGIS: `FarmPlot.geom` kept in sync from lat/lng by trigger, GIST index.

## Module 03 — Cooperatives, Buyers & Purchases ✅

- `Cooperative` settings (dues %, flat dues, approval threshold, funding wallet), buyer settings, collection points, price lists (grade-specific beats any-grade; setting a price closes the previous one).
- Record purchase (online + idempotent `clientRef`), automatic batches per recorder / collection point / day, price override needs a reason.
- **Two-person approval**: the approver can never be the person who recorded or submitted. Held items: disputed, no wallet, over threshold, maker–checker.
- Farmer SMS acknowledgement (48 h): reply 1 confirms, 2 disputes; co-op resolves disputes (uphold cancels, reject returns to recorded).
- Buyer portal: dashboard, collections, prices, disputes, settings, supplier report (CSV).

## Module 04 — Payments Orchestrator & Ledger ✅

- `packages/payments`: Smart Split waterfall (priority rules, % of gross/remaining, fixed, outstanding balance capped at 60%, 30% farmer floor), provider adapter interface, mock provider with HMAC callbacks.
- Each split is paid **directly from the payer to its destination** — AgriLink never holds funds.
- Instructions: atomic claim, status check before any resend, backoff 1m/5m/15m/1h/6h, max 5 attempts, webhook `/api/webhooks/payments/[provider]`, worker tick every minute.
- Double-entry ledger posted only on success; DB triggers make it append-only and reject unbalanced journals.
- Farmer SMS receipt exactly once; farmer statement; admin instructions (retry / mark failed) and reconciliation.

## Module 05 — Farm Records ✅

- Costs, income and harvests per season; verification level by who recorded it (self-reported vs agent-confirmed vs system-verified).
- Every paid purchase creates a **system-verified sale record** automatically (domain event); cancelling removes it.
- Harvest/sale records attach to the farmer's crop cycle and update actual yield.
- Season summary (costs, income, profit, yield) and co-op "close season" that sends each member one SMS summary.

## Module 06 — Savings ✅

- Harvest Lock and savings goals held by a licensed custodian (a LENDER org with `FinancialInstitution` settings). AgriLink mirrors balances in the ledger (`SAVINGS:{accountId}`) and on the account, updated in the same transaction as the provider confirmation.
- Opening, changing %, pausing and emergency withdrawals always need the **farmer's own PIN** (also when an agent or co-op staff helps).
- Auto-save is a Smart Split rule (priority after loan repayment, before dues). Pausing removes it from the next payment.
- Daily job: SMS 7 days before release, then the full balance is paid to the farmer's wallet; the lock rolls to next season. Goals release when reached.
- Emergency withdrawal once per season with the fee shown before the PIN. Savings transactions are append-only; balances can never go negative (DB constraints).
- Group savings (VSLA / Osusu / goal): members & roles, contributions per period (co-op staff or the group's treasurer), rotating payouts, SMS statements.
- Custodian view with ledger cross-check and CSV statement reconciliation.

## Module 07 — Farm Financial Passport & consent ✅

- `packages/finance` scoring `rules-v1.0`: identity, co-op standing, records, verified sales, savings, repayment, buyer relationship = 100 points; bands Building / Fair / Good / Strong. Pure and reproducible (inputs hash stored); gender, age, disability and location are not inputs.
- Recomputed after payments, savings movements, repayments, records and nightly (debounced via the worker with `SCORE_EXECUTION=queue`); SMS when the band changes.
- Consent: lender requests by AgriLink ID or exact phone → farmer grants/declines with PIN → can revoke any time. Scopes: summary ⊂ detailed ⊂ full records. 12-month default; unanswered requests expire after 30 days.
- Lender passport view: 403 without consent, every view logged and shown to the farmer (SMS at most once a day per lender), watermarked with viewer and time. Eligible-farmer search shows only consented farmers, plus an anonymised count (hidden below 5).
- Fairness monitoring: score distribution by gender and youth (aggregates only, small groups suppressed) for module 11.

## Module 08 — Credit & input vouchers ✅

- Loan products (lender admin): amounts, graduation, flat fee, minimum band, affordability (max % of expected sales), max % per sale, voucher categories/dealers, group guarantee.
- Eligibility = band + consent + no active/defaulted loan + crop/district + wallet + affordability (lower of last-12-month verified sales and expected yield × co-op price) + graduation limit (first loan capped, +50% per on-time loan).
- Plain-language disclosure (English/Krio, same text for app and USSD) before the PIN. Farmer applications grant the lender a passport view; lender offers need prior consent and the farmer's PIN acceptance.
- Approval: the offer maker can never approve it; above the institution's limit only a lender admin can. Approval issues a Crockford base-32 voucher (check digit, typo-tolerant) and registers the repayment split rule (priority 1, capped at the product's % per sale and the 30% farmer floor).
- **The farmer owes only what is spent**: each redemption adds the amount used plus its share of the fee; unused value at expiry is never owed (a voucher never used cancels the loan). 24-hour cooling-off cancel while unused.
- Agro-dealer counter: code → items from the catalogue (allowed categories only) → farmer gets an SMS code with the amount and items → redemption. Double redemption blocked (single-use code, row lock, DB check, client ref). Same-day settlement lender → dealer via the payments engine. Redemptions become verified farm records.
- Repayments from harvest splits and recorded mobile-money repayments; SMS with the new limit when fully repaid. Daily arrears job: reminder 7 days before due, LATE after due + 14 days, max one reminder a week, borrower only. Default only by a lender admin after 90 days; restructure only with the farmer's PIN.
- Lender portfolio (from loan records): disbursed, outstanding, PAR30/PAR90, repayment rate, by district, gender, crop and product.

## Scheduled jobs

The worker runs `/api/internal/jobs/daily` at 06:00 (consent & voucher expiry, loan arrears, savings releases) and `scores-nightly` at 01:30; all idempotent.

## API v1 (mobile-ready) ✅

- `/api/v1/*` with `{data, meta}` envelopes and `{error, code}` errors, bearer access tokens + rotating refresh tokens, OpenAPI 3.1 + Scalar docs at `/api/v1/docs`.

## Tests

- `packages/finance`: 23 tests (every scoring factor and band boundary, a 300-run determinism property test, eligibility, affordability, graduation, arrears, release dates, fees, rotating payouts, voucher codes and typo detection).
- `apps/web/test/finance.test.ts`: full cycles — Harvest Lock with PIN, savings = split exactly, pause, release, early withdrawal; groups; consent grant/revoke/expiry and access logging; application → maker–checker → voucher → OTP redemption → settlement → harvest repayment → score; caps & farmer floor; offers, cooling-off, voucher expiry; arrears.
- `apps/web/e2e/finance.spec.ts`: lender approves in the browser → dealer redeems with the farmer's code → farmer sees loans, passport, savings and confirms a change with PIN; lender blocked without consent.
- `packages/payments`: 19 tests (waterfall tables + 500-run property test, mock provider).
- `apps/web`: trade/payments, records and API test suites added (purchases, maker–checker, disputes, waterfall payments, retries, idempotent callbacks, ledger balance, records, season close, token rotation/reuse).
- `packages/validation`: 54 unit tests (phones, money, permissions matrix, schemas).
- `packages/i18n`: 5 tests (ICU formatting, Krio fallback, key parity).
- `apps/web`: 38 integration tests on a real Postgres (OTP, PIN lockout, sessions, invitations, audit chain + append-only, ID concurrency, registration, idempotency, duplicates, scope, wallet verification, sync, CSV import, offline queue with fake IndexedDB).
- `apps/web/e2e`: 4 Playwright tests in a mobile viewport (agent online registration, **offline registration that syncs on reconnect**, co-op scoping, farmer PIN).
- `apps/ussd`: 2 tests.

## Decisions & deviations from the module docs

- **Route segments instead of route groups** for portals (`/agent`, `/coop`, `/admin`, `/farmer`, …) so the proxy and service worker can match by prefix.
- **Pure finance rules live in `packages/finance`** (scoring, credit, savings, voucher codes) rather than `packages/scoring`, so the API, USSD service and worker share one implementation.
- **Lenders are also the savings custodians** (`FinancialInstitution` on LENDER organisations) — no separate custodian org type.
- **Harvest Lock stays open after a release** (balance paid out, lock moves to next season) instead of being closed and reopened each year.
- **Loans go straight from approval to DISBURSED** (voucher issued in the same step); the debt grows only as the voucher is used.
- **Cooperative = Organization (type COOPERATIVE).** `Farmer.cooperativeId` references `Organization`; module 03 adds a `Cooperative` details table keyed by `orgId`.
- **Agent assignment = membership** with role `AGENT` in a co-op org (no separate `AgentAssignment` table).
- **Farmer.userId is optional** and `Farmer.phone` is stored on the farmer, because family members often share a phone; only the first person gets the login.
- **Sessions are custom** (not Better Auth/Auth.js) to keep full control of tables and USSD PIN flows.
- A minimal SMS sender (`console` / `memory` / `queue`) stands in until module 10.
- Chiefdom lists are a starting point — verify against current official boundaries before go-live.
- Krio strings are a draft for native-speaker review during user testing.

## Next

- Module 09 (USSD & SMS) — the disclosure, consent and savings services are ready for the USSD menus; then splitting the services into `packages/core` + `apps/api` with an Expo app in `apps/mobile` that uses `/api/v1`.
- Real Orange Money / Afrimoney adapters once sandbox credentials are available.
