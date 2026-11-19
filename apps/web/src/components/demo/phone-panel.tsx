"use client";

import { useCallback, useEffect, useState } from "react";
import { MessageSquareTextIcon, SmartphoneIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@agrilink/ui/components/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@agrilink/ui/components/sheet";
import { ResetDemoButton } from "./persona-switcher";

interface Sms {
  to: string;
  name: string;
  body: string;
  kind: string;
  at: string;
}

/**
 * Demo only: a floating "Phone" that shows the SMS AgriLink just sent (receipts, voucher codes,
 * confirmation codes), because the audience cannot see feature phones or server logs.
 */
export function PhonePanel() {
  const t = useTranslations("demo");
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Sms[]>([]);
  const [seen, setSeen] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/demo/sms", { cache: "no-store" });
      if (r.ok) setMessages(((await r.json()) as { messages: Sms[] }).messages);
    } catch {
      /* offline: keep what we have */
    }
  }, []);

  useEffect(() => {
    void load();
    const id = setInterval(load, open ? 3000 : 8000);
    return () => clearInterval(id);
  }, [load, open]);

  const latest = messages[0]?.at ?? null;
  const unread =
    latest && latest !== seen ? messages.filter((m) => !seen || m.at > seen).length : 0;

  return (
    <>
      <Button
        type="button"
        onClick={() => {
          setOpen(true);
          setSeen(latest);
        }}
        className="fixed right-4 bottom-24 z-40 h-12 gap-2 rounded-full shadow-[var(--shadow-float)] md:bottom-6"
        aria-label={t("phone")}
      >
        <SmartphoneIcon /> SMS
        {unread ? (
          <span className="bg-background text-foreground rounded-full px-1.5 text-xs font-bold">
            {unread}
          </span>
        ) : null}
      </Button>
      <Sheet
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (o) setSeen(latest);
        }}
      >
        <SheetContent className="flex w-full flex-col sm:max-w-md">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <MessageSquareTextIcon className="size-4" /> {t("phoneTitle")}
            </SheetTitle>
            <SheetDescription>{t("phoneBody")}</SheetDescription>
          </SheetHeader>
          <div className="flex-1 space-y-3 overflow-y-auto px-4">
            {messages.length === 0 ? (
              <p className="text-muted-foreground text-sm">{t("noSms")}</p>
            ) : null}
            {messages.map((m, i) => (
              <div key={`${m.at}-${i}`} className="bg-muted rounded-2xl rounded-tl-sm p-3">
                <div className="mb-1 flex items-baseline justify-between gap-2">
                  <span className="text-xs font-semibold">{t("to", { name: m.name })}</span>
                  <span className="text-muted-foreground text-[11px]">
                    {new Date(m.at).toLocaleTimeString("en-GB", {
                      hour: "2-digit",
                      minute: "2-digit",
                      second: "2-digit",
                    })}
                  </span>
                </div>
                <p className="text-sm whitespace-pre-wrap">{m.body}</p>
              </div>
            ))}
          </div>
          <div className="border-t p-4">
            <ResetDemoButton />
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
