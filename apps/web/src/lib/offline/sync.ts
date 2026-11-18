import type { RegisterFarmerInput } from "@agripay/validation";
import { type AgriPayOfflineDB, type PendingFarmer, offlineDb } from "./db";

export const BATCH_SIZE = 25;
/** Backoff after each failed attempt: 30s, 2m, 5m, 15m, 1h (then hourly). */
const BACKOFF_MS = [30_000, 120_000, 300_000, 900_000, 3_600_000];

export function backoffFor(attempts: number): number {
  return BACKOFF_MS[Math.min(attempts, BACKOFF_MS.length - 1)] ?? 3_600_000;
}

type ServerResult =
  | {
      clientRef: string;
      status: "created" | "exists";
      farmerId: string;
      agripayId: string;
      duplicateOf: string | null;
      warnings: string[];
    }
  | {
      clientRef: string | null;
      status: "invalid" | "error";
      error: string;
      fieldErrors?: Record<string, string[]>;
      retryable: boolean;
    };

/** Queue a registration on this device. Returns the client reference. */
export async function enqueueFarmer(
  payload: RegisterFarmerInput,
  ownerUserId: string,
  photo?: Blob | null,
  db: AgriPayOfflineDB = offlineDb(),
): Promise<string> {
  const clientRef = (payload.clientRef as string | undefined) ?? crypto.randomUUID();
  const record: PendingFarmer = {
    clientRef,
    payload: { ...payload, clientRef, capturedAt: new Date().toISOString() as unknown as Date },
    fullName: String(payload.fullName ?? ""),
    phone: String(payload.phone ?? ""),
    status: "pending",
    attempts: 0,
    nextAttemptAt: 0,
    createdAt: Date.now(),
    ownerUserId,
    photoUploaded: !photo,
  };
  await db.transaction("rw", db.pendingFarmers, db.pendingPhotos, async () => {
    await db.pendingFarmers.put(record);
    if (photo)
      await db.pendingPhotos.put({ clientRef, blob: photo, type: photo.type || "image/jpeg" });
  });
  return clientRef;
}

let running: Promise<SyncSummary> | null = null;

export interface SyncSummary {
  ok: number;
  failed: number;
  skipped: boolean;
}

/**
 * Send due records to the server in batches. Safe to call often: concurrent calls share one run,
 * and server-side idempotency (clientRef) means a retried batch never duplicates farmers.
 */
export function syncPending(
  opts: {
    ownerUserId: string;
    force?: boolean;
    fetchImpl?: typeof fetch;
    db?: AgriPayOfflineDB;
  } = { ownerUserId: "" },
): Promise<SyncSummary> {
  if (running) return running;
  running = doSync(opts).finally(() => {
    running = null;
  });
  return running;
}

