import { getTranslations } from "next-intl/server";
import { ShoppingBasketIcon } from "lucide-react";
import { Badge } from "@agrilink/ui/components/badge";
import { EmptyState, PageHeader } from "@agrilink/ui/components/blocks";
import { Card, CardContent } from "@agrilink/ui/components/card";
import { SaleAck } from "@/components/farmers/sale-ack";
import { PurchaseStatus } from "@/components/trade/status-badges";
import { formatDateTime, formatLe } from "@/lib/format";
import { requirePortal } from "@/server/auth/actor";
import { listPurchases } from "@/server/trade/purchases";

export default async function FarmerSalesPage() {
  const { actor } = await requirePortal("/farmer");
  const t = await getTranslations();
  const { items } = await listPurchases(actor, { pageSize: 50 });
  const now = new Date();
  return (
    <>
      <PageHeader title={t("sales.title")} description={t("sales.subtitle")} />
      {items.length === 0 ? (
        <EmptyState icon={ShoppingBasketIcon} title={t("sales.none")} />
      ) : (
        <div className="space-y-3">
          {items.map((p) => {
            const canAck =
              !p.farmerAcknowledgedAt &&
              !p.disputedAt &&
              p.ackDeadline > now &&
              p.status !== "CANCELLED";
            return (
              <Card key={p.id} className="gap-3 py-4">
                <CardContent className="space-y-3 px-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold">
                        {p.quantity.toString()} {p.unit} {p.crop.name} ·{" "}
                        {formatLe(p.netLe.toString())}
                      </p>
                      <p className="text-muted-foreground text-sm">
                        {p.buyerOrg.name} · {formatDateTime(p.recordedAt)} · {p.ref}
                      </p>
                      {p.deductionsLe.gt(0) ? (
                        <p className="text-muted-foreground text-xs">
                          {t("trade.gross")} {formatLe(p.grossLe.toString())} −{" "}
                          {t("trade.deductions")} {formatLe(p.deductionsLe.toString())}
                        </p>
                      ) : null}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <PurchaseStatus status={p.status} />
                      {p.farmerAcknowledgedAt ? (
                        <Badge variant="success">{t("trade.farmerAck")}</Badge>
                      ) : null}
                    </div>
                  </div>
                  {p.disputedAt ? (
                    <p className="bg-secondary/50 rounded-md p-2 text-sm">
                      “{p.disputeReason}” {p.disputeResolution ? `→ ${p.disputeResolution}` : ""}
                    </p>
                  ) : null}
                  {canAck ? <SaleAck purchaseRef={p.ref} /> : null}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
