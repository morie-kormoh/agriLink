# AgriLink Salone — UI/UX design

Design system and screen designs for `apps/web`: the public site, the farmer, co-op, lender and agro-dealer portals, and the platform admin console. Built on the existing stack: Tailwind v4 tokens in `packages/ui/src/styles/globals.css`, shadcn/ui on Radix, Lucide icons.

Contents:

1. [Who we design for](#1-who-we-design-for)
2. [Design direction: "Gara & Paddy"](#2-design-direction-gara--paddy)
3. [Design tokens](#3-design-tokens)
4. [Signature components](#4-signature-components)
5. [Layout system](#5-layout-system)
6. [Screens: public site](#6-screens-public-site)
7. [Screens: farmer app](#7-screens-farmer-app)
8. [Screens: co-op, lender, agro-dealer](#8-screens-co-op-lender-agro-dealer)
9. [Screens: admin console](#9-screens-admin-console)
10. [Words, states and accessibility](#10-words-states-and-accessibility)
11. [Implementation plan](#11-implementation-plan)

---

## 1. Who we design for

| User                               | Device and setting                                                                                            | What they need from the screen                                                                          |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| **Farmer** (e.g. Aminata, Bombali) | Low-cost Android, 5–6", often in sunlight, patchy data, may share the phone; some farmers read little English | One clear number (money), one clear action, words in English or Krio, PIN for anything that moves money |
| **Co-op staff**                    | Phone or tablet at the weighing point, gloves and dust, offline at times                                      | Big inputs, fast repeat entry, a clear "recorded" confirmation                                          |
| **Co-op manager**                  | Laptop in the office, sometimes phone                                                                         | A queue to approve, totals, who is waiting to be paid                                                   |
| **Lender officer / admin**         | Laptop                                                                                                        | Dense tables, risk at a glance, a clear audit trail                                                     |
| **Agro-dealer**                    | Phone at the shop counter                                                                                     | A 3-step counter flow that is impossible to get wrong                                                   |
| **Platform admin**                 | Laptop                                                                                                        | System health, stuck payments, users, audit, reconciliation                                             |
| **Demo Day judges**                | Projector or shared screen                                                                                    | Understand the idea in seconds                                                                          |

Two rules follow from this table:

- **Mobile first for farmers, co-op staff and dealers; desktop first for lenders and admins.** These are different layouts, not one layout squeezed.
- **Money is the hero of every farmer screen.** If a screen shows money, the amount is the largest thing on it.

---

## 2. Design direction: "Gara & Paddy"

AgriLink should look like it comes from Sierra Leone, not from a template. The direction draws on two things every user knows:

- **Gara cloth.** The indigo tie-dye cloth made in Makeni and Kenema gives the deep indigo brand colour and a soft circular "resist-dye" motif, used rarely.
- **Paddy and harvest.** Rice paddy green means money arriving and success; harvest gold means savings and value kept.

The result is bold and colourful where money moves, and calm everywhere else.

### The one memorable thing: the Split Ribbon

Every payment in AgriLink is split: loan first, then savings, then co-op dues, then the farmer. The **Split Ribbon** is a single horizontal bar that shows that split in colour, with the farmer's share always last and always largest on screen. It appears on the landing page hero, payment receipts, the approval screen, the farmer's home and the admin payment pages. It is the visual identity of the product, so it is the only place the full palette appears together.

```
 Le 4,000 sale
 ┌──────────────┬───────────┬──┬────────────────────────────────┐
 │ Loan 1,100   │ Saved 435 │80│ To Aminata  Le 2,385           │
 └──────────────┴───────────┴──┴────────────────────────────────┘
   indigo         gold       teal  paddy green
   (loan first, then 15% of the rest saved, then 2% co-op dues, then the farmer)
```

### What I chose against, and why

| Default look I avoided                                         | Why it's wrong here                                                                            | What we do instead                                                            |
| -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Generic fintech: white cards, soft grey shadows, a single blue | Looks like every wallet app, and the challenge excludes "another mobile money app"             | Indigo chrome plus a money palette that only appears where money moves        |
| Warm cream background with a serif display                     | A common template look; also low contrast in sunlight                                          | Cool, very light indigo-tinted background (`#F6F7FB`), high contrast ink      |
| Dark dashboard with neon accent                                | Unreadable outdoors on low-cost screens                                                        | Light theme by default; dark theme for office users                           |
| Identical rounded cards everywhere                             | Hides hierarchy                                                                                | Three surface levels with different shapes (see radius)                       |
| Inter / system font                                            | Characterless, and many fonts confuse 1/l/I and 0/O, which matters for money and voucher codes | Atkinson Hyperlegible Next for all UI text; Bricolage Grotesque for headlines |

---

## 3. Design tokens

### 3.1 Colour

**Base palette**

| Name         | Hex       | Role                                                                                  |
| ------------ | --------- | ------------------------------------------------------------------------------------- |
| Gara Indigo  | `#1F2A6B` | Brand, navigation, headings on light, loan share in the ribbon                        |
| Ink          | `#14183A` | Body text (indigo-black, never pure black)                                            |
| Mist         | `#F6F7FB` | App background                                                                        |
| Paddy Green  | `#2E9E5B` | Money in, farmer's share, success fills (never small text on white)                   |
| Field Green  | `#1E7F45` | Primary buttons and green text (5.0:1 with white)                                     |
| Harvest Gold | `#F2B33D` | Savings, highlights, the "saved" share (always with Ink text, never as text on white) |
| Lagoon Teal  | `#0F6E8C` | Information, co-op dues share, links in admin                                         |
| Kola Red     | `#C2362B` | Errors, late, destructive (5.5:1 with white)                                          |
| Slate        | `#5A6080` | Secondary text (5.7:1 on Mist)                                                        |

Contrast checked: Ink on Mist 16:1; white on Indigo 13:1; white on Field Green 5.0:1; Ink on Gold 9.2:1; white on Kola Red 5.5:1; Slate on Mist 5.7:1. Paddy Green with white text is 3.4:1, so it is only used for fills, icons and large figures, never for button labels.

**Split Ribbon colours** (the only place they appear together)

| Share             | Colour                 |
| ----------------- | ---------------------- |
| Loan repayment    | Gara Indigo `#1F2A6B`  |
| Savings           | Harvest Gold `#F2B33D` |
| Co-op dues        | Lagoon Teal `#0F6E8C`  |
| Insurance (later) | Violet `#6D4AB8`       |
| Farmer            | Paddy Green `#2E9E5B`  |
| Dealer settlement | Slate `#5A6080`        |

**Mapping to the existing CSS variables** (`packages/ui/src/styles/globals.css`, light theme)

| Variable        | New value                         | Was                |
| --------------- | --------------------------------- | ------------------ |
| `--background`  | `#F6F7FB` Mist                    | near-white green   |
| `--foreground`  | `#14183A` Ink                     | dark green         |
| `--primary`     | `#1E7F45` Field Green             | leaf green         |
| `--secondary`   | `#E8EAF5` (indigo 8%)             | pale green         |
| `--accent`      | `#F2B33D` Harvest Gold            | gold (kept, tuned) |
| `--destructive` | `#C2362B` Kola Red                | red                |
| `--info`        | `#0F6E8C` Lagoon Teal             | blue               |
| `--sidebar`     | `#1F2A6B` Gara Indigo             | dark green         |
| `--ring`        | `#0F6E8C` Lagoon Teal             | green              |
| `--chart-1…5`   | Indigo, Gold, Teal, Paddy, Violet | mixed              |

New tokens to add: `--split-loan`, `--split-savings`, `--split-dues`, `--split-insurance`, `--split-farmer`, `--split-dealer`, `--money-in` (Paddy), `--money-out` (Kola Red).

**Dark theme** (office users only; the farmer app defaults to light): background `#10132B`, cards `#181C3A`, text `#EEF0FA`, primary `#3DBE76`, gold and ribbon colours unchanged.

### 3.2 Typography

| Role                                               | Typeface                                       | Why                                                                                                            |
| -------------------------------------------------- | ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Headlines, big money figures, landing page         | **Bricolage Grotesque** (variable, 600–800)    | Warm, a little irregular like hand-dyed cloth; strong at large sizes                                           |
| All interface text: body, labels, tables, forms    | **Atkinson Hyperlegible Next** (400, 600, 700) | Designed for legibility: 1, l and I, and 0 and O are distinct. That matters for amounts, phone numbers and IDs |
| Voucher codes, AgriLink IDs, transaction refs only | **Atkinson Hyperlegible Mono**                 | Fixed width so a code read aloud matches what is printed                                                       |

Numbers always use tabular figures (`font-variant-numeric: tabular-nums`) so columns of Leones line up.

**Type scale** (ratio 1.25, base 16px; farmer app base 17px)

| Token      | Size / line height              | Use                                           |
| ---------- | ------------------------------- | --------------------------------------------- |
| `display`  | 48 / 52, Bricolage 800          | Landing hero only                             |
| `money-xl` | 40 / 44, Bricolage 700, tabular | The farmer's main balance                     |
| `h1`       | 30 / 36, Bricolage 700          | Page titles                                   |
| `h2`       | 24 / 30, Bricolage 600          | Section titles                                |
| `h3`       | 19 / 26, Atkinson 700           | Card titles                                   |
| `body`     | 16 / 24, Atkinson 400           | Default                                       |
| `small`    | 14 / 20, Atkinson 400           | Help text, table cells in admin               |
| `micro`    | 13 / 18, Atkinson 600           | Badges and timestamps (never smaller than 13) |

Rules: sentence case everywhere; no all-caps labels; body lines under 70 characters; Krio strings can be 30% longer, so no fixed-width buttons.

### 3.3 Spacing, radius and elevation

- **Spacing:** 4px base. Mobile page padding 16px; desktop 32px. Space between sections 32px mobile, 48px desktop.
- **Touch targets:** at least 48 × 48px on farmer, co-op and dealer screens (larger than the usual 44).
- **Radius by hierarchy, not one value everywhere:**

| Surface                                 | Radius                           |
| --------------------------------------- | -------------------------------- |
| Page sections and tables                | 0 (flat, edge-to-edge on mobile) |
| Inputs and buttons                      | 12px                             |
| Money cards (balance, voucher, receipt) | 20px, plus the gara motif        |
| Pills and badges                        | full                             |

- **Elevation:** almost none. Separation comes from colour (white cards on Mist) and 1px borders (`#E3E5EF`). Only floating things (bottom sheet, toast, SMS panel button) get a shadow, tinted indigo: `0 8px 24px rgb(31 42 107 / 0.18)`.

### 3.4 Iconography and imagery

- Lucide icons, 1.75px stroke, 20px in UI and 24px in the farmer app bottom bar.
- Each money type has one fixed icon and colour, used everywhere: loan `HandCoins` (indigo), savings `PiggyBank` (gold), dues `Users` (teal), farmer `Wallet` (green), voucher `Ticket`, dealer `Store`.
- Illustration: flat, two-colour (indigo plus one money colour), built from simple shapes: a rice sheaf, a cocoa pod, a bag of fertiliser, a phone. Used only on empty states and the landing page.
- **Gara motif:** a pattern of soft circles and dots (SVG, 6% opacity) on money cards, the login side panel and the landing hero. Never behind text that must be read in a table.
- Photos: only real, consented photos of Sierra Leonean farmers (none in the MVP). No stock photos.

### 3.5 Motion

One orchestrated moment, everything else quiet:

- **The split moment.** When a payment succeeds (receipt, approval result, landing hero), the Split Ribbon fills left to right: loan, then savings, then dues, then the farmer's share, with amounts counting up (600ms total, ease-out). This is the "eye-catching" moment and it explains the product.
- Everything else only responds to the person's action: sheets slide up (200ms), buttons press, toasts fade.
- `prefers-reduced-motion`: the ribbon appears fully drawn, no counting.

---

## 4. Signature components

### 4.1 Split Ribbon

```
<SplitRibbon gross="4000" splits=[{type, amountLe}] size="sm|md|lg" animate />
```

- Segment widths are proportional; any share under 4% is drawn at 4% so it stays visible, with the real amount in the legend.
- Legend underneath in the same order, each with the fixed icon: "Loan Le 1,100 · Saved Le 435 · Dues Le 80 · You Le 2,385".
- **The farmer's share is always the last segment and is labelled "You" on farmer screens** and with the farmer's name elsewhere.
- If the 30% floor protected the farmer, a small gold note: "We kept at least 30% for you."
- Accessible as a list: screen readers hear "Payment of Le 4,000: loan Le 1,100, savings Le 435, …".

### 4.2 Money figure

The largest text on a farmer screen. `Le` set smaller and raised, amount in Bricolage tabular. Incoming money is Field Green with a `+`; outgoing is Ink with a `−` (red only for errors and late amounts, not for normal spending).

```
  Le 2,385        ← money-xl
  Paid to your Orange Money · today 10:42
```

### 4.3 Voucher ticket

A card cut like a ticket (two half-circle notches on the sides), gold edge, gara motif:

```
 ╭─────────────────────────────────────╮
 │  Input voucher     Rokel Community B. │
 │                                       │
 │      K7P4 - R2QX                      │  ← Atkinson Mono 32px
 ◖  Le 300 left of Le 1,000             ◗
 │  Valid to 18 Jan · seed, fertiliser   │
 │  [ Where to use it ]                  │
 ╰─────────────────────────────────────╯
```

### 4.4 PIN sheet

A bottom sheet (dialog on desktop) that always shows what is being confirmed before the PIN:

```
 ┌─────────────────────────────────┐
 │  Apply for Le 800 input loan     │
 │  Total to repay Le 864           │
 │  Up to 50% of each sale          │
 │  ───────────────────────────     │
 │  Your PIN   ● ● ● ○              │
 │  ┌───┬───┬───┐                   │
 │  │ 1 │ 2 │ 3 │  big keypad,      │
 │  ├───┼───┼───┤  56px keys        │
 │  │ 4 │ 5 │ 6 │                   │
 │  ├───┼───┼───┤                   │
 │  │ 7 │ 8 │ 9 │                   │
 │  ├───┼───┼───┤                   │
 │  │ ⌫ │ 0 │ ✓ │                   │
 │  └───┴───┴───┘                   │
 │  [ Confirm with PIN ]            │
 └─────────────────────────────────┘
```

When an agent is helping, a teal line at the top: "Hand the phone to the farmer to type their PIN."

### 4.5 Passport dial

A 270° arc (not a full circle) in four band colours: Building (gold), Fair (teal), Good (paddy), Strong (indigo). The score sits in the middle in Bricolage 48px; below it, one sentence: "Fair: you can apply for small input loans." Factor bars underneath use the same colour as the band.

### 4.6 Status pills

Fully rounded, icon plus word, never colour alone:

| Status                    | Look                                             |
| ------------------------- | ------------------------------------------------ |
| Paid, Repaid, Allowed     | green fill 12%, Field Green text, `CheckCircle2` |
| Waiting, Applied, Pending | gold fill 20%, Ink text, `Clock`                 |
| Late, Failed, Disputed    | red fill 12%, Kola Red text, `AlertTriangle`     |
| Cancelled, Expired        | grey fill, Slate text, `MinusCircle`             |
| Voucher issued, Repaying  | indigo fill 10%, Indigo text, `CircleDot`        |

### 4.7 SMS bubble

How an SMS is shown on screen (demo phone panel, farmer message history): a chat bubble on a phone-shaped panel with the sender "AgriLink" and the time. Codes inside the message are set in Atkinson Mono and bold.

### 4.8 Other shared components

| Component      | Notes                                                                                                                                                  |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Stat strip     | One row of 3–5 numbers separated by thin rules, not separate cards; used at the top of dashboards                                                      |
| Data table     | Sticky header, tabular numbers right-aligned, row hover Mist, status pill column, row click opens detail; on mobile turns into a list of two-line rows |
| Filter bar     | Search plus up to 3 dropdowns plus "Clear"; filters show as removable chips                                                                            |
| Stepper        | For multi-step flows (register farmer, redeem voucher); steps are numbered because they are a sequence                                                 |
| Empty state    | Two-colour illustration, one sentence, one button                                                                                                      |
| Offline banner | Thin gold bar under the top bar: "Offline: 3 records will sync when you're back online"                                                                |

---

## 5. Layout system

### 5.1 Farmer, co-op staff and dealer (mobile first)

```
 ┌──────────────────────────────┐
 │ ☰  AgriLink        EN/KRI  🔔 │  top bar, white, 56px
 ├──────────────────────────────┤
 │                              │
 │   page content, one column   │  16px padding
 │   one primary action         │
 │                              │
 ├──────────────────────────────┤
 │ 🏠    💵     🐷    🤝    👤  │  bottom tab bar, 64px
 │ Home Money Savings Loans  Me │  (farmer only, max 5 tabs)
 └──────────────────────────────┘
```

- The primary action sits at the bottom of the screen, full width, within thumb reach.
- On tablet and desktop, the same content is centred in a 560px column with the indigo sidebar on the left.

### 5.2 Lender and admin (desktop first)

```
 ┌────────────┬─────────────────────────────────────────────────┐
 │ AgriLink    │  Page title                    [Filters] [Action]│
 │ ────────── │  ─────────────────────────────────────────────── │
 │ Portfolio  │  stat strip:  1,240 │ Le 1.2m │ 4.1% │ 96%      │
 │ Applications│ ─────────────────────────────────────────────── │
 │ Loans      │  main: table or chart                     │ side │
 │ Farmers    │                                           │ panel│
 │ Products   │                                           │      │
 │ Savings    │                                           │      │
 │            │                                           │      │
 │ ────────── │                                           │      │
 │ Rokel CB ▾ │                                           │      │
 └────────────┴─────────────────────────────────────────────────┘
  Indigo sidebar 248px; content max 1280px, left aligned
```

- Content is left aligned. Tables use the full width; detail opens in a right-side panel (480px) so the list stays visible.
- The workspace switcher (organisation and role) sits at the bottom of the sidebar.

### 5.3 Grid and breakpoints

| Breakpoint | Width    | Layout                                                |
| ---------- | -------- | ----------------------------------------------------- |
| `sm`       | < 640    | One column, bottom tabs, sheets                       |
| `md`       | 640–1023 | One column centred, sidebar collapses to icons        |
| `lg`       | ≥ 1024   | Sidebar 248px + content; 12-column grid, 24px gutters |
| `xl`       | ≥ 1440   | Content capped at 1280px                              |

---

## 6. Screens: public site

### 6.1 Landing page `/`

The hero is the Split Ribbon itself, playing the split moment on a real example sale, because that is the idea judges need to understand.

```
 ┌───────────────────────────────────────────────────────────────┐
 │ AgriLink Salone                         [For co-ops] [Sign in] │
 ├───────────────────────────────────────────────────────────────┤
 │                                                               │
 │  One harvest sale.                    ┌─────────────────────┐ │
 │  Paid, saved and                      │ Aminata sold 1,000kg│ │
 │  building credit.                     │ of rice: Le 4,000   │ │
 │                                       │ ▓▓▓▓░░░▒▒▒▒▒▒▒▒▒▒▒ │ │
 │  AgriLink splits every harvest         │ Saved Le 600        │ │
 │  payment on the mobile money          │ Dues  Le 80         │ │
 │  farmers already use.                 │ To Aminata Le 3,320 │ │
 │                                       └─────────────────────┘ │
 │  [ See the demo ]  [ For lenders ]     (gara motif behind)    │
 ├───────────────────────────────────────────────────────────────┤
 │  How it works (a real sequence, so numbered)                  │
 │  1 Co-op buys harvest → 2 Smart Split pays and saves →        │
 │  3 Passport score grows → 4 Input loan as a voucher →         │
 │  5 Next sale repays                                           │
 ├───────────────────────────────────────────────────────────────┤
 │  For farmers │ For co-ops │ For lenders │ For agro-dealers    │
 │  (one sentence each + icon, not cards with shadows)           │
 ├───────────────────────────────────────────────────────────────┤
 │  Works with Orange Money · Afrimoney · QMoney                 │
 │  AgriLink never holds your money.                              │
 └───────────────────────────────────────────────────────────────┘
```

- Hero background: Mist with a large gara motif in indigo at 6% on the right.
- Headline in Bricolage 48px Ink; the whole headline is one weight and colour.
- Mobile: headline first, ribbon card under it, buttons full width.

### 6.2 Sign in `/login`

```
 desktop                                       mobile
 ┌──────────────────────┬──────────────────┐   ┌──────────────────┐
 │  Indigo panel with   │  Sign in         │   │ AgriLink          │
 │  gara motif and a    │                  │   │ Sign in          │
 │  static Split Ribbon │  Phone number    │   │ Phone number     │
 │                      │  [ 076 000 000 ] │   │ [ 076 000 000 ]  │
 │  "Your harvest money │  [ Send code ]   │   │ [ Send code ]    │
 │   working for you."  │                  │   │                  │
 │                      │  Demo: sign in as│   │ Demo: sign in as │
 │                      │  ◉ Co-op staff   │   │ ◉ Co-op staff    │
 │                      │  ◉ Co-op manager │   │ …                │
 │                      │  ◉ Aminata       │   │ [ Reset demo ]   │
 │                      │  ◉ Rokel CB      │   └──────────────────┘
 │                      │  ◉ Makeni Agro   │
 │                      │  [ Reset demo ]  │
 └──────────────────────┴──────────────────┘
```

- Code step: six large boxes (56px), auto-advance, "Resend in 0:45".
- Language switch (English / Krio) top right on every public page.

---

## 7. Screens: farmer app

### 7.1 Home

```
 ┌──────────────────────────────┐
 │ Good morning, Aminata   🔔 2 │
 │                              │
 │ ╭──────────────────────────╮ │
 │ │ Last payment             │ │  money card, 20px radius,
 │ │ Le 2,385                 │ │  gara motif
 │ │ Rice, 1,000 kg · Bombali │ │
 │ │ ▓▓▓▓░░░▒▒▒▒▒▒▒▒▒▒▒▒▒▒   │ │  Split Ribbon (sm)
 │ │ Loan 1,100 · Saved 435   │ │
 │ │ Dues 80                  │ │
 │ ╰──────────────────────────╯ │
 │                              │
 │ Saved for planting  Le 1,035 │  row → Savings
 │ Unlocks 1 Apr · 133 days     │
 │ ──────────────────────────── │
 │ Your passport   53 · Fair    │  row → Passport
 │ ──────────────────────────── │
 │ Input loan      Le 0 owed    │  row → Loans
 │ Voucher: Le 300 left         │
 │                              │
 │ [ Confirm a sale (1 new) ]   │  only if a sale needs a reply
 ├──────────────────────────────┤
 │ Home Money Savings Loans  Me │
 └──────────────────────────────┘
```

### 7.2 Savings

- Top: Harvest Lock money card in gold edge: balance (money-xl), "Unlocks 1 April for planting", a thin progress line from the last release to the next.
- "Saving 15% of each sale" with a slider sheet to change it (PIN), and "Pause saving".
- Emergency withdrawal is a quiet text button at the bottom, never a big button; its sheet shows the fee first.
- History: list of rows with `+ Le 435 Saved from sale` in green and `− Le 200 Emergency withdrawal` in Ink.
- Groups: one row per VSLA/Osusu group with "My total" and the next meeting.

### 7.3 Passport

```
 ┌──────────────────────────────┐
 │ My passport                  │
 │        ╭─────────╮           │
 │      ╱    53     ╲           │  270° dial, teal (Fair)
 │     │    Fair     │          │
 │      ╲           ╱           │
 │ You can apply for small      │
 │ input loans.                 │
 │                              │
 │ Add points                   │  tips first: action before analysis
 │ ⊕ Keep 3 records this season │  +5
 │ ⊕ Sell through your co-op    │  +up to 5
 │                              │
 │ What makes your score        │  factor bars
 │ Sales          15/20 ▓▓▓▓▓░  │
 │ Savings         6/15 ▓▓░░░░  │
 │ …                            │
 │                              │
 │ Who can see it               │
 │ Rokel Community Bank  [Stop] │
 │ Who looked                   │
 │ Rokel CB · yesterday 14:10   │
 │                              │
 │ Your gender, age and where   │
 │ you live are never used.     │
 └──────────────────────────────┘
```

Pending consent requests appear at the very top as a gold-edged card with "Allow" and "Decline" (both need the PIN).

### 7.4 Loans

States in order of the farmer's journey:

1. **Offer or eligible:** product card with "You can borrow up to Le 1,000", an amount field with + and − steppers, and "Read the terms".
2. **Terms sheet:** the plain-language terms as a short checklist (amount, fee, total, how repayment works, due date, what happens if late, 24-hour cancel). The "Confirm with PIN" button only appears after scrolling to the end.
3. **Voucher issued:** the voucher ticket (4.3) at the top, then "Where to use it" with dealer names and phone numbers.
4. **Repaying:** progress bar of repaid vs owed in indigo; each repayment row shows which sale it came from.
5. **Repaid:** a single gold confetti-free celebration: "Loan repaid. Your new limit is Le 1,500."

---

## 8. Screens: co-op, lender, agro-dealer

### 8.1 Co-op staff: record a purchase (weighing point)

```
 ┌──────────────────────────────┐
 │ Record purchase              │
 │ Find farmer                  │
 │ [ 🔍 name, ID or phone     ] │
 │ ┌──────────────────────────┐ │
 │ │ Aminata Sesay  AP-BOM-01 │ │  selected farmer chip
 │ │ Orange Money ✓           │ │  wallet verified
 │ └──────────────────────────┘ │
 │ Crop      [ Rice        ▾ ]  │
 │ Weight    [   1,000  ] kg    │  numeric keypad, 56px
 │ Bags      [     20   ]       │
 │ Price     Le 4.00 / kg       │  from co-op price list
 │ ──────────────────────────── │
 │ Farmer gets   Le 3,320       │  live Split Ribbon preview
 │ (saved 600 · dues 80)        │
 │ ▓▓▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒   │
 │                              │
 │ [ Record purchase ]          │  full width, bottom
 └──────────────────────────────┘
```

After recording: a full-screen green check for one second ("Recorded: sent to the manager"), then the empty form again for the next farmer.

### 8.2 Co-op manager: approve

- Dashboard stat strip: "Waiting for approval Le 48,200 · 23 farmers", "Paid this week", "Disputes".
- Batch page: table of purchases with a Split Ribbon per row (sm), held rows highlighted in gold with the reason ("No wallet", "Disputed"). One primary button: "Approve and pay 21 farmers".
- After approving, every row's ribbon plays the split moment in sequence; then the button area shows "21 paid · 2 held".

### 8.3 Lender

- **Portfolio:** stat strip (loans, disbursed, outstanding, repayment rate, PAR30/PAR90), then a stacked bar chart of loans by status per month, then tables by district, gender, crop. PAR above 5% turns its number Kola Red with an icon.
- **Applications:** table with farmer, band pill, amount, affordability (a mini bar showing requested vs limit), "Approve" and "Decline". Clicking a row opens the side panel with the passport summary, the terms the farmer accepted and the timeline.
- **Passport view:** watermark band across the top in indigo 8%: "Viewed by Mabinty Kargbo, Rokel Community Bank, 19 Nov 10:12. The farmer can see this."

### 8.4 Agro-dealer: redeem a voucher

A three-step stepper; each step locks when complete:

```
 ① Code          ② Items             ③ Farmer's code
 ┌─────────────┐ ┌────────────────┐ ┌──────────────────┐
 │ K7P4-R2QX   │ │ NPK 50kg  − 2 +│ │ □ □ □ □ □ □      │
 │ [Check]     │ │ Seed 10kg − 0 +│ │ [Confirm]        │
 │ Aminata S.  │ │ Total Le 700   │ │                  │
 │ Le 1,000    │ │ Left   Le 300  │ │                  │
 └─────────────┘ └────────────────┘ └──────────────────┘
                         ↓
          Big green check: "Redeemed Le 700. Ref RDM-000012.
          The bank pays you today."   [ Next customer ]
```

If the total goes over the voucher, the total turns Kola Red and the button is disabled with the reason underneath.

---

## 9. Screens: admin console

The admin console is for the AgriLink operations team. It follows the desktop layout (5.2) with a darker sidebar variant (indigo 900 `#141C4E`) so admins always know they are in the platform console, not a partner portal.

### 9.1 Overview `/admin`

```
 ┌─────────────────────────────────────────────────────────────────┐
 │ Platform overview                              Today ▾  [Export]│
 │ 1,860 farmers │ 6 co-ops │ Le 2.4m paid │ 98.6% success │ 3 stuck│
 │─────────────────────────────────────────────────────────────────│
 │ Payment pipeline (today)                                         │
 │  Pending 12 ──► Processing 4 ──► Paid 1,204                      │
 │                        └──────► Failed 3  [Review]               │
 │─────────────────────────────────────────────────────────────────│
 │ Money moved by type (stacked bars, ribbon colours, 14 days)      │
 │ ▇▇▇▅▅▇▇▇▇▇▅▇▇▇                                                   │
 │─────────────────────────────────┬───────────────────────────────│
 │ Needs attention                 │ Recent activity (audit)        │
 │ ⚠ 3 payment instructions failed │ 10:41 Isatu approved BAT-0042  │
 │ ⚠ 2 dealers awaiting verification│ 10:38 Rokel CB viewed passport│
 │ ⚠ Ledger check: all balanced ✓  │ …                              │
 └─────────────────────────────────┴───────────────────────────────┘
```

- The pipeline is drawn as connected boxes with counts, not as cards: it shows flow.
- "Needs attention" items each link to the exact filtered list.

### 9.2 Users and organisations

- Users: table (name, phone, roles as pills, organisation, last sign-in, status). Row actions in a menu: suspend, reset PIN lock, view audit. Suspending asks for a reason.
- Organisations: grouped by type with type icons; each opens a page with members, settings and, for lenders, the institution settings.

### 9.3 Payments, instructions and reconciliation

- Payments list: ref, payer, farmer, gross, a Split Ribbon (sm) per row, status.
- Payment detail: the large ribbon, then each split with its provider instruction, attempts timeline (each attempt a dot: grey pending, green success, red failed), and the ledger journal lines in a two-column debit/credit table.
- Instructions: filter "Failed" and "Stuck over 1 hour" by default; actions "Retry" and "Mark failed" with confirmation.
- Reconciliation: upload a provider statement; result shows three columns "Matched", "Only in AgriLink", "Only in statement" with counts and amounts.

### 9.4 Audit log

Dense, read-only table: time, who (name and role), action in plain words ("Approved batch BAT-0042"), entity link, IP. A filter bar for user, action type and date range. The hash-chain check shows as a single line at the top: "Audit chain verified to 19 Nov 10:41 ✓".

### 9.5 Agro-dealer verification

Cards are fine here because each dealer is a distinct thing to review: shop name, district, payout number (with provider), catalogue size, and "Verify" or "Remove verification". A changed payout number shows a gold "Payout number changed: check before verifying" banner.

---

## 10. Words, states and accessibility

### 10.1 Voice

- Plain verbs, sentence case, the farmer's words: "Saved for planting", not "Savings balance (locked)".
- Money is always written `Le 1,250` (no decimals unless there are cents).
- A button names what happens and the result keeps the same word: "Approve and pay" → "Paid".
- Errors say what happened and what to do: "Wrong PIN. 2 tries left." "This voucher can't be used here. Ask the farmer which shop it is for."
- Krio is a full language option, not a translation afterthought; designs must survive 30% longer text.

### 10.2 States every screen designs for

| State   | Treatment                                                                                                                |
| ------- | ------------------------------------------------------------------------------------------------------------------------ |
| Loading | Skeleton rows the shape of the content; money figures never show a spinner in place of the number for more than 1 second |
| Empty   | Illustration + one sentence + one action ("No sales yet. Your co-op records them when you sell.")                        |
| Offline | Gold banner; forms save locally and show "Will send when online"                                                         |
| Error   | Inline under the field, or a red banner with the fix; never a dead end                                                   |
| Success | Green check and the result in words; for money, the Split Ribbon                                                         |

### 10.3 Accessibility and low-end devices

- WCAG 2.2 AA contrast (checked above); never colour alone: pills have icons and words.
- Touch targets at least 48px; visible focus ring (3px Lagoon Teal) on every interactive element.
- Works at 200% text size; no text in images.
- Screen-reader labels for the ribbon, dial and keypad.
- Performance budget for the farmer app: first view under 150kb of JavaScript, fonts subset to Latin and preloaded, images lazy.
- Respect `prefers-reduced-motion` and `prefers-color-scheme` (office portals only).

---

## 11. Implementation plan

MVP screens first (see `docs/mvp/scope.md`), then the rest.

| Step | Work                                                                                                                                  | Files                                             |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| 1    | Tokens: palette, split colours, radius levels, indigo shadow; dark theme                                                              | `packages/ui/src/styles/globals.css`              |
| 2    | Fonts with `next/font/google`: Bricolage Grotesque, Atkinson Hyperlegible Next, Atkinson Hyperlegible Mono; `tabular-nums` utility    | `apps/web/src/app/layout.tsx`                     |
| 3    | `SplitRibbon` with the split-moment animation and accessible list                                                                     | `packages/ui/src/components/split-ribbon.tsx`     |
| 4    | `MoneyFigure`, `VoucherTicket`, `PassportDial` (replace `ScoreDial`), `StatusPill` (replace tone badges), `StatStrip`, gara motif SVG | `packages/ui/src/components/`                     |
| 5    | PIN sheet with keypad (replace the text PIN field in `PinConfirm`)                                                                    | `apps/web/src/components/finance/pin-confirm.tsx` |
| 6    | Farmer bottom tab bar and home redesign                                                                                               | `components/shell`, `app/farmer/page.tsx`         |
| 7    | Landing page with the hero ribbon; login side panel                                                                                   | `app/page.tsx`, `app/(public)/login`              |
| 8    | Co-op record and approve screens with live ribbon preview                                                                             | `components/trade`                                |
| 9    | Dealer stepper polish; lender side panel                                                                                              | `components/dealer`, `app/lender`                 |
| 10   | Admin overview with pipeline, payments detail with attempts timeline                                                                  | `app/admin`                                       |
| 11   | Visual check of every MVP screen on a 360px phone and a projector (1280×720)                                                          | e2e screenshots                                   |

Steps 1–7 are what the Demo Day audience sees and should come first.
