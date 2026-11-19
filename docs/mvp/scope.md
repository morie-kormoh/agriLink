# MVP scope

Nothing gets deleted. Features outside the MVP stay in the code (they become the roadmap) and are simply **hidden** in the MVP build.

## In the MVP (shown)

| Area        | Screens / features                                                     | Why it stays                                                |
| ----------- | ---------------------------------------------------------------------- | ----------------------------------------------------------- |
| Co-op       | Record purchase, approve, payment receipt                              | Where the harvest money enters: the core of "agri payments" |
| Smart Split | Farmer paid directly, savings and loan deductions, 30% floor           | The main innovation; nothing else in the market does it     |
| Farmer      | Home, **Savings** (Harvest Lock), **My passport**, **Loans** (voucher) | The farmer's benefit, visible on one phone                  |
| Lender      | Applications → approve, one loan page, portfolio                       | Shows that a real institution can lend with it              |
| Agro-dealer | Redeem voucher (3 steps)                                               | Shows inputs, not cash, and same-day settlement             |
| SMS         | Receipts, voucher code, confirmation code                              | Feature-phone farmers are included even without the app     |
| Trust       | PIN on every money decision, consent before a lender sees data         | Answers "is this safe for farmers?" before it is asked      |

## Hidden in the MVP build (built, kept for later)

| Feature                                                         | Module | Reason to hide for the demo                                   |
| --------------------------------------------------------------- | ------ | ------------------------------------------------------------- |
| Buyer / aggregator portal                                       | 03     | Co-op alone tells the story; buyers are the same flow         |
| Disputes, batch submit step, price overrides                    | 03     | Real-world controls; they slow a demo down                    |
| Farm records entry by hand, season close                        | 05     | Auto-created sale records are enough to show                  |
| Savings goals, emergency withdrawal, custodian reconciliation   | 06     | Harvest Lock alone explains savings                           |
| Savings groups (VSLA / Osusu)                                   | 06     | Strong inclusion story: mention it, don't click through it    |
| Consent requests from lenders, access log                       | 07     | Applying for a loan already shows consent; one line is enough |
| Offers, restructure, default, manual repayment                  | 08     | Lender back-office                                            |
| Admin (users, audit, payment instructions, dealer verification) | 01, 04 | Platform operations, not farmer value                         |
| Agent offline registration                                      | 02     | Optional 30-second extra if asked about rural reach           |

## Not in the MVP (roadmap after shortlisting)

| Next                                                | When                        | Why it matters to judges                           |
| --------------------------------------------------- | --------------------------- | -------------------------------------------------- |
| USSD menu for balance, savings and loan (module 09) | Before Demo Day if possible | Rural reach without smartphones (inclusivity, 10%) |
| Real Orange Money / Afrimoney sandbox               | During the accelerator      | Moves from "mock" to "integrated"                  |
| Native mobile app on `/api/v1`                      | Pilot phase                 | The API is already built                           |
| Insurance, crowdfunding                             | Later                       | Out of scope for the MVP                           |

## MVP build — implemented

Two settings switch it on (both off by default, so the full platform is unchanged):

| Setting          | What it does                                                                                                                                                                                                                       |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `MVP_MODE=true`  | Menus show only the screens in the table above; recorded purchases go straight to the manager for approval (the two-person rule stays: the recorder can't approve); savings goals are hidden. Every other page still works by URL. |
| `DEMO_MODE=true` | Demo sign-in code `DEV_OTP_CODE` (123456), **one-click personas** on the login page, the floating **SMS** phone panel, and **Reset demo**. Demo data only.                                                                         |

| #   | Change                                                                                                                                                                                                                                                                                               | Where                                               |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| 1   | MVP menus                                                                                                                                                                                                                                                                                            | `components/shell/nav.tsx` (`MVP_MENU`)             |
| 2   | One-click personas: Co-op staff, Co-op manager, Aminata, Rokel Community Bank, Makeni Agro Inputs                                                                                                                                                                                                    | login page · `server/demo/personas.ts`              |
| 3   | **Reset demo** (login page and SMS panel): removes Aminata's loans, vouchers, consents and sales, reopens Harvest Lock at 15%, sets PIN 2580, then records one paid Le 4,000 sale through the real services, so her passport is "Fair" (53) and she can borrow up to Le 1,000. Takes about a second. | `server/demo/reset.ts`                              |
| 4   | SMS panel: receipts, voucher codes and the farmer's confirmation codes, with the recipient's name                                                                                                                                                                                                    | `components/demo/phone-panel.tsx` · `/api/demo/sms` |
| 5   | Record → manager approves (no separate "submit" step)                                                                                                                                                                                                                                                | `app/actions/trade.ts`                              |
| 6   | Public demo site                                                                                                                                                                                                                                                                                     | Vercel → Deployment Protection off (manual)         |

Reset deletes the demo farmer's payment history, including rows the database normally keeps forever (ledger and savings). It only runs with `DEMO_MODE=true` — never enable that where real farmers' data lives.

Tested end to end in a browser against a production build: `apps/web/e2e/mvp-demo.spec.ts`.
