import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { SproutIcon } from "lucide-react";
import { formatSlPhone } from "@agripay/validation";
import { hasPermission } from "@agripay/validation/permissions";
import type { CurrentUser } from "@/server/auth/actor";
import { listContexts } from "@/server/auth/actor";
import { LanguageSwitcher } from "./language-switcher";
import { MobileNav, type NavItem } from "./mobile-nav";
import { NavLink } from "./nav-link";
import { OnlineBadge } from "./online-badge";
import { UserMenu } from "./user-menu";

/** Portal chrome: sidebar (desktop), sheet menu (mobile), top bar with language + user menu. */
export async function AppShell({
  current,
  items,
  title,
  children,
  topbarExtra,
}: {
  current: CurrentUser;
  items: NavItem[];
  title: string;
  children: React.ReactNode;
  topbarExtra?: React.ReactNode;
}) {
  const t = await getTranslations();
  const contexts = await listContexts(current.user.id);
  const roleLabel = t(`roles.${current.actor.role}`);

  return (
    <div className="flex min-h-dvh">
      <aside className="no-print bg-sidebar text-sidebar-foreground sticky top-0 hidden h-dvh w-64 shrink-0 flex-col md:flex">
        <Link
          href="/"
          className="border-sidebar-border flex h-16 items-center gap-2 border-b px-5 font-semibold"
        >
          <span className="bg-accent text-accent-foreground rounded-md p-1">
            <SproutIcon className="size-5" />
          </span>
          AgriPay
        </Link>
        <div className="text-sidebar-foreground/60 px-5 pt-4 pb-2 text-xs tracking-wide uppercase">
          {title}
        </div>
        <nav className="flex flex-1 flex-col gap-1 px-3">
          {items.map((item) => (
            <NavLink key={item.href} {...item} />
          ))}
        </nav>
        <div className="border-sidebar-border text-sidebar-foreground/70 border-t p-4 text-xs">
          <p className="text-sidebar-foreground truncate font-medium">
            {current.context.orgName ?? roleLabel}
          </p>
          <p className="truncate">{roleLabel}</p>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="no-print bg-background/95 sticky top-0 z-30 flex h-16 items-center gap-2 border-b px-3 backdrop-blur sm:px-6">
          <MobileNav items={items} title={title} />
          <span className="truncate font-semibold md:hidden">AgriPay</span>
          <div className="ml-auto flex items-center gap-2">
            {topbarExtra}
            <OnlineBadge />
            <LanguageSwitcher className="w-auto" />
            <UserMenu
              name={current.user.name ?? formatSlPhone(current.user.phone)}
              phone={formatSlPhone(current.user.phone)}
              roleLabel={roleLabel}
              orgName={current.context.orgName}
              canManageTeam={
                hasPermission(current.actor.role, "member.manage") && !!current.actor.orgId
              }
              multipleContexts={contexts.length > 1}
            />
          </div>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}
