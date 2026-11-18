"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { ArrowLeftRightIcon, LogOutIcon, ShieldCheckIcon, UsersIcon } from "lucide-react";
import { Avatar, AvatarFallback } from "@agripay/ui/components/misc";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@agripay/ui/components/dropdown-menu";
import { logoutAction } from "@/app/actions/auth";

export function UserMenu({
  name,
  phone,
  roleLabel,
  orgName,
  canManageTeam,
  multipleContexts,
}: {
  name: string;
  phone: string;
  roleLabel: string;
  orgName: string | null;
  canManageTeam: boolean;
  multipleContexts: boolean;
}) {
  const t = useTranslations();
  const initials = name
    .split(/\s+/)
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="focus-visible:ring-ring/50 flex min-h-0 items-center gap-2 rounded-full outline-none focus-visible:ring-[3px]">
        <Avatar className="size-9">
          <AvatarFallback>{initials || "?"}</AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="space-y-0.5">
          <p className="truncate">{name}</p>
          <p className="text-muted-foreground truncate text-xs font-normal">{phone}</p>
          <p className="text-muted-foreground truncate text-xs font-normal">
            {roleLabel}
            {orgName ? ` · ${orgName}` : ""}
          </p>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {multipleContexts ? (
          <DropdownMenuItem asChild>
            <Link href="/select-context">
              <ArrowLeftRightIcon /> {t("auth.switchWorkspace")}
            </Link>
          </DropdownMenuItem>
        ) : null}
        {canManageTeam ? (
          <DropdownMenuItem asChild>
            <Link href="/settings/team">
              <UsersIcon /> {t("nav.team")}
            </Link>
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem asChild>
          <Link href="/settings/security">
            <ShieldCheckIcon /> {t("nav.security")}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onSelect={() => void logoutAction()}>
          <LogOutIcon /> {t("common.signOut")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
