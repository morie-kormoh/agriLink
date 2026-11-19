"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Loader2Icon, LogOutIcon } from "lucide-react";
import { Button } from "@agrilink/ui/components/button";
import { Input } from "@agrilink/ui/components/input";
import { Label } from "@agrilink/ui/components/label";
import { toast } from "@agrilink/ui/components/sonner";
import { revokeOtherSessionsAction, setPinAction } from "@/app/actions/auth";

function PinInput(props: React.ComponentProps<typeof Input>) {
  return (
    <Input
      type="password"
      inputMode="numeric"
      autoComplete="off"
      maxLength={5}
      pattern="\d*"
      className="max-w-40 text-lg tracking-[0.5em]"
      {...props}
    />
  );
}

export function PinForm({ hasPin }: { hasPin: boolean }) {
  const t = useTranslations("security");
  const router = useRouter();
  const [values, setValues] = useState({ currentPin: "", pin: "", confirmPin: "" });
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [pending, startTransition] = useTransition();

  return (
    <form
      className="grid gap-4 sm:grid-cols-3"
      onSubmit={(e) => {
        e.preventDefault();
        setErrors({});
        startTransition(async () => {
          const res = await setPinAction({
            ...values,
            currentPin: hasPin ? values.currentPin : undefined,
          });
          if (!res.ok) {
            setErrors(res.fieldErrors ?? {});
            return void toast.error(res.error);
          }
          toast.success(t("pinSaved"));
          setValues({ currentPin: "", pin: "", confirmPin: "" });
          router.refresh();
        });
      }}
    >
      {hasPin ? (
        <div className="space-y-2">
          <Label htmlFor="currentPin">{t("currentPin")}</Label>
          <PinInput
            id="currentPin"
            value={values.currentPin}
            onChange={(e) =>
              setValues({ ...values, currentPin: e.target.value.replace(/\D/g, "") })
            }
          />
        </div>
      ) : null}
      <div className="space-y-2">
        <Label htmlFor="pin">{t("newPin")}</Label>
        <PinInput
          id="pin"
          value={values.pin}
          onChange={(e) => setValues({ ...values, pin: e.target.value.replace(/\D/g, "") })}
          aria-invalid={!!errors.pin}
        />
        {errors.pin ? <p className="text-destructive text-sm">{errors.pin.join(", ")}</p> : null}
      </div>
      <div className="space-y-2">
        <Label htmlFor="confirmPin">{t("confirmPin")}</Label>
        <PinInput
          id="confirmPin"
          value={values.confirmPin}
          onChange={(e) => setValues({ ...values, confirmPin: e.target.value.replace(/\D/g, "") })}
          aria-invalid={!!errors.confirmPin}
        />
        {errors.confirmPin ? (
          <p className="text-destructive text-sm">{errors.confirmPin.join(", ")}</p>
        ) : null}
      </div>
      <div className="sm:col-span-3">
        <Button type="submit" disabled={pending}>
          {pending ? <Loader2Icon className="animate-spin" /> : null}
          {t("savePin")}
        </Button>
      </div>
    </form>
  );
}

export function SignOutOthersButton({ label }: { label: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      size="sm"
      variant="outline"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const res = await revokeOtherSessionsAction();
          if (!res.ok) return void toast.error(res.error);
          toast.success(`${res.data.count}`);
          router.refresh();
        })
      }
    >
      <LogOutIcon /> {label}
    </Button>
  );
}
