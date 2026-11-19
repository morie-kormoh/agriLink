# Module 01 — Identity, Authentication & Access Control

## 1. Purpose

Let every actor (farmer, agent, cooperative admin, buyer, lender, agro-dealer, programme officer, admin) sign in securely with a **phone number**, and make sure each one can only see and do what their role and organisation allow.

## 2. Scope

**In:** phone + OTP login (web), PIN for USSD and transaction confirmation, sessions, roles, organisations and memberships, permission checks, invitations, account lockout, KYC tier field.
**Out:** Farmer profile details (02), audit UI (13).

## 3. Dependencies

0.

## 4. Data model (`prisma/schema/identity.prisma`)

```prisma
enum Role {
  FARMER
  AGENT
  COOP_ADMIN
  COOP_STAFF
  BUYER_ADMIN
  BUYER_STAFF
  LENDER_ADMIN
  LENDER_OFFICER
  AGRO_DEALER
  PROGRAMME_OFFICER
  SUPER_ADMIN
}

enum OrgType { COOPERATIVE BUYER LENDER AGRO_DEALER PROGRAMME PLATFORM }
enum UserStatus { INVITED ACTIVE SUSPENDED LOCKED }

model User {
  id             String     @id @default(cuid())
  phone          String     @unique            // E.164 +232...
  phoneVerified  Boolean    @default(false)
  name           String?
  email          String?    @unique
  locale         String     @default("en")
  status         UserStatus @default(ACTIVE)
  pinHash        String?
  pinFailedCount Int        @default(0)
  pinLockedUntil DateTime?
  kycTier        Int        @default(1)
  memberships    Membership[]
  sessions       Session[]
  createdAt      DateTime   @default(now())
  updatedAt      DateTime   @updatedAt
}

model Organization {
  id          String     @id @default(cuid())
  type        OrgType
  name        String
  districtId  String?
  phone       String?
  active      Boolean    @default(true)
  memberships Membership[]
  createdAt   DateTime   @default(now())
}

model Membership {
  id     String       @id @default(cuid())
  userId String
  orgId  String
  role   Role
  user   User         @relation(fields: [userId], references: [id])
  org    Organization @relation(fields: [orgId], references: [id])
  @@unique([userId, orgId, role])
}

model Session {
  id        String   @id @default(cuid())
  userId    String
  user      User     @relation(fields: [userId], references: [id])
  token     String   @unique
  expiresAt DateTime
  ip        String?
  userAgent String?
}

model OtpCode {
  id        String   @id @default(cuid())
  phone     String
  codeHash  String
  purpose   String   // LOGIN, VERIFY_PHONE, RESET_PIN
  attempts  Int      @default(0)
  expiresAt DateTime
  usedAt    DateTime?
  @@index([phone, purpose])
}

model Invitation {
  id         String   @id @default(cuid())
  phone      String
  orgId      String
  role       Role
  token      String   @unique
  invitedBy  String
  acceptedAt DateTime?
  expiresAt  DateTime
}
```

