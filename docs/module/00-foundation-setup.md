# Module 00 — Foundation & Project Setup

## 1. Purpose

Create the monorepo, tooling, database, design system and CI that every other module builds on.

## 2. Scope

**In:** Turborepo + pnpm workspaces, Next.js app, USSD service skeleton, worker skeleton, Prisma + PostgreSQL/PostGIS, Redis, MinIO, Tailwind + shadcn/ui + Radix + Lucide, linting, testing, CI, environment config, seed data for geography and crops.
**Out:** Business features (start in module 01).

## 3. Dependencies

None.

## 4. Target structure

```
agripay/
├─ apps/
│  ├─ web/                 # Next.js 15+ (App Router) — portals + PWA + API route handlers
│  ├─ ussd/                # Fastify service — USSD/SMS callbacks
│  └─ worker/              # BullMQ workers — payments, SMS, scoring, reports
├─ packages/
│  ├─ db/                  # Prisma schema (multi-file), client, migrations, seed
│  ├─ ui/                  # shadcn/ui components, Tailwind preset, theme tokens
│  ├─ validation/          # Zod schemas shared by all apps
│  ├─ payments/            # payment adapters + ledger helpers (module 04)
│  ├─ scoring/             # passport rules engine (module 07)
│  ├─ i18n/                # translation JSON (en, kri, men, tem)
│  └─ config/              # eslint, tsconfig, prettier, tailwind base
├─ docs/
├─ docker-compose.yml
├─ turbo.json
├─ pnpm-workspace.yaml
└─ .env.example
```

## 5. Key technology versions (pin at install time)

Node.js LTS · pnpm · Next.js (App Router) · React · TypeScript · Tailwind CSS v4 · shadcn/ui · Radix UI · lucide-react · Prisma · PostgreSQL 16 + PostGIS · Redis 7 · BullMQ · Zod · Vitest · Playwright.

## 6. Environment variables (`.env.example`)

```
DATABASE_URL=postgresql://agripay:agripay@localhost:5432/agripay
REDIS_URL=redis://localhost:6379
S3_ENDPOINT=http://localhost:9000
S3_ACCESS_KEY=minio
S3_SECRET_KEY=minio123
S3_BUCKET=agripay
AUTH_SECRET=change-me
APP_URL=http://localhost:3000
USSD_SERVICE_URL=http://localhost:4000
INTERNAL_API_TOKEN=change-me
SMS_PROVIDER=console          # console | <provider>
PAYMENT_PROVIDER_MODE=mock    # mock | sandbox | live
DEFAULT_LOCALE=en
SENTRY_DSN=
```

## 7. Step-by-step implementation

### Step 0.1 — Repository & workspace

1. `mkdir agripay && cd agripay && git init`.
2. `pnpm dlx create-turbo@latest .` (choose pnpm), then remove the sample apps.
3. Create `pnpm-workspace.yaml` with `apps/*` and `packages/*`.
4. Add root scripts: `dev`, `build`, `lint`, `typecheck`, `test`, `db:migrate`, `db:seed`, `db:studio`.
5. Add `.editorconfig`, `.gitignore` (node_modules, .env*, .next, dist, coverage), `.nvmrc`.
   ✅ _Checkpoint:_ `pnpm install` succeeds; `pnpm turbo run lint` runs (empty).

### Step 0.2 — Shared config package

1. `packages/config`: `tsconfig/base.json` (strict, `noUncheckedIndexedAccess`), `tsconfig/nextjs.json`, `tsconfig/node.json`.
2. ESLint flat config (typescript-eslint, react, import order), Prettier with Tailwind plugin.
   ✅ _Checkpoint:_ each package extends the shared tsconfig.

### Step 0.3 — Local infrastructure

1. `docker-compose.yml` with services: `postgres` (image `postgis/postgis:16-3.4`), `redis:7`, `minio` (+ console), `mailpit` (optional).
2. Named volumes; healthchecks.
3. `pnpm infra:up` / `infra:down` scripts.
   ✅ _Checkpoint:_ `docker compose up -d` → all healthy.

### Step 0.4 — Database package

1. `packages/db`: install `prisma` and `@prisma/client`.
2. Enable multi-file schema: `prisma/schema/` folder with `base.prisma` (generator + datasource with `extensions = [postgis]`, `previewFeatures` as required by your Prisma version).
3. Create `geo.prisma` with reference tables:
   ```prisma
   model Region   { id String @id @default(cuid()) name String @unique districts District[] }
   model District { id String @id @default(cuid()) code String @unique name String regionId String region Region @relation(fields:[regionId], references:[id]) chiefdoms Chiefdom[] }
   model Chiefdom { id String @id @default(cuid()) name String districtId String district District @relation(fields:[districtId], references:[id]) @@unique([districtId, name]) }
   model Crop     { id String @id @default(cuid()) code String @unique name String unitDefault String @default("kg") active Boolean @default(true) }
   ```
