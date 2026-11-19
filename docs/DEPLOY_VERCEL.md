# Deploying a demo to Vercel

Vercel hosts the web app (`apps/web`): all portals and the `/api/v1` API. Docker, the worker
(`apps/worker`) and the USSD service (`apps/ussd`) do not run on Vercel and are not needed for the demo.

| Part                          | Demo hosting                                                                                   |
| ----------------------------- | ---------------------------------------------------------------------------------------------- |
| Web app + API                 | Vercel (Root Directory `apps/web`)                                                             |
| PostgreSQL (PostGIS, pg_trgm) | Neon (Vercel Marketplace), region Frankfurt                                                    |
| Redis                         | Not needed (rate limits fall back to memory). Optional: Upstash `rediss://` URL in `REDIS_URL` |
| Scheduled jobs                | Vercel Cron (`apps/web/vercel.json`): daily jobs 06:00, scores 01:30 UTC                       |
| SMS                           | Printed in Vercel → Logs (`SMS_PROVIDER=console`)                                              |

## 1. Database

Create a Neon database (Frankfurt). From your computer, using the **direct** (non-pooled) URL:

```bash
DATABASE_URL="<neon direct url>" pnpm db:deploy
DATABASE_URL="<neon direct url>" pnpm db:seed
DATABASE_URL="<neon direct url>" pnpm --filter @agrilink/web seed:demo
```

## 2. Vercel project

Import the GitHub repo → **Root Directory: `apps/web`** (framework Next.js, pnpm detected). Region comes from `vercel.json` (`fra1`).

## 3. Environment variables (Production)

| Name                    | Value                                                                   |
| ----------------------- | ----------------------------------------------------------------------- |
| `DATABASE_URL`          | Neon **pooled** URL                                                     |
| `AUTH_SECRET`           | long random string (`openssl rand -base64 32`)                          |
| `INTERNAL_API_TOKEN`    | long random string                                                      |
| `CRON_SECRET`           | long random string (≥ 16 chars) — Vercel sends it to the cron endpoints |
| `APP_URL`               | `https://<project>.vercel.app`                                          |
| `SMS_PROVIDER`          | `console`                                                               |
| `PAYMENT_PROVIDER_MODE` | `mock`                                                                  |
| `DEMO_MODE`             | `true` — enables the fixed sign-in code below (demo data only)          |
| `DEV_OTP_CODE`          | `123456`                                                                |
| `MVP_MODE`              | `true` — only the MVP screens (docs/mvp/scope.md)                       |

Do **not** set `REDIS_URL` unless you add Upstash. Redeploy after changing variables.

## 4. Try it

Open `/login`, click **Reset demo**, then use the one-click personas (or any demo number with code `123456`).
Follow `docs/mvp/demo-script.md`; the **SMS** button bottom-right shows what each person received.
API docs: `https://<project>.vercel.app/api/v1/docs`.

## Troubleshooting

"Something went wrong" → Vercel → Project → **Logs**, filter by the failing request; the real error is logged there.

- `ECONNREFUSED 127.0.0.1:6379` → a `REDIS_URL` pointing to localhost is set: remove it.
- `Invalid environment: …` → a variable above is missing or too short.
- Database connection / SSL errors → check you used the Neon **pooled** URL with `sslmode=require`.

## Limits of the demo setup

- Hobby plan: cron jobs run at most once a day, so the per-minute payment retry check does not run
  (normal demo payments succeed immediately; the 999/997 test wallets stay pending). Use Pro, or an external
  scheduler calling `GET /api/internal/payments/tick` with `Authorization: Bearer $CRON_SECRET`.
- Never enable `DEMO_MODE` on a deployment with real farmers' data: anyone could sign in as anyone.
