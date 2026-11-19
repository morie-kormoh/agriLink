import { SyncIndicator } from "@/components/offline/sync-indicator";
import { SyncProvider } from "@/components/offline/sync-provider";
import { PhonePanel } from "@/components/demo/phone-panel";
import { requirePortal } from "@/server/auth/actor";
import { isDemoMode } from "@/server/demo/flags";
import { AppShell } from "./app-shell";
import { navFor } from "./nav";

/** Shared layout for every portal: auth + role gate + chrome. Agents also get the offline sync provider. */
export async function PortalLayout({
  prefix,
  children,
}: {
  prefix: string;
  children: React.ReactNode;
}) {
  const current = await requirePortal(prefix);
  const { title, items } = await navFor(current.actor.role);
  const withSync =
    current.actor.role === "AGENT" ||
    current.actor.role === "COOP_ADMIN" ||
    current.actor.role === "COOP_STAFF";
  const shell = (
    <AppShell
      current={current}
      items={items}
      title={title}
      topbarExtra={withSync ? <SyncIndicator /> : undefined}
    >
      {children}
      {isDemoMode() ? <PhonePanel /> : null}
    </AppShell>
  );
  return withSync ? <SyncProvider ownerUserId={current.user.id}>{shell}</SyncProvider> : shell;
}
