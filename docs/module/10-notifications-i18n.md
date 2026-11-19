# Module 10 — Notifications & Internationalisation

## 1. Purpose

Deliver every receipt, alert and reminder reliably (SMS first, in-app second) in the farmer's language, and keep all user-facing text translatable across web, USSD and SMS.

## 2. Scope

**In:** notification service, template registry, SMS provider adapters (console, aggregator), delivery reports, retries, quiet hours, rate limits, in-app notification centre, i18n for web (next-intl) and non-React contexts, locale preferences, translation workflow.
**Out:** USSD menu logic (09).

## 3. Dependencies

00, 01.

## 4. Data model (`prisma/schema/notify.prisma`)

```prisma
enum Channel { SMS IN_APP EMAIL }
enum NotificationStatus { QUEUED SENT DELIVERED FAILED SUPPRESSED }

model NotificationTemplate {
  id        String  @id @default(cuid())
  key       String                      // payment.receipt, savings.release_soon
  channel   Channel
  locale    String                      // en, kri, men, tem
  body      String                      // ICU message format
  maxLength Int?                        // SMS 160 / 306 (2 parts)
  active    Boolean @default(true)
  @@unique([key, channel, locale])
}

model Notification {
  id          String             @id @default(cuid())
  userId      String?
  phone       String?
  channel     Channel
  templateKey String
  locale      String
  vars        Json
  renderedBody String
  status      NotificationStatus @default(QUEUED)
  provider    String?
  providerRef String?
  attempts    Int                @default(0)
  error       String?
  dedupeKey   String?            @unique   // e.g. payment.receipt:PAY-123
  sendAfter   DateTime?
  readAt      DateTime?                    // in-app
  createdAt   DateTime           @default(now())
}
```

## 5. Business rules

- **Transactional SMS** (receipts, OTP, consent requests, voucher codes) are sent immediately, any hour.
- **Reminders and tips** respect quiet hours **20:00–07:00** (Africa/Freetown) and max **1 reminder per day** per farmer.
- `dedupeKey` prevents duplicate receipts when events are replayed.
- SMS bodies target **1 segment (160 GSM-7 chars)**; max 2 segments. Avoid characters outside GSM-7 (smart quotes, emoji) to keep cost low — a sanitiser enforces this.
- Every SMS ends with a short reference (e.g. `Ref PAY-8F2K`) for support.
- Locale resolution: user.locale → co-op default → `en`.
- OTP templates never stored with the code in `renderedBody` in production (masked after send).

## 6. Provider adapter

```ts
interface SmsProvider {
  send(to: string, body: string, opts?: { senderId?: string }): Promise<{ providerRef: string }>;
  parseDeliveryReport(body: unknown): {
    providerRef: string;
    status: "DELIVERED" | "FAILED";
    error?: string;
  };
}
```

- `ConsoleProvider` (dev/demo): writes to `Notification` and shows in the simulator SMS inbox.
- Aggregator adapter(s) selected by `SMS_PROVIDER`; Sender ID "AgriLink" (registration with operators required).
- Optional per-operator routing (Orange / Africell / QCell) if direct connections are obtained.

## 7. i18n

- **Web:** `next-intl` with messages in `packages/i18n/messages/{en,kri,men,tem}.json`; locale stored in user profile + cookie; language switcher in top bar.
- **USSD/SMS:** `t(locale, key, vars)` using the same JSON with ICU MessageFormat (`intl-messageformat`).
- Namespaces: `common`, `auth`, `farmer`, `coop`, `payments`, `savings`, `passport`, `loans`, `ussd`, `sms`.
- Number/currency: `Le 4,000` (custom formatter, no decimals for whole Leones).
- Dates: `1 Apr` short form for SMS/USSD.
- Translation workflow: English is source; CI check fails if a key is missing in `kri`; other languages fall back to English until reviewed.

## 8. API / server actions

| Function                                | Notes                                                        |
| --------------------------------------- | ------------------------------------------------------------ |
| `notify({ userId                        | phone, templateKey, vars, channel?, dedupeKey?, priority })` | used by all modules; enqueues |
| Worker `sms:send`                       | render → sanitise → length check → provider → status         |
| `POST /api/webhooks/sms/delivery`       | delivery reports                                             |
| `POST /api/webhooks/sms/inbound`        | forwarded to module 09 handlers                              |
| `listMyNotifications()`, `markRead(id)` | in-app centre                                                |

## 9. UI screens & routes

- Top-bar bell with unread count; `/notifications` page.
- `/(admin)/notifications`: search by phone, status, resend.
- `/(admin)/templates`: view/edit templates per locale with live preview and character counter.

## 10. Step-by-step implementation

1. Add `notify.prisma`; migrate.
2. `packages/i18n`: message files, `t()` helper, currency/date formatters, GSM-7 sanitiser + segment counter.
3. Seed core templates (en + kri): OTP, welcome, purchase receipt, payment receipt with splits, savings credit, release soon, consent request, voucher issued, loan repaid, loan reminder, season summary.
4. `notify()` service with dedupe and quiet-hours scheduling (`sendAfter`).
5. Worker `sms:send` with retries (3 attempts, backoff) and console provider.
6. Delivery report webhook.
7. In-app notification centre UI.
8. next-intl setup in `apps/web` (middleware, provider, language switcher).
9. Admin templates & notifications pages.
10. CI check for missing translation keys and SMS length per template/locale (rendered with sample vars).
11. Aggregator adapter when account is ready.
    ✅ _Checkpoint:_ approving a purchase produces one (not two) SMS receipt in the farmer's language, visible in the simulator inbox.

## 11. Acceptance criteria

- No duplicate transactional SMS on event replay.
- Reminders never sent during quiet hours.
- All SMS templates fit in ≤ 2 segments in every locale.
- Users can switch language on web and USSD.

## 12. Tests

- Unit: renderer, sanitiser, segment counter, quiet-hours scheduler.
- Integration: dedupe; retry on provider failure; delivery report updates status.
