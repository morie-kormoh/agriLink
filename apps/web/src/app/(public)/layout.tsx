import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { SplitRibbon } from "@agrilink/ui/components/split-ribbon";
import { BrandMark } from "@/components/shell/brand-mark";
import { LanguageSwitcher } from "@/components/shell/language-switcher";

/** Sign-in, invite and context picker (docs/ui §6.7): indigo side panel with the gara motif on desktop. */
export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  const t = await getTranslations();
  return (
    <div className="flex min-h-dvh">
      <aside className="bg-indigo gara hidden w-[44%] max-w-xl flex-col justify-between p-10 text-white lg:flex">
        <Link href="/" className="font-display flex items-center gap-2.5 text-lg font-bold">
          <BrandMark className="size-9 rounded-[10px] ring-1 ring-white/15" />
          AgriLink
        </Link>
        <div className="space-y-8">
          <h2 className="font-display text-5xl leading-[1.05] font-extrabold">
            {t("login.panelTitle")}
          </h2>
          <div className="rounded-2xl bg-white/8 p-5 ring-1 ring-white/12 [&_.text-muted-foreground]:text-white/70">
            <SplitRibbon
              size="md"
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
        <p className="text-sm text-white/60">Sierra Leone FinTech Innovation Challenge 2026</p>
      </aside>

      <div className="bg-background flex min-h-dvh flex-1 flex-col">
        <header className="mx-auto flex w-full max-w-md items-center justify-between p-4">
          <Link href="/" className="font-display flex items-center gap-2 font-bold lg:invisible">
            <BrandMark className="size-8" />
            AgriLink
          </Link>
          <LanguageSwitcher className="w-auto" />
        </header>
        <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center p-4 pb-16">
          {children}
        </main>
      </div>
    </div>
  );
}
