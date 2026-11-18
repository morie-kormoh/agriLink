"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { offlineDb } from "@/lib/offline/db";
import { type SyncSummary, pruneSynced, syncPending } from "@/lib/offline/sync";

interface SyncState {
  ownerUserId: string;
  pendingCount: number;
  errorCount: number;
  lastSync: number | null;
  syncing: boolean;
  syncNow: (force?: boolean) => Promise<SyncSummary>;
}

const SyncContext = createContext<SyncState | null>(null);

const SYNC_INTERVAL_MS = 5 * 60 * 1000;

/**
 * Agent-portal provider: registers the service worker, caches reference data,
 * and syncs pending registrations on reconnect, every 5 minutes and on demand.
 */
export function SyncProvider({
  ownerUserId,
  children,
}: {
  ownerUserId: string;
  children: React.ReactNode;
}) {
  const [syncing, setSyncing] = useState(false);

  const counts = useLiveQuery(async () => {
    const rows = await offlineDb()
      .pendingFarmers.where("ownerUserId")
      .equals(ownerUserId)
      .toArray();
    return {
      pending: rows.filter(
        (r) => r.status === "pending" || r.status === "syncing" || r.status === "error",
      ).length,
      errors: rows.filter((r) => r.status === "error" || r.status === "invalid").length,
    };
  }, [ownerUserId]);
  const lastSync = useLiveQuery(
    async () =>
      ((await offlineDb().cache.get(`lastSync:${ownerUserId}`))?.value as number | undefined) ??
      null,
    [ownerUserId],
  );

  const syncNow = useCallback(
    async (force = false) => {
      setSyncing(true);
      try {
        return await syncPending({ ownerUserId, force });
      } finally {
        setSyncing(false);
      }
    },
    [ownerUserId],
  );

  useEffect(() => {
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      navigator.serviceWorker
        .register("/sw.js", { scope: "/" })
        .catch((e) => console.warn("SW registration failed", e));
    }
    // Cache reference data for offline forms.
    if (navigator.onLine) {
      fetch("/api/reference", { credentials: "same-origin" })
        .then((r) => (r.ok ? r.json() : null))
        .then(
          (data) =>
            data && offlineDb().cache.put({ key: "reference", value: data, updatedAt: Date.now() }),
        )
        .catch(() => undefined);
    }
    void syncNow();
    void pruneSynced(ownerUserId);
    const onOnline = () => void syncNow(true);
    window.addEventListener("online", onOnline);
    const id = window.setInterval(() => void syncNow(), SYNC_INTERVAL_MS);
    return () => {
      window.removeEventListener("online", onOnline);
      window.clearInterval(id);
    };
  }, [ownerUserId, syncNow]);

  return (
    <SyncContext.Provider
      value={{
        ownerUserId,
        pendingCount: counts?.pending ?? 0,
        errorCount: counts?.errors ?? 0,
        lastSync: lastSync ?? null,
        syncing,
        syncNow,
      }}
    >
      {children}
    </SyncContext.Provider>
  );
}

export function useSync(): SyncState {
  const ctx = useContext(SyncContext);
  if (!ctx) throw new Error("useSync must be used inside <SyncProvider>");
  return ctx;
}

export function useOptionalSync(): SyncState | null {
  return useContext(SyncContext);
}
