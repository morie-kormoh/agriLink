"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { InfoIcon, Loader2Icon, PhoneIcon } from "lucide-react";
import { Button } from "@agripay/ui/components/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@agripay/ui/components/card";
import { Input } from "@agripay/ui/components/input";
import { Label } from "@agripay/ui/components/label";
import { Alert, AlertDescription } from "@agripay/ui/components/misc";
import { OtpInput } from "@agripay/ui/components/otp-input";
import { formatSlPhone, normalizeSlPhone } from "@agripay/validation";
import { requestOtpAction, verifyOtpAction } from "@/app/actions/auth";

const RESEND_SECONDS = 60;

export function LoginForm({ next, showDevHint, demoCode }: { next: string | null; showDevHint: boolean; demoCode: string | null }) {
  const t = useTranslations();
  const router = useRouter();
  const [step, setStep] = useState<"phone" | "code">("phone");
  const [phoneInput, setPhoneInput] = useState("");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(id);
  }, [cooldown]);

  function errorText(res: { error: string; messageKey?: string }) {
    return res.messageKey && t.has(res.messageKey) ? t(res.messageKey) : res.error;
  }

  function sendCode() {
    setError(null);
    if (!normalizeSlPhone(phoneInput)) {
      setError(t.has("validation.phone") ? t("validation.phone") : "Enter a valid Sierra Leone phone number");
      return;
    }
    startTransition(async () => {
      const res = await requestOtpAction({ phone: phoneInput });
      if (!res.ok) return setError(errorText(res));
      setPhone(res.data.phone);
      setCode("");
      setStep("code");
      setCooldown(RESEND_SECONDS);
    });
  }

  function verify(value = code) {
    if (value.length !== 6) return;
    setError(null);
    startTransition(async () => {
      const res = await verifyOtpAction({ phone, code: value, next });
      if (!res.ok) {
        setCode("");
        return setError(errorText(res));
      }
      router.replace(res.data.redirectTo);
      router.refresh();
    });
  }

  return (
    <Card>
      {step === "phone" ? (
        <>
          <CardHeader>
            <CardTitle className="text-xl">{t("auth.loginTitle")}</CardTitle>
            <CardDescription>{t("auth.loginSubtitle")}</CardDescription>
          </CardHeader>
          <CardContent>
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                sendCode();
              }}
            >
              <div className="space-y-2">
                <Label htmlFor="phone">{t("auth.phoneLabel")}</Label>
                <div className="relative">
                  <PhoneIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="phone"
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    autoFocus
                    className="pl-9 text-lg"
                    placeholder={t("auth.phonePlaceholder")}
                    value={phoneInput}
                    onChange={(e) => setPhoneInput(e.target.value)}
                    aria-invalid={!!error}
                  />
                </div>
              </div>
              {error ? <p className="text-sm text-destructive">{error}</p> : null}
              <Button type="submit" className="w-full" size="lg" disabled={pending}>
                {pending ? <Loader2Icon className="animate-spin" /> : null}
                {t("auth.sendCode")}
              </Button>
            </form>
          </CardContent>
        </>
      ) : (
        <>
          <CardHeader>
            <CardTitle className="text-xl">{t("auth.codeTitle")}</CardTitle>
            <CardDescription>{t("auth.codeSubtitle", { phone: formatSlPhone(phone) })}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <OtpInput value={code} onChange={setCode} onComplete={verify} disabled={pending} autoFocus aria-label={t("auth.codeLabel")} />
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            <Button className="w-full" size="lg" disabled={pending || code.length !== 6} onClick={() => verify()}>
              {pending ? <Loader2Icon className="animate-spin" /> : null}
              {t("auth.verify")}
            </Button>
            <div className="flex items-center justify-between text-sm">
              <Button variant="link" className="px-0" onClick={() => setStep("phone")}>
                {t("auth.changeNumber")}
              </Button>
              <Button variant="link" className="px-0" disabled={cooldown > 0 || pending} onClick={sendCode}>
                {cooldown > 0 ? t("auth.resendIn", { seconds: cooldown }) : t("auth.resend")}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">{t("auth.errors.noAccount")}</p>
            {demoCode ? (
              <Alert variant="info">
                <InfoIcon />
                <AlertDescription>{t("auth.demoHint", { code: demoCode })}</AlertDescription>
              </Alert>
            ) : showDevHint ? (
              <Alert variant="info">
                <InfoIcon />
                <AlertDescription>{t("auth.devHint")}</AlertDescription>
              </Alert>
            ) : null}
          </CardContent>
        </>
      )}
    </Card>
  );
}
