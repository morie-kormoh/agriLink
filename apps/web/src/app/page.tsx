import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { HandCoinsIcon, StoreIcon, UsersIcon, WheatIcon } from "lucide-react";
import { Button } from "@agrilink/ui/components/button";
import { SplitRibbon } from "@agrilink/ui/components/split-ribbon";
import { BrandMark } from "@/components/shell/brand-mark";
import { LanguageSwitcher } from "@/components/shell/language-switcher";

/**
 * Landing page (docs/ui §6.6). The hero is the product itself: a real-looking payment splitting into
 * its parts, played once on load.
 */
export default async function LandingPage() {
  const t = await getTranslations();
  const steps = [
    t("landing.how1"),
    t("landing.how2"),
    t("landing.how3"),
    t("landing.how4"),
    t("landing.how5"),
  ];
  const who = [
    { icon: WheatIcon, title: t("landing.whoFarmer"), body: t("landing.whoFarmerBody") },
    { icon: UsersIcon, title: t("landing.whoCoop"), body: t("landing.whoCoopBody") },
    { icon: HandCoinsIcon, title: t("landing.whoLender"), body: t("landing.whoLenderBody") },
    { icon: StoreIcon, title: t("landing.whoDealer"), body: t("landing.whoDealerBody") },
  ];
  return (
    <div className="flex min-h-dvh flex-col">
      <section className="bg-indigo gara text-white">
        <header className="mx-auto flex w-full max-w-6xl items-center justify-between p-4 sm:px-6">
          <span className="font-display flex items-center gap-2.5 text-lg font-bold">
            <BrandMark className="size-9 rounded-[10px] ring-1 ring-white/15" />
            {t("common.appName")}
          </span>
          <div className="flex items-center gap-2">
            <LanguageSwitcher className="w-auto border-white/20 bg-white/10 text-white" />
            <Button
              asChild
              variant="ghost"
              className="text-white hover:bg-white/10 hover:text-white"
            >
              <Link href="/login">{t("landing.signIn")}</Link>
            </Button>
          </div>
        </header>

        <div className="mx-auto grid w-full max-w-6xl items-center gap-10 px-4 pt-8 pb-16 sm:px-6 lg:grid-cols-[1.1fr_1fr] lg:pt-16 lg:pb-24">
          <div className="space-y-6">
            <h1 className="font-display text-[2.75rem] leading-[1.05] font-extrabold tracking-tight sm:text-6xl">
              {t("landing.title")}
            </h1>
            <p className="max-w-xl text-lg text-white/80">{t("landing.lead")}</p>
            <div className="flex flex-wrap gap-3">
              <Button asChild size="lg" variant="accent">
                <Link href="/login">{t("landing.tryDemo")}</Link>
              </Button>
            </div>
          </div>

          {/* The split moment */}
          <div className="text-foreground rounded-[var(--radius-money)] bg-white p-6 shadow-[0_24px_60px_rgb(0_0_0/0.35)] dark:bg-[#181c3a]">
            <p className="text-muted-foreground text-sm">{t("landing.heroCaption")}</p>
            <p className="font-display text-ink mt-2 mb-5 text-5xl font-bold tabular-nums dark:text-white">
              <span className="mr-1 align-[0.35em] text-[0.45em] font-semibold">Le</span>4,000
            </p>
            <SplitRibbon
              animate
              size="lg"
              grossLe={4000}
              splits={[
                { type: "SAVINGS", amountLe: 600 },
                { type: "COOP_DUES", amountLe: 80 },
                { type: "FARMER_WALLET", amountLe: 3320 },
              ]}
              labels={{ SAVINGS: t("splitShort.SAVINGS"), COOP_DUES: t("splitShort.COOP_DUES") }}
              farmerLabel={t("home.to", { name: "Aminata" })}
            />
          </div>
        </div>
      </section>

      <main className="flex-1">
        <section className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6">
          <h2 className="text-3xl font-bold">{t("landing.howTitle")}</h2>
          <ol className="mt-8 grid gap-6 md:grid-cols-5">
            {steps.map((s, i) => (
              <li key={i} className="relative md:pr-4">
                <span className="font-display bg-gold text-ink flex size-10 items-center justify-center rounded-full text-lg font-bold">
                  {i + 1}
                </span>
                <p className="mt-3 text-base leading-snug">{s}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="bg-card border-y">
          <div className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6">
            <h2 className="text-3xl font-bold">{t("landing.whoTitle")}</h2>
            <div className="mt-8 grid gap-x-10 gap-y-8 sm:grid-cols-2">
              {who.map((w) => (
                <div key={w.title} className="flex gap-4">
                  <span className="bg-secondary text-indigo flex size-12 shrink-0 items-center justify-center rounded-xl dark:text-white">
                    <w.icon className="size-6" aria-hidden />
                  </span>
                  <div>
                    <h3 className="text-lg font-bold">{w.title}</h3>
                    <p className="text-muted-foreground mt-1">{w.body}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>

      <footer className="text-muted-foreground mx-auto w-full max-w-6xl px-4 py-8 text-sm sm:px-6">
        {t("landing.foot")}
      </footer>
    </div>
  );
}
