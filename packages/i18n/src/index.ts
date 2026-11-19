import { IntlMessageFormat } from "intl-messageformat";
import en from "../messages/en.json";
import kri from "../messages/kri.json";

export const LOCALES = ["en", "kri"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "en";

export const LOCALE_LABELS: Record<Locale, string> = {
  en: "English",
  kri: "Krio",
};

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

type Messages = Record<string, unknown>;

function deepMerge(base: Messages, override: Messages): Messages {
  const out: Messages = { ...base };
  for (const [key, value] of Object.entries(override)) {
    if (key.startsWith("_")) continue;
    const baseValue = out[key];
    out[key] =
      value && typeof value === "object" && baseValue && typeof baseValue === "object"
        ? deepMerge(baseValue as Messages, value as Messages)
        : value;
  }
  return out;
}

const CATALOG: Record<Locale, Messages> = {
  en: en as Messages,
  // Krio is merged over English so untranslated keys fall back gracefully.
  kri: deepMerge(en as Messages, kri as Messages),
};

/** Full message tree for a locale (used by next-intl in the web app). */
export function getMessages(locale: Locale): Messages {
  return CATALOG[locale] ?? CATALOG[DEFAULT_LOCALE];
}

function lookup(messages: Messages, key: string): string | undefined {
  let node: unknown = messages;
  for (const part of key.split(".")) {
    if (!node || typeof node !== "object") return undefined;
    node = (node as Messages)[part];
  }
  return typeof node === "string" ? node : undefined;
}

/**
 * Translate outside React (USSD, SMS, worker).
 * Uses ICU MessageFormat, e.g. t("kri", "auth.codeSubtitle", { phone: "076 123 456" }).
 */
export function t(locale: string, key: string, vars?: Record<string, string | number>): string {
  const loc: Locale = isLocale(locale) ? locale : DEFAULT_LOCALE;
  const template = lookup(getMessages(loc), key) ?? lookup(CATALOG.en, key) ?? key;
  if (!vars) return template;
  return String(new IntlMessageFormat(template, loc === "kri" ? "en" : loc).format(vars));
}

export { translateText } from "./text";
export { translateSms } from "./sms";

export { en as enMessages };
