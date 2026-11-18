"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useLiveQuery } from "dexie-react-hooks";
import { CheckCircle2Icon, DatabaseIcon, RefreshCwIcon } from "lucide-react";
import { Button } from "@agripay/ui/components/button";
import { StatCard } from "@agripay/ui/components/blocks";
import { toast } from "@agripay/ui/components/sonner";
import { PendingList } from "@/components/farmers/pending-list";
import { offlineDb } from "@/lib/offline/db";
import { useSync } from "./sync-provider";

export function SyncPanel() {
  const t = useTranslations();
  const { pendingCount, errorCount, lastSync, syncing, syncNow } = useSync();
  const [showSynced, setShowSynced] = useState(false);
  const reference = useLiveQuery(() => offlineDb().cache.get("reference"), []);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label={t("farmer.pending")} value={pendingCount} icon={RefreshCwIcon} />
        <StatCard label={t("farmer.error")} value={errorCount} icon={DatabaseIcon} />
        <StatCard
          label={t("sync.lastSync", { time: "" }).replace(/:\s*$/, "")}
          value={
            lastSync
              ? new Date(lastSync).toLocaleTimeString("en-GB", {
                  hour: "2-digit",
                  minute: "2-digit",
                })
              : t("sync.never")
          }
          hint={reference ? t("sync.offlineReady") : undefined}
          icon={CheckCircle2Icon}
        />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          disabled={syncing}
          onClick={async () => {
            const r = await syncNow(true);
            if (r.skipped) toast.warning(t("common.offline"));
            else toast.success(t("sync.done", { ok: r.ok, failed: r.failed }));
          }}
        >
          <RefreshCwIcon className={syncing ? "animate-spin" : undefined} /> {t("sync.syncNow")}
        </Button>
        <Button variant="outline" onClick={() => setShowSynced((s) => !s)}>
          {showSynced ? t("farmer.pending") : `${t("farmer.synced")} + ${t("farmer.pending")}`}
        </Button>
      </div>
      <PendingList showSynced={showSynced} />
    </div>
  );
}
