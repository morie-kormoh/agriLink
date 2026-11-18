import { getTranslations } from "next-intl/server";
import { WalletIcon } from "lucide-react";
import { EmptyState, PageHeader, StatCard } from "@agripay/ui/components/blocks";
import { Card, CardContent } from "@agripay/ui/components/card";
import { PaymentStatus } from "@/components/trade/status-badges";
import { formatDateTime, formatLe } from "@/lib/format";
import { requirePortal } from "@/server/auth/actor";
import { farmerStatement } from "@/server/payments/service";

export default async function FarmerPaymentsPage() {
  const { actor } = await requirePortal("/farmer");
  const t = await getTranslations();
  const s = await farmerStatement(actor, actor.farmerId ?? "");
  return (
    <>
      <PageHeader title={t("payments.statementTitle")} />
      <StatCard
        className="mb-6"
        label={t("payments.totalReceived")}
        value={formatLe(s.totalReceivedLe)}
        icon={WalletIcon}
      />
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
                <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                  {p.splits.map((sp) => (
                    <li
                      key={sp.id}
                      className={sp.type === "FARMER_WALLET" ? "text-primary font-semibold" : ""}
                    >
                      {t(`splitType.${sp.type}`)}: {formatLe(sp.amountLe.toString())}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
