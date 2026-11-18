import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AgriPayOfflineDB } from "@/lib/offline/db";
import { backoffFor, enqueueFarmer, syncPending } from "@/lib/offline/sync";

const OWNER = "agent-1";
let db: AgriPayOfflineDB;

beforeEach(async () => {
  db = new AgriPayOfflineDB();
  await db.pendingFarmers.clear();
  await db.pendingPhotos.clear();
  await db.cache.clear();
});

const payload = (name: string) => ({
  fullName: name,
  phone: "076123456",
  consentToRegister: true as const,
});

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("offline queue", () => {
  it("syncs pending records and stores the AgriPay ID", async () => {
    const ref = await enqueueFarmer(payload("Aminata") as never, OWNER, null, db);
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const { records } = JSON.parse(String(init?.body)) as { records: { clientRef: string }[] };
      return jsonResponse({
        results: records.map((r) => ({
          clientRef: r.clientRef,
          status: "created",
          farmerId: "f1",
          agripayId: "AP-BOM-000001",
          duplicateOf: null,
          warnings: [],
        })),
      });
    });
    const summary = await syncPending({
      ownerUserId: OWNER,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      db,
    });
    expect(summary).toEqual({ ok: 1, failed: 0, skipped: false });
    const rec = await db.pendingFarmers.get(ref);
    expect(rec).toMatchObject({ status: "synced", agripayId: "AP-BOM-000001", farmerId: "f1" });
    // payload carries clientRef so the server can dedupe retries
    expect(JSON.parse(String(fetchImpl.mock.calls[0]?.[1]?.body)).records[0].clientRef).toBe(ref);
  });

  it("backs off on network errors and keeps records for retry", async () => {
    const ref = await enqueueFarmer(payload("Mohamed") as never, OWNER, null, db);
    const fetchImpl = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    });
    const summary = await syncPending({
      ownerUserId: OWNER,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      db,
    });
    expect(summary.failed).toBe(1);
    const rec = await db.pendingFarmers.get(ref);
    expect(rec?.status).toBe("error");
    expect(rec?.attempts).toBe(1);
    expect(rec!.nextAttemptAt).toBeGreaterThan(Date.now() + backoffFor(0) - 2000);

    // Not due yet → no request; forced → retried
    fetchImpl.mockClear();
    await syncPending({ ownerUserId: OWNER, fetchImpl: fetchImpl as unknown as typeof fetch, db });
    expect(fetchImpl).not.toHaveBeenCalled();
    await syncPending({
      ownerUserId: OWNER,
      force: true,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      db,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("marks validation failures as invalid (not retried)", async () => {
    const ref = await enqueueFarmer(payload("Bad") as never, OWNER, null, db);
    const fetchImpl = vi.fn(async (_u: string | URL | Request, init?: RequestInit) => {
      const { records } = JSON.parse(String(init?.body)) as { records: { clientRef: string }[] };
      return jsonResponse({
        results: records.map((r) => ({
          clientRef: r.clientRef,
          status: "invalid",
          error: "Validation failed",
          fieldErrors: { districtId: ["Select a district"] },
          retryable: false,
        })),
      });
    });
    await syncPending({ ownerUserId: OWNER, fetchImpl: fetchImpl as unknown as typeof fetch, db });
    const rec = await db.pendingFarmers.get(ref);
    expect(rec).toMatchObject({
      status: "invalid",
      fieldErrors: { districtId: ["Select a district"] },
    });
  });

  it("keeps each agent's records separate on a shared device", async () => {
    await enqueueFarmer(payload("A") as never, "agent-A", null, db);
    await enqueueFarmer(payload("B") as never, "agent-B", null, db);
    const fetchImpl = vi.fn(async (_u: string | URL | Request, init?: RequestInit) => {
      const { records } = JSON.parse(String(init?.body)) as { records: { clientRef: string }[] };
      return jsonResponse({
        results: records.map((r) => ({
          clientRef: r.clientRef,
          status: "created",
          farmerId: "x",
          agripayId: "AP-X",
          duplicateOf: null,
          warnings: [],
        })),
      });
    });
    await syncPending({
      ownerUserId: "agent-A",
      fetchImpl: fetchImpl as unknown as typeof fetch,
      db,
    });
    const body = JSON.parse(String(fetchImpl.mock.calls[0]?.[1]?.body));
    expect(body.records).toHaveLength(1);
    expect(body.records[0].fullName).toBe("A");
  });
});
