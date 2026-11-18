# Module 09 — USSD & SMS Channel

## 1. Purpose

Make every core farmer action available on **any phone over 2G**, through a USSD menu and SMS. This channel holds **no business logic**: it is a thin, stateful UI that calls the same services as the web app through an internal API.

## 2. Scope

**In:** USSD gateway callback handling, session state machine, menu definitions, PIN entry, pagination for small screens, language selection, inbound SMS commands (replies, keywords), outbound SMS via module 10, **browser USSD simulator** for demo/testing, dealer and agent USSD menus.
**Out:** Message templates & providers (10).

## 3. Dependencies

01, 02, 03, 05, 06, 07, 08, 10.

## 4. Architecture

```
MNO / aggregator ──HTTP──► apps/ussd (Fastify)
                              │  session store: Redis (TTL 180s)
                              │  menu engine (state machine)
                              ▼
                     apps/web /api/internal/* (token + HMAC)
                              ▼
                        domain services
```

- Gateway request (typical): `sessionId, serviceCode, phoneNumber, text` (input history joined with `*`). Response begins with `CON` (continue) or `END` (final).
- Gateway specifics wrapped by a `GatewayAdapter` (one per aggregator/MNO), so the menu engine stays the same.
- Screen limit: **≤ 160 characters** per screen (some handsets show 182; use 160 to be safe), ≤ 6 options, "0 Back", "00 Home", "98 More".
- Session timeout handling: if a session drops mid-flow, the next dial offers "Continue where you stopped? 1 Yes 2 No" (draft stored for 10 minutes).

## 5. Data model (`prisma/schema/channel.prisma`)

```prisma
model UssdSessionLog {
  id         String   @id @default(cuid())
  sessionId  String
  phone      String
  steps      Json                 // [{state, input, at}] — PIN inputs masked
  outcome    String?              // COMPLETED, TIMEOUT, ERROR, ABANDONED
  durationMs Int?
  createdAt  DateTime @default(now())
  @@index([phone])
}

model InboundSms {
  id         String   @id @default(cuid())
  from       String
  to         String
  text       String
  providerRef String? @unique
  handledAs  String?              // PURCHASE_ACK, KEYWORD_BAL, UNKNOWN
  processedAt DateTime?
  receivedAt DateTime @default(now())
}
```

## 6. Menu map (farmer)

```
*XXX#
1 My Money      → 1 Balance & last payments  2 My sales  3 Statement by SMS
2 Savings       → 1 Harvest Lock balance  2 Change save %  3 Group savings  4 Withdraw early
3 Loans         → 1 My offers  2 My loan  3 Repay now  4 My voucher
4 My Farm       → 1 Add expense  2 Record harvest  3 Season summary
5 AgriPay Score → score, band, top tip; 1 Requests (consent)  2 Who viewed
6 My Profile    → ID, co-op, wallet; 1 Change PIN  2 Language
0 Help          → call/SMS co-op or agent
```

First-time dialers: language (1 English 2 Krio) → set PIN → home. Unregistered numbers: "1 Register (basic) 2 Find an agent".

**Agro-dealer menu:** 1 Redeem voucher 2 Today's redemptions 3 Settlement status.
**Agent menu:** 1 Quick-register farmer 2 Check farmer status 3 My commissions.

## 7. Menu engine design (`apps/ussd/src/engine`)

```ts
type Screen = (ctx: SessionCtx) => Promise<{ text: string; end?: boolean; next?: Record<string, StateId> | ((input: string) => StateId) }>;
const states: Record<StateId, Screen> = { HOME, MONEY, MONEY_BALANCE, SAVINGS, ... };
```

- Session context: `phone, userId, locale, stateStack, draft, pinVerifiedUntil`.
- PIN screen is a reusable state: `requirePin(nextState)`; PIN verified via internal API; never stored in logs (masked `****`).
- All texts via `t(locale, key, vars)` from `packages/i18n`; a unit test checks every rendered screen ≤ 160 chars in every locale.
- Money formatting short: `Le 4,000`.

## 8. Inbound SMS

- Replies to purchase receipts: `1` / `2` → `acknowledgePurchase` (match the latest pending purchase for that phone).
- Keywords: `BAL`, `SAVE`, `LOAN`, `SCORE`, `HELP` (case-insensitive, English & Krio aliases).
- Unknown → helpful reply with the USSD code.

## 9. Browser USSD simulator (demo-critical)

- Route `/(public)/simulator` (dev and demo environments only): a phone-shaped UI (feature-phone look), phone number selector from seeded farmers, keypad, screen.
- Calls `apps/ussd` with the same payload as a real gateway, so the demo uses the real menu engine.
- Side panel shows "SMS inbox" for the selected phone (module 10 console provider writes to a table the simulator reads).

## 10. Step-by-step implementation

1. Add `channel.prisma`; migrate.
2. Fastify callback route + `GatewayAdapter` interface + a generic adapter (form-encoded `sessionId/phoneNumber/text`).
3. Redis session store (TTL 180 s) and resume-draft store (10 min).
4. Menu engine core: state registry, navigation (back/home/more), pagination helper, length guard.
5. Internal API client (HMAC-signed) and internal routes in `apps/web` for each needed service call.
6. PIN state + first-time onboarding (language, PIN).
7. Implement farmer menus in order of demo value: Money → Savings → Score/Consent → Loans/Voucher → Farm records → Profile.
8. Dealer redeem menu (code → amount → farmer OTP).
9. Agent quick-register menu.
10. Inbound SMS route + parser + handlers.
11. Browser simulator UI + SMS inbox panel.
12. Session logging with PIN masking; metrics: completion rate, average steps, timeouts.
13. Krio texts reviewed by native speakers during the accelerator user tests.
    ✅ _Checkpoint:_ full demo story runs in the simulator: check balance → accept consent → accept loan → see voucher SMS.

## 11. Acceptance criteria

- Every screen ≤ 160 characters in all supported languages (automated test).
- Any core task completes in ≤ 5 screens after PIN.
- PINs never appear in logs.
- A dropped session can be resumed.
- Simulator behaves exactly like the gateway path.

## 12. Tests

- Unit: each state's text and transitions (snapshot tests per locale), length guard, input parsing.
- Integration: full flows against a seeded DB via internal API.
- Load: 50 concurrent sessions with p95 response < 1 s (USSD gateways time out quickly).
