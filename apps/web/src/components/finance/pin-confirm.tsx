"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { DeleteIcon, KeyRoundIcon, Loader2Icon, UserRoundCheckIcon } from "lucide-react";
import { Button } from "@agrilink/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@agrilink/ui/components/dialog";
import { Input } from "@agrilink/ui/components/input";
import { Label } from "@agrilink/ui/components/label";
import { toast } from "@agrilink/ui/components/sonner";

type Result = { ok: true; data?: unknown } | { ok: false; error: string };

/**
 * Every financial decision a farmer makes (savings, consent, loans) is confirmed with their own PIN.
 * `action` is a bound server action that receives the PIN as its last argument.
 */
export function PinConfirm({
  label,
  title,
  description,
  children,
  action,
  successMessage,
  variant = "default",
  size = "default",
  assisted = false,
  disabled,
  icon,
  onDone,
  open: controlledOpen,
  onOpenChange,
  hideTrigger,
}: {
  label: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  children?: React.ReactNode;
  action: (pin: string) => Promise<Result>;
  successMessage?: string;
  variant?: "default" | "outline" | "destructive" | "secondary" | "ghost";
  size?: "default" | "sm" | "lg";
  /** An agent is holding the device: remind them the farmer types the PIN. */
  assisted?: boolean;
  disabled?: boolean;
  icon?: React.ReactNode;
  onDone?: (data: unknown) => void;
  open?: boolean;
  onOpenChange?: (o: boolean) => void;
  hideTrigger?: boolean;
}) {
  const t = useTranslations();
  const router = useRouter();
  const [innerOpen, setInnerOpen] = useState(false);
  const open = controlledOpen ?? innerOpen;
  const setOpen = onOpenChange ?? setInnerOpen;
  const [pin, setPin] = useState("");
  const [pending, start] = useTransition();
  return (
    <>
      {hideTrigger ? null : (
        <Button variant={variant} size={size} disabled={disabled} onClick={() => setOpen(true)}>
          {icon} {label}
        </Button>
      )}
      <Dialog
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) setPin("");
        }}
      >
        <DialogContent className="top-auto bottom-0 max-h-[100dvh] max-w-full translate-y-0 overflow-y-auto rounded-b-none pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:top-[50%] sm:bottom-auto sm:max-w-md sm:translate-y-[-50%] sm:rounded-2xl">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            {description ? <DialogDescription>{description}</DialogDescription> : null}
          </DialogHeader>
          {children}
          <form
            className="space-y-2"
            onSubmit={(e) => {
              e.preventDefault();
              start(async () => {
                const r = await action(pin);
                if (!r.ok) {
                  setPin("");
                  return void toast.error(r.error);
                }
                toast.success(successMessage ?? t("common.save"));
                setOpen(false);
                setPin("");
                onDone?.(r.data);
                router.refresh();
              });
            }}
          >
            <Label htmlFor="pin-confirm" className="sr-only">
              {t("finance.pin")}
            </Label>
            {/* The field shows dots; the keypad below is the main way in on a phone (docs/ui §4.4). */}
            <Input
              id="pin-confirm"
              type="password"
              inputMode="none"
              autoComplete="off"
              pattern="\d{4,5}"
              maxLength={5}
              required
              value={pin}
              aria-label={t("finance.pin")}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 5))}
              className="mx-auto h-14 max-w-48 text-center font-mono text-2xl tracking-[0.6em] md:h-14 md:text-2xl"
            />
            <div
              className="mx-auto grid max-w-72 grid-cols-3 gap-2 pt-1"
              role="group"
              aria-label="Keypad"
            >
              {["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "del"].map((k, i) =>
                k === "" ? (
                  <span key={i} />
                ) : (
                  <button
                    key={i}
                    type="button"
                    tabIndex={-1}
                    aria-label={k === "del" ? "Delete" : k}
                    onClick={() =>
                      setPin((p) => (k === "del" ? p.slice(0, -1) : (p + k).slice(0, 5)))
                    }
                    className="bg-secondary text-ink active:bg-indigo flex h-14 items-center justify-center rounded-xl text-2xl font-semibold transition-colors active:text-white dark:text-white"
                  >
                    {k === "del" ? <DeleteIcon className="size-6" aria-hidden /> : k}
                  </button>
                ),
              )}
            </div>
            {assisted ? (
              <p className="bg-gold/20 flex items-start gap-2 rounded-lg p-2.5 text-sm">
                <UserRoundCheckIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
                {t("finance.assisted")}
              </p>
            ) : (
              <p className="text-muted-foreground text-center text-xs">
                {t("finance.pinHelpSelf")}
              </p>
            )}
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                {t("common.cancel")}
              </Button>
              <Button
                type="submit"
                size="lg"
                variant={variant === "destructive" ? "destructive" : "default"}
                disabled={pending || pin.length < 4}
              >
                {pending ? <Loader2Icon className="animate-spin" /> : <KeyRoundIcon />}{" "}
                {t("finance.confirmWithPin")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
