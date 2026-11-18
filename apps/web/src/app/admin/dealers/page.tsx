import { getTranslations } from "next-intl/server";
import { PageHeader, StatusBadge } from "@agripay/ui/components/blocks";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@agripay/ui/components/table";
import { VerifyDealerButton } from "@/components/dealer/dealer-client";
import { requirePortal } from "@/server/auth/actor";
import { listDealersForAdmin } from "@/server/credit/dealers";

export default async function Page() {
  const { actor } = await requirePortal("/admin");
  const t = await getTranslations();
  const dealers = await listDealersForAdmin(actor);
  return (
    <>
      <PageHeader title={t("adminDealers.title")} />
      <div className="bg-card overflow-x-auto rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("adminDealers.title")}</TableHead>
              <TableHead>{t("dealer.district")}</TableHead>
              <TableHead>{t("dealer.payoutMsisdn")}</TableHead>
              <TableHead className="text-right">{t("dealer.catalogue")}</TableHead>
              <TableHead className="text-right">{t("dealer.redeemedTotal")}</TableHead>
              <TableHead>{t("common.status")}</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {dealers.map((d) => (
              <TableRow key={d.id}>
                <TableCell className="font-medium">{d.org.name}</TableCell>
                <TableCell>{d.district.name}</TableCell>
                <TableCell className="text-xs">
                  {d.payoutMsisdn} · {t(`providers.${d.payoutProvider}`)}
                </TableCell>
                <TableCell className="text-right tabular-nums">{d._count.catalogue}</TableCell>
                <TableCell className="text-right tabular-nums">{d._count.redemptions}</TableCell>
                <TableCell>
                  <StatusBadge tone={d.verified ? "success" : "warning"}>
                    {d.verified ? t("dealer.verified") : t("dealer.notVerified")}
                  </StatusBadge>
                </TableCell>
                <TableCell>
                  <VerifyDealerButton id={d.id} verified={d.verified} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