4. Export a singleton client (`src/client.ts`) safe for Next.js hot reload.
5. Seed script (`prisma/seed.ts`): 5 regions/provinces, 16 districts with 3-letter codes (e.g. `BOM`, `KEN`, `BO`, `WAU`…), chiefdoms for pilot districts first, crops (RICE, CASSAVA, COCOA, COFFEE, OIL_PALM, GROUNDNUT, MAIZE, VEGETABLES, PEPPER).
   ✅ _Checkpoint:_ `pnpm db:migrate && pnpm db:seed` populates reference data.

### Step 0.5 — Next.js web app

1. `pnpm create next-app apps/web --ts --tailwind --app --src-dir --eslint`.
2. Add `@agrilink/db`, `@agrilink/ui`, `@agrilink/validation`, `@agrilink/i18n` as workspace deps.
3. Folder conventions:
   ```
   src/app/(public)/            landing, login
   src/app/(farmer)/ (agent)/ (coop)/ (buyer)/ (lender)/ (dealer)/ (programme)/ (admin)/
   src/app/api/                 route handlers (webhooks, internal API)
   src/server/<module>/         service.ts, repository.ts, permissions.ts, events.ts
   src/lib/                     utils, money.ts, ids.ts, errors.ts
   ```
4. `src/lib/money.ts`: `formatLe(decimal)`, `toDecimal()`, `sumDecimals()`.
5. `src/lib/ids.ts`: `nextHumanId(prefix, districtCode)` using a Postgres sequence per prefix.
6. `src/lib/errors.ts`: `AppError` with codes (`FORBIDDEN`, `NOT_FOUND`, `VALIDATION`, `CONFLICT`, `PROVIDER_ERROR`).
   ✅ _Checkpoint:_ `pnpm --filter web dev` serves a placeholder page.

### Step 0.6 — Design system (`packages/ui`)

1. Initialise shadcn/ui pointing to `packages/ui` (monorepo mode).
2. Add components: button, input, label, form, select, combobox, dialog, sheet, dropdown-menu, table, card, badge, tabs, toast (sonner), skeleton, alert, progress, avatar, calendar, date-picker, command.
3. Theme tokens: primary **green** (agriculture), accent **gold** (harvest), semantic success/warning/danger; light + dark.
4. Shared layout pieces: `AppShell` (sidebar + topbar), `PageHeader`, `StatCard`, `DataTable` (TanStack Table), `EmptyState`, `MoneyText`, `StatusBadge`.
5. Use `lucide-react` icons only (e.g. `Sprout`, `Wallet`, `PiggyBank`, `HandCoins`, `Receipt`, `Users`, `ShieldCheck`).
6. Accessibility: visible focus rings, min 44px touch targets, labels on every input.
   ✅ _Checkpoint:_ `/dev/ui` page renders all components.

### Step 0.7 — Validation & i18n packages

1. `packages/validation`: export `phoneSL` (normalises to `+232XXXXXXXX`), `moneyLe`, `pagination`, `idParam`.
2. `packages/i18n`: `messages/en.json`, `kri.json` (start with keys copied from English), helper `t(locale, key, vars)` for non-React contexts (USSD/SMS).
   ✅ _Checkpoint:_ `phoneSL.parse("076 123456")` → `+23276123456`.

### Step 0.8 — USSD & worker skeletons

1. `apps/ussd`: Fastify, `/health`, `/ussd/callback` (returns `END Coming soon`), pino logging.
2. `apps/worker`: BullMQ connection, queue registry (`sms`, `payments`, `scoring`, `reports`, `events`), graceful shutdown.
   ✅ _Checkpoint:_ both start with `pnpm dev` via Turborepo.

### Step 0.9 — Testing & quality

1. Vitest in every package (`vitest.workspace.ts`).
2. Test DB: `DATABASE_URL_TEST`, a `resetDb()` helper that truncates tables between tests.
3. Playwright in `apps/web/e2e`.
4. Husky + lint-staged: lint and typecheck on commit.

### Step 0.10 — CI/CD & observability

1. GitHub Actions: install → lint → typecheck → test (with Postgres + Redis services) → build.
2. Dockerfiles for `web`, `ussd`, `worker` (multi-stage, Node slim).
3. Sentry SDK in web/ussd/worker (DSN optional in dev).
4. Pino structured logs with a `requestId`.
   ✅ _Checkpoint:_ PR pipeline green.

## 8. Acceptance criteria

- New developer: clone → `pnpm i` → `pnpm infra:up` → `pnpm db:migrate && pnpm db:seed` → `pnpm dev` works in < 15 minutes.
- Reference data (districts, chiefdoms, crops) seeded.
- UI kit page renders on mobile (360px) and desktop.
- CI runs on every PR.

## 9. Tests

- `money.ts`: rounding, formatting, decimal sums.
- `phoneSL`: valid/invalid formats for Orange, Africell and QCell prefixes.
- `nextHumanId`: unique under concurrency (parallel inserts).
