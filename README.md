# AgriPay Salone

**Empowering Farmers Through Digital Finance.** A digital agricultural financial-inclusion platform for Sierra Leone: farmer registration, farm records, payments, savings and responsible credit on any phone.

Implemented so far: **Module 00 (Foundation), Module 01 (Identity & Access) and Module 02 (Farmer Registry)**. See `docs/IMPLEMENTATION.md` for details and `docs/module/` for the module plan.

## Stack

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS v4 · shadcn/ui + Radix UI · Lucide · Node.js 22 · Prisma 7 + PostgreSQL 16/PostGIS · Redis + BullMQ · Zod · next-intl (English/Krio) · Dexie (offline) · Vitest · Playwright · Turborepo + pnpm.

```
apps/web      Next.js portals (agent, co-op, admin, farmer…), API routes, offline PWA
apps/ussd     Fastify USSD/SMS service (skeleton — module 09)
apps/worker   BullMQ background jobs (SMS now; payments/scoring later)
packages/db   Prisma schema (one file per module), migrations, seed
packages/ui   shadcn/ui components + AgriPay theme
packages/validation  Zod schemas, phone/money helpers, permission matrix
packages/i18n English + Krio messages, t() for USSD/SMS
packages/config  shared tsconfig / ESLint
```

## Getting started (macOS)

Prerequisites: Node.js 22 (`nvm use`), pnpm 10 (`corepack enable`), Docker Desktop.

```bash
cd ~/Development/agripay
cp .env.example .env                # then set AUTH_SECRET (openssl rand -base64 32)
pnpm install                        # also generates the Prisma client
pnpm infra:up                       # Postgres+PostGIS, Redis, MinIO
pnpm db:deploy                      # apply migrations (or `pnpm db:migrate` while developing)
pnpm db:seed                        # districts, chiefdoms, crops + demo data
pnpm --filter @agripay/web seed:demo   # optional: purchases, payments, records, Harvest Lock, scores, a loan application
pnpm dev                            # web on http://localhost:3000, USSD on :4000, worker
```

### Demo logins

Sign in with the phone number and the code **123456** (set by `DEV_OTP_CODE` in `.env`; only works with `pnpm dev`). Remove that line to get random codes, which are printed in the **web server console**.

| Phone       | Role                                                                    |
| ----------- | ----------------------------------------------------------------------- |
| 076 000 001 | Platform admin                                                          |
| 076 000 002 | Bombali Rice Farmers Cooperative — admin                                |
| 076 000 003 | Kenema Cocoa Growers Cooperative — admin                                |
| 076 000 004 | Bombali co-op staff (records purchases)                                 |
| 076 000 010 | Field agent (Bombali)                                                   |
| 076 000 020 | Buyer — admin (approves)                                                |
| 076 000 030 | Rokel Community Bank — lender admin (approves loans, savings custodian) |
| 076 000 031 | Rokel Community Bank — loan officer                                     |
| 076 000 040 | Makeni Agro Inputs — agro-dealer (redeems vouchers)                     |
| 076 000 021 | Buyer — staff (records purchases)                                       |
| 077 100 001 | Farmer — Aminata Sesay (AP-BOM-000001)                                  |

Also seeded: programme officer (076 000 050) — that portal arrives with module 11.

The demo script gives demo farmers who have **no PIN yet** the PIN **2580** (it never changes a PIN someone already set).

### Demo payment flow (mock wallets)

Payments run against a built-in **mock provider** until real Orange Money / Afrimoney credentials are added. The last digits of the destination wallet control what happens:

| Wallet ends in | Behaviour                                                    |
| -------------- | ------------------------------------------------------------ |
| `…999`         | Fails temporarily, then succeeds on retry                    |
| `…998`         | Fails permanently (shows up in Admin → Payment instructions) |
| `…997`         | Stays pending, then succeeds when its status is polled       |
| anything else  | Succeeds immediately                                         |

Try it: sign in as co-op staff (076 000 004) → **Collections → Record purchase**; then as the co-op admin (076 000 002) open the batch and **Approve** — the Smart Split pays dues and the farmer directly and the farmer gets an SMS receipt. The person who records a purchase can never approve it.

### Demo savings & credit flow (modules 06–08)

1. Farmer **077 100 001** → **Savings** (Harvest Lock), **My passport** (score, tips, who can see it), **Loans** (voucher, terms).
2. Lender admin **076 000 030** → **Applications** → approve the demo application → a voucher code is SMSed to the farmer (see the server console).
3. Agro-dealer **076 000 040** → **Redeem voucher** → enter the code, pick items → the farmer gets an SMS code (123456 in development) → confirm. The dealer is paid the same day.
4. Record and approve another purchase for the farmer (co-op staff 076 000 004, admin 076 000 002): the loan repayment and savings come out automatically and the farmer keeps at least 30%.

Daily jobs (savings releases, arrears, expiry) run from the worker at 06:00; to run them now: `curl -X POST -H "Authorization: Bearer $INTERNAL_API_TOKEN" localhost:3000/api/internal/jobs/daily`.

### Mobile / API (`/api/v1`)

All features are also available as a versioned REST API for the coming native app:

- Docs: `http://localhost:3000/api/v1/docs` (OpenAPI 3.1 at `/api/v1/openapi.json`)
- Sign in: `POST /api/v1/auth/otp/request` → `POST /api/v1/auth/otp/verify` returns a 15-minute access token and a 30-day refresh token (rotated on every `POST /api/v1/auth/refresh`; reusing an old one revokes the session).
- Send `Authorization: Bearer <accessToken>`. Users with more than one role choose one with `POST /api/v1/me/context` (until then, endpoints return `409 CONTEXT_REQUIRED`).

Set `INTERNAL_API_TOKEN` in `.env` so the worker can run payment retries and status polling every minute.

## Scripts

| Command                               | What it does                                                                                           |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `pnpm dev`                            | Run all apps                                                                                           |
| `pnpm test`                           | Unit + integration tests (needs Postgres; uses `DATABASE_URL_TEST`)                                    |
| `pnpm --filter @agripay/web test:e2e` | Playwright end-to-end tests (needs `pnpm dev` + seeded DB; run `npx playwright install chromium` once) |
| `pnpm typecheck` / `pnpm lint`        | Type-check / lint every package                                                                        |
| `pnpm build`                          | Production build                                                                                       |
| `pnpm db:migrate`                     | Create/apply a migration while developing                                                              |
| `pnpm db:studio`                      | Browse the database                                                                                    |

The test database `agripay_test` is created automatically by `infra/postgres/init.sql` on first `infra:up`. Apply migrations to it with
`DATABASE_URL=postgresql://agripay:agripay@localhost:5432/agripay_test pnpm db:deploy`.
