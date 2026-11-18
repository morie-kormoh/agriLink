"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { KeyRoundIcon, Loader2Icon } from "lucide-react";
import { Button } from "@agripay/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@agripay/ui/components/dialog";
import { Input } from "@agripay/ui/components/input";
import { Label } from "@agripay/ui/components/label";
import { toast } from "@agripay/ui/components/sonner";

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
        <DialogContent>
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
            <Label htmlFor="pin-confirm">{t("finance.pin")}</Label>
            <Input
              id="pin-confirm"
              type="password"
              inputMode="numeric"
              autoComplete="off"
              pattern="\d{4,5}"
              maxLength={5}
              required
              autoFocus
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
              className="max-w-40 text-center text-lg tracking-[0.5em]"
            />
            <p className="text-muted-foreground text-xs">
              {assisted ? t("finance.assisted") : t("finance.pinHelpSelf")}
            </p>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                {t("common.cancel")}
              </Button>
              <Button
                type="submit"
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
