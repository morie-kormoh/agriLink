"use client";

import { useTranslations } from "next-intl";
import { useLiveQuery } from "dexie-react-hooks";
import { CloudOffIcon, RefreshCwIcon, Trash2Icon } from "lucide-react";
import { Badge } from "@agrilink/ui/components/badge";
import { Button } from "@agrilink/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@agrilink/ui/components/card";
import { useSync } from "@/components/offline/sync-provider";
import { offlineDb } from "@/lib/offline/db";

/** Registrations on this device that haven't reached the server yet (or failed). */
export function PendingList({ showSynced = false }: { showSynced?: boolean }) {
  const t = useTranslations();
  const { ownerUserId, syncNow, syncing } = useSync();
  const rows = useLiveQuery(
    () =>
      offlineDb()
        .pendingFarmers.where("ownerUserId")
        .equals(ownerUserId)
        .filter((r) => showSynced || r.status !== "synced")
        .reverse()
        .sortBy("createdAt"),
    [ownerUserId, showSynced],
  );

  if (!rows?.length) return null;

  return (
    <Card className="mb-6 gap-3 py-4">
      <CardHeader className="flex flex-row items-center justify-between px-4">
        <CardTitle className="flex items-center gap-2 text-base">
          <CloudOffIcon className="size-4" />{" "}
          {t("sync.pendingCount", { count: rows.filter((r) => r.status !== "synced").length })}
        </CardTitle>
        <Button size="sm" variant="outline" disabled={syncing} onClick={() => void syncNow(true)}>
          <RefreshCwIcon className={syncing ? "animate-spin" : undefined} /> {t("sync.syncNow")}
        </Button>
      </CardHeader>
      <CardContent className="px-4">
        <ul className="divide-y">
          {rows.map((r) => (
            <li key={r.clientRef} className="flex items-center justify-between gap-3 py-2">
              <div className="min-w-0">
                <p className="truncate font-medium">{r.fullName}</p>
                <p className="text-muted-foreground truncate text-xs">
                  {r.agrilinkId ?? r.phone} · {new Date(r.createdAt).toLocaleString("en-GB")}
                </p>
                {r.error && r.status !== "synced" ? (
                  <p className="text-destructive text-xs">{r.error}</p>
                ) : null}
                {r.fieldErrors
                  ? Object.entries(r.fieldErrors).map(([k, v]) => (
                      <p key={k} className="text-destructive text-xs">
                        {k}: {v.join(", ")}
                      </p>
                    ))
                  : null}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Badge
                  variant={
                    r.status === "synced"
                      ? "success"
                      : r.status === "invalid"
                        ? "destructive"
                        : r.status === "error"
                          ? "warning"
                          : "info"
                  }
                >
                  {r.status === "synced"
                    ? t("farmer.synced")
                    : r.status === "pending" || r.status === "syncing"
                      ? t("farmer.pending")
                      : t("farmer.error")}
                </Badge>
                {r.status === "invalid" ? (
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={t("sync.discard")}
                    onClick={() => {
                      if (confirm(`${t("sync.discard")}: ${r.fullName}?`)) {
                        void offlineDb().transaction(
                          "rw",
                          offlineDb().pendingFarmers,
                          offlineDb().pendingPhotos,
                          async () => {
                            await offlineDb().pendingFarmers.delete(r.clientRef);
                            await offlineDb().pendingPhotos.delete(r.clientRef);
                          },
                        );
                      }
                    }}
                  >
                    <Trash2Icon />
                  </Button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