async function doSync({
  ownerUserId,
  force = false,
  fetchImpl = fetch,
  db = offlineDb(),
}: {
  ownerUserId: string;
  force?: boolean;
  fetchImpl?: typeof fetch;
  db?: AgriPayOfflineDB;
}): Promise<SyncSummary> {
  if (typeof navigator !== "undefined" && navigator.onLine === false)
    return { ok: 0, failed: 0, skipped: true };
  const now = Date.now();
  const due = await db.pendingFarmers
    .where("ownerUserId")
    .equals(ownerUserId)
    .filter(
      (r) =>
        (r.status === "pending" || r.status === "error" || r.status === "syncing") &&
        (force || r.nextAttemptAt <= now),
    )
    .sortBy("createdAt");

  let ok = 0;
  let failed = 0;
  for (let i = 0; i < due.length; i += BATCH_SIZE) {
    const batch = due.slice(i, i + BATCH_SIZE);
    await db.pendingFarmers.bulkUpdate(
      batch.map((r) => ({ key: r.clientRef, changes: { status: "syncing" as const } })),
    );

    let results: ServerResult[] | null = null;
    let transportError: string | null = null;
    try {
      const res = await fetchImpl("/api/sync/farmers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ records: batch.map((r) => r.payload) }),
      });
      if (res.status === 401) transportError = "Signed out — sign in again to sync.";
      else if (!res.ok) transportError = `Server error (${res.status})`;
      else results = ((await res.json()) as { results: ServerResult[] }).results;
    } catch (e) {
      transportError = (e as Error).message || "Network error";
    }

    if (!results) {
      failed += batch.length;
      await db.pendingFarmers.bulkUpdate(
        batch.map((r) => ({
          key: r.clientRef,
          changes: {
            status: "error" as const,
            attempts: r.attempts + 1,
            nextAttemptAt: Date.now() + backoffFor(r.attempts),
            error: transportError ?? "Sync failed",
          },
        })),
      );
      break; // stop this run; try again later
    }

    const byRef = new Map(results.map((r) => [r.clientRef, r]));
    for (const rec of batch) {
      const r = byRef.get(rec.clientRef);
      if (r && (r.status === "created" || r.status === "exists")) {
        ok++;
        await db.pendingFarmers.update(rec.clientRef, {
          status: "synced",
          agripayId: r.agripayId,
          farmerId: r.farmerId,
          duplicateOf: r.duplicateOf,
          warnings: r.warnings,
          error: undefined,
          fieldErrors: undefined,
          syncedAt: Date.now(),
        });
      } else {
        failed++;
        const err = r && (r.status === "invalid" || r.status === "error") ? r : null;
        const retryable = err ? err.retryable : true;
        await db.pendingFarmers.update(rec.clientRef, {
          status: retryable ? "error" : "invalid",
          attempts: rec.attempts + 1,
          nextAttemptAt: retryable
            ? Date.now() + backoffFor(rec.attempts)
            : Number.MAX_SAFE_INTEGER,
          error: err?.error ?? "No result from server",
          fieldErrors: err?.fieldErrors,
        });
      }
    }
  }

  await uploadPendingPhotos(db, ownerUserId, fetchImpl);
  await db.cache.put({ key: `lastSync:${ownerUserId}`, value: Date.now(), updatedAt: Date.now() });
  return { ok, failed, skipped: false };
}

/** After a record has synced, upload its photo via a presigned URL. Failures are retried next sync. */
async function uploadPendingPhotos(
  db: AgriPayOfflineDB,
  ownerUserId: string,
  fetchImpl: typeof fetch,
) {
  const synced = await db.pendingFarmers
    .where("ownerUserId")
    .equals(ownerUserId)
    .filter((r) => r.status === "synced" && !r.photoUploaded && !!r.farmerId)
    .toArray();
  for (const rec of synced) {
    const photo = await db.pendingPhotos.get(rec.clientRef);
    if (!photo) {
      await db.pendingFarmers.update(rec.clientRef, { photoUploaded: true });
      continue;
    }
    try {
      const presign = await fetchImpl(`/api/farmers/${rec.farmerId}/photo`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contentType: photo.type }),
      });
      if (!presign.ok) continue;
      const { url, key } = (await presign.json()) as { url: string; key: string };
      const put = await fetchImpl(url, {
        method: "PUT",
        headers: { "Content-Type": photo.type },
        body: photo.blob,
      });
      if (!put.ok) continue;
      const attach = await fetchImpl(`/api/farmers/${rec.farmerId}/photo`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key }),
      });
      if (!attach.ok) continue;
      await db.transaction("rw", db.pendingFarmers, db.pendingPhotos, async () => {
        await db.pendingFarmers.update(rec.clientRef, { photoUploaded: true });
        await db.pendingPhotos.delete(rec.clientRef);
      });
    } catch {
      // keep for next sync
    }
  }
}

/** Remove synced records older than `olderThanMs` (keeps the device tidy). */
export async function pruneSynced(
  ownerUserId: string,
  olderThanMs = 7 * 24 * 3600 * 1000,
  db: AgriPayOfflineDB = offlineDb(),
) {
  const cutoff = Date.now() - olderThanMs;
  await db.pendingFarmers
    .where("ownerUserId")
    .equals(ownerUserId)
    .filter((r) => r.status === "synced" && r.photoUploaded === true && (r.syncedAt ?? 0) < cutoff)
    .delete();
}
