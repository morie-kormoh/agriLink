"use client";

import { useEffect, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Loader2Icon, SearchIcon, XIcon } from "lucide-react";
import { Button } from "@agrilink/ui/components/button";
import { Input } from "@agrilink/ui/components/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@agrilink/ui/components/select";

const ALL = "__all";

/** Search box + filters that live in the URL (shareable, server-rendered results). */
export function FarmerFilters({ crops }: { crops: { id: string; name: string }[] }) {
  const t = useTranslations();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");
  const [pending, startTransition] = useTransition();

  function update(key: string, value: string | null) {
    const next = new URLSearchParams(params.toString());
    if (value && value !== ALL) next.set(key, value);
    else next.delete(key);
    next.delete("page");
    startTransition(() => router.replace(`${pathname}?${next.toString()}`));
  }

  // Debounced search
  useEffect(() => {
    const current = params.get("q") ?? "";
    if (q === current) return;
    const id = setTimeout(() => update("q", q.trim() || null), 350);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const hasFilters = ["q", "gender", "status", "cropId", "youth", "kycTier"].some((k) =>
    params.get(k),
  );

  return (
    <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
      <div className="relative sm:w-72">
        <SearchIcon className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
        <Input
          className="pl-9"
          placeholder={t("farmer.searchPlaceholder")}
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        {pending ? (
          <Loader2Icon className="text-muted-foreground absolute top-1/2 right-3 size-4 -translate-y-1/2 animate-spin" />
        ) : null}
      </div>
      <Select value={params.get("gender") ?? ALL} onValueChange={(v) => update("gender", v)}>
        <SelectTrigger className="sm:w-36">
          <SelectValue placeholder={t("farmer.fields.gender")} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>{t("farmer.fields.gender")}: —</SelectItem>
          <SelectItem value="FEMALE">{t("gender.FEMALE")}</SelectItem>
          <SelectItem value="MALE">{t("gender.MALE")}</SelectItem>
        </SelectContent>
      </Select>
      <Select value={params.get("cropId") ?? ALL} onValueChange={(v) => update("cropId", v)}>
        <SelectTrigger className="sm:w-40">
          <SelectValue placeholder={t("farmer.crop")} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>{t("farmer.crop")}: —</SelectItem>
          {crops.map((c) => (
            <SelectItem key={c.id} value={c.id}>
              {c.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={params.get("status") ?? ALL} onValueChange={(v) => update("status", v)}>
        <SelectTrigger className="sm:w-44">
          <SelectValue placeholder={t("common.status")} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>{t("common.status")}: —</SelectItem>
          {["ACTIVE", "DUPLICATE_SUSPECTED", "INACTIVE"].map((s) => (
            <SelectItem key={s} value={s}>
              {t(`farmerStatus.${s}`)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={params.get("youth") ?? ALL} onValueChange={(v) => update("youth", v)}>
        <SelectTrigger className="sm:w-40">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>{t("farmer.youth")}: —</SelectItem>
          <SelectItem value="true">{t("farmer.youth")}</SelectItem>
        </SelectContent>
      </Select>
      {hasFilters ? (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setQ("");
            startTransition(() => router.replace(pathname));
          }}
        >
          <XIcon /> Clear
        </Button>
      ) : null}
    </div>
  );
}
