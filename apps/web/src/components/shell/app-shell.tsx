import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { BanknoteIcon, GaugeIcon, HandCoinsIcon, HouseIcon, PiggyBankIcon } from "lucide-react";
import { cn } from "@agrilink/ui/lib/utils";
import { formatSlPhone } from "@agrilink/validation";
import { hasPermission } from "@agrilink/validation/permissions";
import type { CurrentUser } from "@/server/auth/actor";
import { listContexts } from "@/server/auth/actor";
import { BottomTabs } from "./bottom-tabs";
import { BrandMark } from "./brand-mark";
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
  const isFarmer = current.actor.role === "FARMER";
  const isAdmin = current.actor.role === "SUPER_ADMIN";
  const tabs = isFarmer
    ? [
        { href: "/farmer", label: t("nav.tabHome"), icon: <HouseIcon />, exact: true },
        { href: "/farmer/payments", label: t("nav.tabMoney"), icon: <BanknoteIcon /> },
        { href: "/farmer/savings", label: t("nav.tabSavings"), icon: <PiggyBankIcon /> },
        { href: "/farmer/passport", label: t("nav.tabPassport"), icon: <GaugeIcon /> },
        { href: "/farmer/loans", label: t("nav.tabLoans"), icon: <HandCoinsIcon /> },
      ]
    : null;

  return (
    <div className="flex min-h-dvh">
      <aside
        className={cn(
          "no-print gara text-sidebar-foreground sticky top-0 hidden h-dvh w-64 shrink-0 flex-col md:flex",
          isAdmin ? "bg-indigo-900" : "bg-sidebar",
        )}
      >
        <Link
          href="/"
          className="border-sidebar-border font-display flex h-16 items-center gap-2.5 border-b px-5 text-lg font-bold text-white"
        >
          <BrandMark className="size-8" />
          AgriLink
        </Link>
        <div className="text-sidebar-foreground/70 px-5 pt-4 pb-2 text-sm font-semibold">
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
          <span className="font-display flex items-center gap-2 truncate font-bold md:hidden">
            <BrandMark className="size-7" />
            AgriLink
          </span>
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
        <main className={cn("mx-auto w-full max-w-6xl flex-1 p-4 sm:p-6", tabs && "pb-24 md:pb-6")}>
          {children}
        </main>
      </div>
      {tabs ? <BottomTabs items={tabs} /> : null}
    </div>
  );
}
