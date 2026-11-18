"use client";

import Link from "next/link";
import { RefreshCwIcon } from "lucide-react";
import { Badge } from "@agripay/ui/components/badge";
import { useOptionalSync } from "./sync-provider";

/** Top-bar badge showing how many registrations are waiting to sync. */
export function SyncIndicator() {
  const sync = useOptionalSync();
  if (!sync || (sync.pendingCount === 0 && !sync.syncing)) return null;
  return (
    <Link href="/agent/sync" className="min-h-0">
      <Badge variant={sync.errorCount ? "warning" : "info"}>
        <RefreshCwIcon className={sync.syncing ? "animate-spin" : undefined} />
        {sync.pendingCount}
      </Badge>
    </Link>
  );
}
