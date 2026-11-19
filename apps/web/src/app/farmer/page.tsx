import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ChevronRightIcon, GaugeIcon, KeyRoundIcon, PiggyBankIcon, TicketIcon } from "lucide-react";
import { prisma } from "@agrilink/db";
import { Button } from "@agrilink/ui/components/button";
import { Alert, AlertDescription, AlertTitle } from "@agrilink/ui/components/misc";
import { MoneyCard, MoneyFigure } from "@agrilink/ui/components/money";
import { BAND_TEXT } from "@agrilink/ui/components/passport-dial";
import { SplitRibbon } from "@agrilink/ui/components/split-ribbon";
import { cn } from "@agrilink/ui/lib/utils";
import { FarmerProfile } from "@/components/farmers/farmer-profile";
import { formatDateTime, formatLe } from "@/lib/format";
import { requirePortal } from "@/server/auth/actor";
import { getFarmerOr404 } from "@/server/farmers/page-helpers";
import { currentScore } from "@/server/passport/service";
import { farmerStatement } from "@/server/payments/service";

/** Farmer home (docs/ui §6.1): balance, the last payment as a Split Ribbon, then three tiles. */
export default async function FarmerHome() {
  const { actor, user } = await requirePortal("/farmer");
  const t = await getTranslations();
  const farmerId = actor.farmerId ?? "";
  const farmer = await getFarmerOr404(actor, farmerId);
  const [statement, score, savings, voucher] = await Promise.all([
    farmerStatement(actor, farmerId),
    currentScore(prisma, farmerId).catch(() => null),
    prisma.savingsAccount.aggregate({ where: { farmerId }, _sum: { balanceLe: true } }),
    prisma.inputVoucher.findFirst({
      where: { loan: { farmerId }, status: { in: ["ISSUED", "PARTIALLY_REDEEMED"] } },
      orderBy: { issuedAt: "desc" },
    }),
  ]);
  const last = statement.payments.find((p) => p.purchase && p.splits.length > 0);
  const floorApplied =
    !!last?.explanation &&
    typeof last.explanation === "object" &&
    (last.explanation as { floorApplied?: boolean }).floorApplied === true;
  const labels = Object.fromEntries(
    ["LOAN_REPAYMENT", "SAVINGS", "COOP_DUES", "INSURANCE_PREMIUM", "DEALER_SETTLEMENT"].map(
      (k) => [k, t(`splitShort.${k}`)],
    ),
  );
  const firstName = (farmer.fullName ?? user.name ?? "").split(" ")[0] ?? "";
  const voucherLeft = voucher ? Number(voucher.remainingLe) : null;

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      {!user.pinSet ? (
        <Alert variant="warning">
          <KeyRoundIcon />
          <AlertTitle>{t("security.pinNotSet")}</AlertTitle>
          <AlertDescription>
            <p>{t("security.pinBody")}</p>
            <Button asChild size="sm" className="mt-2">
              <Link href="/settings/security">{t("security.savePin")}</Link>
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}

      <h1 className="font-display text-ink text-3xl font-bold dark:text-white">
        {t("home.hello", { name: firstName })}
      </h1>

      <MoneyCard tone="indigo">
        <p className="text-sm text-white/75">{t("home.received")}</p>
        <MoneyFigure amountLe={statement.totalReceivedLe} className="mt-1" />
        <p className="mt-2 font-mono text-sm tracking-wider text-white/70">{farmer.agrilinkId}</p>
      </MoneyCard>

      <section className="bg-card rounded-[var(--radius-money)] border p-5">
        <div className="mb-3 flex items-baseline justify-between gap-2">
          <h2 className="text-lg font-bold">{t("home.lastPayment")}</h2>
          <Link
            href="/farmer/payments"
            className="text-primary flex items-center text-sm font-semibold"
          >
            {t("home.seeAll")} <ChevronRightIcon className="size-4" aria-hidden />
          </Link>
        </div>
        {last ? (
          <>
            <p className="mb-1 text-sm">
              {t("home.paidBy", {
                buyer: last.purchase?.buyerOrg.name ?? "",
                amount: formatLe(last.grossLe.toString()),
              })}
            </p>
            <p className="text-muted-foreground mb-4 text-xs">
              {last.purchase
                ? `${last.purchase.quantity.toString()} ${last.purchase.unit} ${last.purchase.crop.name} · `
                : ""}
              {formatDateTime(last.createdAt)}
            </p>
            <SplitRibbon
              animate
              size="lg"
              grossLe={last.grossLe.toString()}
              splits={last.splits.map((s) => ({ type: s.type, amountLe: s.amountLe.toString() }))}
              labels={labels}
              farmerLabel={t("splitShort.FARMER_WALLET")}
              floorApplied={floorApplied}
              floorNote={t("home.floor")}
            />
          </>
        ) : (
          <p className="text-muted-foreground text-sm">{t("home.noPayment")}</p>
        )}
      </section>

      <div className="grid grid-cols-3 gap-3">
        <Tile
          href="/farmer/savings"
          icon={<PiggyBankIcon className="text-[#9a6a00]" />}
          label={t("home.saved")}
        >
          <span className="tabular-nums">{formatLe((savings._sum.balanceLe ?? 0).toString())}</span>
        </Tile>
        <Tile
          href="/farmer/passport"
          icon={<GaugeIcon className="text-teal" />}
          label={t("home.passport")}
        >
          {score ? (
            <span className={cn(BAND_TEXT[score.band])}>
              {score.score} · {t(`band.${score.band}`)}
            </span>
          ) : (
            "—"
          )}
        </Tile>
        <Tile
          href="/farmer/loans"
          icon={<TicketIcon className="text-indigo dark:text-white" />}
          label={t("home.voucher")}
        >
          {voucherLeft != null ? (
            <span className="tabular-nums">
              {t("home.left", { amount: formatLe(voucherLeft.toFixed(2)) })}
            </span>
          ) : (
            <span className="text-muted-foreground font-medium">{t("home.noVoucher")}</span>
          )}
        </Tile>
      </div>

      <section className="pt-4">
        <h2 className="mb-3 text-lg font-bold">{t("home.myDetails")}</h2>
        <FarmerProfile farmer={farmer} actor={actor} />
      </section>
    </div>
  );
}

function Tile({
  href,
  icon,
  label,
  children,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="bg-card hover:border-indigo/40 flex min-h-28 flex-col justify-between gap-2 rounded-xl border p-3 transition-colors [&_svg]:size-6"
    >
      {icon}
      <span>
        <span className="text-muted-foreground block text-xs">{label}</span>
        <span className="block text-sm leading-tight font-bold">{children}</span>
      </span>
    </Link>
  );
}