> Auth library: **Better Auth** with its phone-number/OTP plugin is recommended; Auth.js with a custom credentials provider also works. Whichever is chosen, keep the tables above (map the library's adapter to them) so the rest of the system doesn't depend on the library.

## 5. Business rules

- Phone numbers normalised to `+232XXXXXXXX` before any lookup.
- OTP: 6 digits, valid **5 minutes**, max **5 attempts**, max **3 sends per 15 minutes** per phone. Store only a hash.
- PIN: 4–5 digits, hashed with **argon2id**. **3 wrong attempts → locked 30 minutes**; reset needs OTP plus agent or co-op confirmation.
- PIN required to: accept loans, change savings rules, give/withdraw consent, withdraw unlocked savings.
- A user can hold several memberships (e.g. a farmer who is also a co-op staff member). The active org/role is chosen after login and stored in the session.
- Farmers created by agents get status `ACTIVE` but must set a PIN on first USSD use.
- Session lifetime: 7 days for portals, 12 hours for SUPER_ADMIN; inactivity timeout of 30 minutes on lender/admin portals.

## 6. Permissions model

`packages/validation/permissions.ts` (shared by web and USSD):

```ts
type Action =
  | "farmer.create"
  | "farmer.read"
  | "farmer.update"
  | "purchase.create"
  | "payment.approve"
  | "savings.read"
  | "savings.configure"
  | "passport.read"
  | "consent.manage"
  | "loanProduct.manage"
  | "loan.approve"
  | "voucher.redeem"
  | "analytics.read"
  | "admin.all";

const matrix: Record<Role, Action[]> = {/* role → actions */};

export function can(
  actor: Actor,
  action: Action,
  resource?: { orgId?: string; farmerId?: string },
): boolean;
```

Scope rules:

- AGENT: farmers they registered or farmers in co-ops they're assigned to.
- COOP_*: their co-op's members only.
- BUYER_*: their own purchases; farmers only via purchases.
- LENDER_*: only farmers with an **active consent** to that lender (module 07).
- PROGRAMME_OFFICER: aggregated data only; no individual records unless the programme has consent.
- FARMER: own records only.

## 7. API / server actions

| Action                              | Route / function                           | Notes                       |
| ----------------------------------- | ------------------------------------------ | --------------------------- |
| Request OTP                         | `POST /api/auth/otp/request`               | rate-limited (Redis)        |
| Verify OTP                          | `POST /api/auth/otp/verify`                | creates session             |
| Select active org/role              | server action `selectContext(orgId, role)` |                             |
| Set / change PIN                    | server action `setPin(pin, otp?)`          |                             |
| Verify PIN (internal, used by USSD) | `POST /api/internal/auth/pin/verify`       | `INTERNAL_API_TOKEN` header |
| Invite user to org                  | server action `inviteMember(phone, role)`  | sends SMS link              |
| Accept invite                       | `/invite/[token]`                          |                             |
| Logout                              | server action `logout()`                   |                             |

Helpers: `getActor()` (server-only) returns `{ userId, role, orgId, scope }` or throws; `requireRole(...roles)`.

## 8. UI screens & routes

- `/(public)/login`: phone input → OTP input (6 boxes, auto-advance, resend countdown).
- `/(public)/select-context`: cards for each membership (org name, role, icon).
- `/(public)/invite/[token]`: accept invitation.
- `/settings/security`: change PIN, active sessions, sign out everywhere.
- `/(admin)/users`: search, suspend, unlock PIN, change role.
- Middleware: redirects unauthenticated users; checks that the route group matches the active role.

## 9. USSD / SMS touchpoints

- First dial: "Welcome to AgriLink. Create a 4-digit PIN".
- PIN prompt before sensitive actions.
- SMS: OTP codes, invitation links, "Your PIN was changed" security alert.

## 10. Step-by-step implementation

1. **Schema:** add `identity.prisma`; migrate.
2. **Phone utils:** reuse `phoneSL` from 00; add tests for all operator prefixes.
3. **OTP service** (`server/auth/otp.ts`): `requestOtp(phone, purpose)` → generate, hash, store, enqueue SMS (`sms` queue; in dev the console provider prints the code). `verifyOtp(phone, code, purpose)` → attempts/expiry checks.
4. **Rate limiting:** Redis sliding window (`ratelimit:otp:{phone}`, `ratelimit:otp:ip:{ip}`).
5. **Sessions:** integrate Better Auth (or custom) with the `Session` table; httpOnly, secure, sameSite=lax cookie.
6. **Login UI:** shadcn `Form` + Zod; OTP input component in `packages/ui`.
7. **Context selection:** list memberships; store `activeOrgId`/`activeRole` in session.
8. **Permissions:** implement `can()` and the matrix; write a table-driven test covering every role × action.
9. **`getActor()` + middleware:** route-group guards (`(lender)` → LENDER_*).
10. **PIN service:** `setPin`, `verifyPin` with lockout; internal endpoint for USSD.
11. **Invitations:** create, SMS link, accept flow (creates user if missing + membership).
12. **Admin user management** page using `DataTable`.
13. **Seed:** one SUPER_ADMIN, one org of each type with an admin user, sample agent.
14. **Audit hooks:** log `auth.login`, `auth.pin_changed`, `auth.pin_locked`, `member.invited`, `member.role_changed` (module 13).
    ✅ _Checkpoint:_ each seeded role logs in and only sees its own portal.

## 11. Acceptance criteria

- Login with phone + OTP works on mobile.
- After 5 wrong OTPs or 3 wrong PINs, the user is blocked as specified.
- Lender officer cannot open a farmer page without consent (403).
- All auth events appear in the audit log.

## 12. Tests

- Unit: OTP generation/expiry/attempts; PIN hashing and lockout; `can()` matrix.
- Integration: request → verify → session; invitation acceptance.
- E2E (Playwright): co-op admin login → select context → lands on co-op dashboard.
