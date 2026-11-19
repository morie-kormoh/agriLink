import "server-only";
import { type Db, Prisma, type Tx, prisma } from "@agrilink/db";
import { maskPhone } from "@agrilink/validation";
import type { Actor } from "@agrilink/validation/permissions";
import { sha256 } from "./crypto";

export interface AuditEntry {
  actor?: Pick<Actor, "userId" | "role" | "orgId"> | null;
  action: string;
  entity: string;
  entityId: string;
  before?: unknown;
  after?: unknown;
  ip?: string | null;
  userAgent?: string | null;
  requestId?: string | null;
}

const SECRET_KEYS = new Set([
  "pin",
  "pinHash",
  "otp",
  "code",
  "codeHash",
  "token",
  "tokenHash",
  "password",
]);
const PARTIAL_KEYS = new Set(["nin"]);
const PHONE_KEYS = new Set(["phone", "msisdn", "walletMsisdn"]);

/** Recursively mask sensitive values before they reach the audit log. */
export function maskForAudit(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (value instanceof Date) return value.toISOString();
  if (Prisma.Decimal.isDecimal(value)) return value.toString();
  if (Array.isArray(value)) return value.map(maskForAudit);
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (SECRET_KEYS.has(k)) out[k] = v == null ? v : "***";
      else if (PARTIAL_KEYS.has(k) && typeof v === "string") out[k] = `***${v.slice(-3)}`;
      else if (PHONE_KEYS.has(k) && typeof v === "string") out[k] = maskPhone(v);
      else out[k] = maskForAudit(v);
    }
    return out;
  }
  return value;
}

/** JSON with recursively sorted keys — Postgres JSONB does not preserve key order. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value ?? null);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const obj = value as Record<string, unknown>;
  return `{${Object.keys(obj)
    .filter((k) => obj[k] !== undefined)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`)
    .join(",")}}`;
}

async function insert(tx: Tx, entry: AuditEntry) {
  // Serialise writers so the hash chain stays linear.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('agripay_audit_chain'))`;
  const last = await tx.auditLog.findFirst({
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: { hash: true },
  });
  const before = maskForAudit(entry.before);
  const after = maskForAudit(entry.after);
  const createdAt = new Date();
  const payload = canonicalJson({
    actorUserId: entry.actor?.userId ?? null,
    action: entry.action,
    entity: entry.entity,
    entityId: entry.entityId,
    before: before ?? null,
    after: after ?? null,
    createdAt: createdAt.toISOString(),
  });
  const prevHash = last?.hash ?? null;
  const hash = sha256(`${prevHash ?? "GENESIS"}|${payload}`);
  await tx.auditLog.create({
    data: {
      actorUserId: entry.actor?.userId ?? null,
      actorRole: entry.actor?.role ?? null,
      actorOrgId: entry.actor?.orgId ?? null,
      action: entry.action,
      entity: entry.entity,
      entityId: entry.entityId,
      before: (before ?? undefined) as Prisma.InputJsonValue | undefined,
      after: (after ?? undefined) as Prisma.InputJsonValue | undefined,
      ip: entry.ip ?? null,
      userAgent: entry.userAgent ?? null,
      requestId: entry.requestId ?? null,
      prevHash,
      hash,
      createdAt,
    },
  });
}

/**
 * Append an audit entry. Pass the transaction client so the audit row commits
 * (or rolls back) together with the change it describes.
 */
export async function audit(db: Db, entry: AuditEntry): Promise<void> {
  if ("$transaction" in db && typeof db.$transaction === "function") {
    await (db as typeof prisma).$transaction((tx) => insert(tx, entry));
  } else {
    await insert(db as Tx, entry);
  }
}

/** Verify the hash chain (used by the nightly integrity job and tests). */
export async function verifyAuditChain(
  db: Db = prisma,
): Promise<{ ok: boolean; checked: number; brokenAt?: string }> {
  const rows = await db.auditLog.findMany({ orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
  let prev: string | null = null;
  for (const row of rows) {
    const payload = canonicalJson({
      actorUserId: row.actorUserId,
      action: row.action,
      entity: row.entity,
      entityId: row.entityId,
      before: row.before ?? null,
      after: row.after ?? null,
      createdAt: row.createdAt.toISOString(),
    });
    const expected = sha256(`${prev ?? "GENESIS"}|${payload}`);
    if (row.prevHash !== prev || row.hash !== expected)
      return { ok: false, checked: rows.length, brokenAt: row.id };
    prev = row.hash;
  }
  return { ok: true, checked: rows.length };
}
