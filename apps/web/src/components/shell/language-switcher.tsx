"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { LanguagesIcon } from "lucide-react";
import { LOCALES, LOCALE_LABELS } from "@agripay/i18n";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@agripay/ui/components/select";
import { setLocaleAction } from "@/app/actions/auth";

export function LanguageSwitcher({ className }: { className?: string }) {
  const locale = useLocale();
  const t = useTranslations("common");
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <Select
      value={locale}
      disabled={pending}
      onValueChange={(value) =>
        startTransition(async () => {
          await setLocaleAction(value);
          router.refresh();
        })
      }
    >
      <SelectTrigger size="sm" className={className} aria-label={t("language")}>
        <LanguagesIcon className="size-4" />
        <span>{LOCALE_LABELS[locale as keyof typeof LOCALE_LABELS] ?? locale}</span>
      </SelectTrigger>
      <SelectContent>
        {LOCALES.map((l) => (
          <SelectItem key={l} value={l}>
            {LOCALE_LABELS[l]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
