import { AppShell } from "@/components/shell/app-shell";
import { navFor } from "@/components/shell/nav";
import { getCurrentUser } from "@/server/auth/actor";

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const current = await getCurrentUser();
  const { title, items } = await navFor(current.actor.role);
  return (
    <AppShell current={current} items={items} title={title}>
      <div className="mx-auto max-w-3xl">{children}</div>
    </AppShell>
  );
}
