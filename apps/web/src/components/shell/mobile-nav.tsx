"use client";

import { useState } from "react";
import { MenuIcon } from "lucide-react";
import { Button } from "@agrilink/ui/components/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@agrilink/ui/components/sheet";
import { NavLink } from "./nav-link";

export interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
  exact?: boolean;
}

export function MobileNav({ items, title }: { items: NavItem[]; title: string }) {
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="md:hidden" aria-label="Open menu">
          <MenuIcon />
        </Button>
      </SheetTrigger>
      <SheetContent
        side="left"
        className="border-sidebar-border bg-sidebar text-sidebar-foreground w-72 p-0"
      >
        <SheetHeader className="border-sidebar-border border-b">
          <SheetTitle className="text-sidebar-foreground">{title}</SheetTitle>
        </SheetHeader>
        <nav className="flex flex-col gap-1 p-3">
          {items.map((item) => (
            <NavLink key={item.href} {...item} onNavigate={() => setOpen(false)} />
          ))}
        </nav>
      </SheetContent>
    </Sheet>
  );
}
