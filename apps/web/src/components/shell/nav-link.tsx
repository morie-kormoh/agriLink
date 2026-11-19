"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@agrilink/ui/lib/utils";

export function NavLink({
  href,
  icon,
  label,
  exact = false,
  onNavigate,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  exact?: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const active = exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
  return (
    <Link
      href={href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        "relative flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors md:min-h-10",
        active
          ? "bg-sidebar-accent text-sidebar-accent-foreground before:bg-gold before:absolute before:inset-y-2 before:-left-3 before:w-1 before:rounded-r-full"
          : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
      )}
    >
      <span className="[&_svg]:size-4">{icon}</span>
      {label}
    </Link>
  );
}
