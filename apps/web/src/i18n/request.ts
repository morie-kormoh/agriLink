import { cookies } from "next/headers";
import { getRequestConfig } from "next-intl/server";
import { DEFAULT_LOCALE, getMessages, isLocale } from "@agrilink/i18n";

export const LOCALE_COOKIE = "NEXT_LOCALE";

// Locale comes from a cookie (no /en/ /kri/ URL prefixes — simpler for field users and offline caching).
export default getRequestConfig(async () => {
  const value = (await cookies()).get(LOCALE_COOKIE)?.value;
  const locale = isLocale(value) ? value : DEFAULT_LOCALE;
  return {
    locale,
    messages: getMessages(locale) as Record<string, never>,
    timeZone: "Africa/Freetown",
    // Krio has no CLDR data: formatting falls back to English rules.
    onError(error) {
      if (error.code !== "MISSING_MESSAGE") console.warn("[i18n]", error.message);
    },
  };
});
