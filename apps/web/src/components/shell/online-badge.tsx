"use client";

import { useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { WifiIcon, WifiOffIcon } from "lucide-react";
import { Badge } from "@agrilink/ui/components/badge";

function subscribe(cb: () => void) {
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => {
    window.removeEventListener("online", cb);
    window.removeEventListener("offline", cb);
  };
}

export function useOnline() {
  return useSyncExternalStore(
    subscribe,
    () => navigator.onLine,
    () => true,
  );
}

export function OnlineBadge() {
  const online = useOnline();
  const t = useTranslations("common");
  return online ? (
    <Badge variant="success" className="hidden sm:inline-flex">
      <WifiIcon /> {t("online")}
    </Badge>
  ) : (
    <Badge variant="warning">
      <WifiOffIcon /> {t("offline")}
    </Badge>
  );
}
