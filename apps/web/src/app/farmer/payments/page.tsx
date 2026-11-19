import { getTranslations } from "next-intl/server";
import { WalletIcon } from "lucide-react";
import { EmptyState, PageHeader } from "@agrilink/ui/components/blocks";
import { MoneyCard, MoneyFigure } from "@agrilink/ui/components/money";
import { SplitRibbon } from "@agrilink/ui/components/split-ribbon";
import { Card, CardContent } from "@agrilink/ui/components/card";
import { PaymentStatus } from "@/components/trade/status-badges";
import { formatDateTime, formatLe } from "@/lib/format";
import { requirePortal } from "@/server/auth/actor";
import { farmerStatement } from "@/server/payments/service";

export default async function FarmerPaymentsPage() {
  const { actor } = await requirePortal("/farmer");
  const t = await getTranslations();
  const s = await farmerStatement(actor, actor.farmerId ?? "");
  const labels = Object.fromEntries(
    [
      "LOAN_REPAYMENT",
      "SAVINGS",
      "COOP_DUES",
      "INSURANCE_PREMIUM",
      "DEALER_SETTLEMENT",
      "FARMER_WALLET",
    ].map((k) => [k, t(`splitShort.${k}`)]),
  );
  return (
    <>
      <PageHeader title={t("payments.statementTitle")} />
      <MoneyCard tone="indigo" className="mb-6">
        <p className="text-sm text-white/75">{t("payments.totalReceived")}</p>
        <MoneyFigure amountLe={s.totalReceivedLe} className="mt-1" />
      </MoneyCard>
      {s.payments.length === 0 ? (
        <EmptyState icon={WalletIcon} title={t("payments.noPayments")} />
      ) : (
        <div className="space-y-3">
          {s.payments.map((p) => (
            <Card key={p.id} className="gap-2 py-4">
              <CardContent className="space-y-2 px-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-semibold">
                    {formatLe(p.grossLe.toString())} · {p.purchase?.buyerOrg.name}
                  </p>
                  <PaymentStatus status={p.status} />
                </div>
                <p className="text-muted-foreground text-sm">
                  {p.purchase
                    ? `${p.purchase.quantity.toString()} ${p.purchase.unit} ${p.purchase.crop.name} · `
                    : ""}
                  {formatDateTime(p.createdAt)} · {p.ref}
                </p>
                <SplitRibbon
                  className="pt-1"
                  grossLe={p.grossLe.toString()}
                  splits={p.splits.map((sp) => ({
                    type: sp.type,
                    amountLe: sp.amountLe.toString(),
                  }))}
                  labels={labels}
                  farmerLabel={labels.FARMER_WALLET}
                />
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
