# Module 13 — Admin, Audit & Compliance

## 1. Purpose

Give the AgriLink operations team control over the platform and give regulators, partners and farmers confidence: **immutable audit trail**, data-protection tooling, KYC review, support/complaints handling, configuration management, security and backups.

## 2. Scope

**In:** audit log (used by every module from Sprint 1), admin console, organisation onboarding/verification, KYC review queue, complaints & disputes desk, system configuration (thresholds, floors, fees), feature flags, data subject requests (access/correction/deletion where lawful), retention jobs, security controls, backups & DR, compliance reports for BSL sandbox/partners.
**Out:** Business features themselves.

## 3. Dependencies

00, 01 (core audit is built right after 01).

## 4. Data model (`prisma/schema/admin.prisma`)

```prisma
model AuditLog {
  id          String   @id @default(cuid())
  actorUserId String?
  actorRole   String?
  actorOrgId  String?
  action      String                 // "purchase.approved"
  entity      String                 // "Purchase"
  entityId    String
  before      Json?
  after       Json?
  ip          String?
  userAgent   String?
  requestId   String?
  prevHash    String?                // hash chain for tamper evidence
  hash        String
  createdAt   DateTime @default(now())
  @@index([entity, entityId])
  @@index([actorUserId])
  @@index([action, createdAt])
}

model SystemConfig {
  key        String   @id            // "payments.farmerFloorPct"
  value      Json
  description String
  updatedById String
  updatedAt  DateTime @updatedAt
}

model FeatureFlag {
  key      String  @id               // "ussd.selfRegistration"
  enabled  Boolean @default(false)
  rules    Json?                     // by district / org
}

model OrgVerification {
  id        String   @id @default(cuid())
  orgId     String
  documents Json                     // [{type, fileKey}]
  status    String                   // PENDING, VERIFIED, REJECTED
  reviewedById String?
  notes     String?
  createdAt DateTime @default(now())
}

model KycReview {
  id        String  @id @default(cuid())
  farmerId  String
  requestedTier Int
  evidence  Json
  status    String                   // PENDING, APPROVED, REJECTED
  reviewedById String?
  createdAt DateTime @default(now())
}

model SupportTicket {
  id          String   @id @default(cuid())
  ref         String   @unique        // TCK-...
  channel     String                  // USSD, SMS, AGENT, PHONE, WEB
  farmerId    String?
  orgId       String?
  category    String                  // PAYMENT, LOAN, SAVINGS, DATA, FRAUD, OTHER
  subject     String
  description String
  linkedEntity String?               // e.g. Payment:PAY-123
  status      String                  // OPEN, IN_PROGRESS, RESOLVED, ESCALATED, CLOSED
  assigneeId  String?
  slaDueAt    DateTime
  resolution  String?
  createdAt   DateTime @default(now())
}

model DataSubjectRequest {
  id        String  @id @default(cuid())
  farmerId  String
  type      String                    // ACCESS, CORRECTION, DELETION, RESTRICT
  status    String                    // RECEIVED, VERIFIED, COMPLETED, REJECTED
  notes     String?
  completedAt DateTime?
  createdAt DateTime @default(now())
}
```

## 5. Business rules

- **Audit everything that changes state**, inside the same DB transaction as the change. Audit rows are append-only (DB role without UPDATE/DELETE on `AuditLog`); hash chain detects tampering; nightly verification job.
- Sensitive fields (PIN, OTP, NIN, full wallet numbers) masked in `before/after`.
- **Config changes** (fees, floors, thresholds) require SUPER_ADMIN + second approver; take effect at a set time; audited.
- **Complaints SLA:** acknowledge within 24 h, resolve payment complaints within 72 h; escalation to partner (MMO/lender) tracked.
- **Data protection:** purpose limitation, consent records (07), data minimisation, retention (e.g. USSD logs 12 months, audit 7 years, inactive farmer PII reviewed after 3 years subject to financial record-keeping rules), encryption at rest (disk + field-level for NIN), TLS everywhere.
- **Deletion requests:** personal data anonymised where no legal/financial retention duty applies; financial transaction records retained as required.
- **Security baseline:** least-privilege RBAC, MFA (OTP) for all staff accounts, admin IP allow-list option, rate limiting, secrets in a vault/env manager, dependency scanning, quarterly access review.
- **Backups:** daily encrypted Postgres backups + point-in-time recovery; restore test monthly; RPO ≤ 24 h (≤ 1 h in pilot), RTO ≤ 8 h.

## 6. API / server actions & routes

| Function / route                                                                                         | Who                       |
| -------------------------------------------------------------------------------------------------------- | ------------------------- |
| `audit.log(tx, entry)`                                                                                   | all modules (library)     |
| `/(admin)/audit`: search by entity, actor, action, date; diff viewer                                     | SUPER_ADMIN, auditor role |
| `/(admin)/orgs`: onboarding, verification documents, activate/suspend                                    | SUPER_ADMIN               |
| `/(admin)/kyc`: farmer tier upgrade queue                                                                | SUPER_ADMIN, ops          |
| `/(admin)/support`: tickets, SLA timers, link to payment/loan                                            | ops                       |
| `/(admin)/config`: system config with maker–checker                                                      | SUPER_ADMIN               |
| `/(admin)/flags`: feature flags                                                                          | SUPER_ADMIN               |
| `/(admin)/privacy`: data subject requests, consent lookups, export farmer data (JSON/PDF)                | DPO / SUPER_ADMIN         |
| `/(admin)/compliance`: reports (transactions volume, complaints, incidents) for BSL sandbox and partners | SUPER_ADMIN               |
| USSD _Help → Report a problem_ → creates ticket                                                          | FARMER                    |

## 7. Step-by-step implementation

1. **(Sprint 1)** `AuditLog` schema + `audit.log()` helper with masking + hash chain; restrict DB permissions; add to module 01 actions.
2. Audit viewer UI with JSON diff.
3. `SystemConfig` + typed getter with cache (`getConfig("payments.farmerFloorPct")`); move hard-coded thresholds from 04/06/08 into config.
4. Maker–checker for config changes.
5. Feature flags (simple table + `isEnabled(key, ctx)`).
6. Org onboarding & verification (document upload to S3, review).
7. KYC review queue (tier upgrades from module 02).
8. Support desk: tickets from USSD/SMS/agents/web, SLA timers (worker), escalation, link to entities.
9. Data subject request workflow + farmer data export.
10. Retention jobs (USSD logs, notifications, temp files).
11. Security hardening checklist: headers (CSP, HSTS), rate limits, staff OTP MFA, dependency audit in CI, secret scanning.
12. Backups: scheduled `pg_dump`/managed PITR, encrypted storage, monthly restore drill script.
13. Compliance report generator (monthly).
14. Incident log & runbook (`docs/runbooks/`): payment outage, SMS outage, data breach response.
    ✅ _Checkpoint:_ every action in the demo flow appears in the audit viewer with actor, before/after and valid hash chain.

## 8. Acceptance criteria

- Audit rows cannot be updated or deleted by the application DB user; tamper check passes nightly.
- Config changes need two people and are audited.
- Complaints have SLA tracking and are linked to the related payment/loan.
- Farmer data export and deletion/anonymisation work end to end.
- Backup restore tested successfully.

## 9. Tests

- Unit: masking, hash chain, config typing.
- Integration: audit in same transaction (rollback removes both); DB permission test (UPDATE on AuditLog fails); SLA escalation job.
- Security: automated checks for auth on every admin route.
