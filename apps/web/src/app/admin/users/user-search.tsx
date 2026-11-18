"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { SearchIcon } from "lucide-react";
import { Input } from "@agripay/ui/components/input";

export function UserSearch({ initial }: { initial: string }) {
  const t = useTranslations("common");
  const router = useRouter();
  const pathname = usePathname();
  const [q, setQ] = useState(initial);
  return (
    <form
      className="relative mb-4 sm:w-80"
      onSubmit={(e) => {
        e.preventDefault();
        router.replace(q.trim() ? `${pathname}?q=${encodeURIComponent(q.trim())}` : pathname);
      }}
    >
      <SearchIcon className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
      <Input
        className="pl-9"
        placeholder={t("search")}
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
    </form>
  );
}
