import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { HandCoinsIcon, IdCardIcon, SproutIcon, WalletIcon } from "lucide-react";
import { Button } from "@agripay/ui/components/button";
import { LanguageSwitcher } from "@/components/shell/language-switcher";

export default async function LandingPage() {
  const t = await getTranslations();
  const features = [
    {
      icon: IdCardIcon,
      title: t("landing.featureRegister"),
      body: t("landing.featureRegisterBody"),
    },
    { icon: WalletIcon, title: t("landing.featurePay"), body: t("landing.featurePayBody") },
    {
      icon: HandCoinsIcon,
      title: t("landing.featureCredit"),
      body: t("landing.featureCreditBody"),
    },
  ];
  return (
    <div className="from-secondary to-background flex min-h-dvh flex-col bg-gradient-to-b">
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between p-4">
        <div className="flex items-center gap-2 font-semibold">
          <span className="bg-primary text-primary-foreground rounded-md p-1.5">
            <SproutIcon className="size-5" />
          </span>
          {t("common.appName")}
        </div>
        <LanguageSwitcher className="w-auto" />
      </header>
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col justify-center gap-10 p-6">
        <div className="max-w-2xl space-y-4">
          <p className="text-primary font-medium">{t("common.tagline")}</p>
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">{t("landing.headline")}</h1>
          <p className="text-muted-foreground text-lg">{t("landing.body")}</p>
          <Button asChild size="lg">
            <Link href="/login">{t("landing.signIn")}</Link>
          </Button>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          {features.map((f) => (
            <div key={f.title} className="bg-card rounded-xl border p-5 shadow-sm">
              <f.icon className="text-primary mb-3 size-6" />
              <p className="font-semibold">{f.title}</p>
              <p className="text-muted-foreground text-sm">{f.body}</p>
            </div>
          ))}
        </div>
      </main>
      <footer className="text-muted-foreground p-6 text-center text-xs">
        AgriPay Salone · Sierra Leone FinTech Innovation Challenge 2026
      </footer>
    </div>
  );
}
