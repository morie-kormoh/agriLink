"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@agrilink/ui/lib/utils";

export interface TabItem {
  href: string;
  label: string;
  icon: React.ReactNode;
  exact?: boolean;
}

/**
 * Farmer bottom tab bar on phones (docs/ui §6.1): five tabs, icon + word, active tab is indigo
 * with a gold bar on top. Hidden from md up, where the sidebar shows.
 */
export function BottomTabs({ items, label }: { items: TabItem[]; label?: string }) {
  const pathname = usePathname();
  return (
    <nav
      aria-label={label ?? "Main"}
      className="no-print bg-card fixed inset-x-0 bottom-0 z-40 border-t pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      <ul className="mx-auto grid max-w-lg grid-cols-5">
        {items.map((it) => {
          const active = it.exact
            ? pathname === it.href
            : pathname === it.href || pathname.startsWith(`${it.href}/`);
          return (
            <li key={it.href}>
              <Link
                href={it.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex h-16 flex-col items-center justify-center gap-1 text-xs font-semibold [&_svg]:size-6",
                  active ? "text-indigo dark:text-white" : "text-muted-foreground",
                )}
              >
                {active ? (
                  <span aria-hidden className="bg-gold absolute top-0 h-1 w-10 rounded-b-full" />
                ) : null}
                {it.icon}
                {it.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
