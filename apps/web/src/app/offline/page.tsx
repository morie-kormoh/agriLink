import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { WifiOffIcon } from "lucide-react";

// Served by the service worker when a page isn't cached and the device is offline.
// Rendered in the person's language when the service worker caches it.
export default async function OfflinePage() {
  const t = await getTranslations("offline");
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
      <span className="bg-secondary text-primary rounded-full p-4">
        <WifiOffIcon className="size-8" />
      </span>
      <h1 className="text-xl font-semibold">{t("title")}</h1>
      <p className="text-muted-foreground max-w-sm text-sm">{t("body")}</p>
      <Link className="text-primary font-medium underline" href="/agent/farmers/new">
        {t("register")}
      </Link>
    </main>
  );
}
