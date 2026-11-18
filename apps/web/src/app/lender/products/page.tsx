import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { PlusIcon } from "lucide-react";
import { Button } from "@agripay/ui/components/button";
import { PageHeader, StatusBadge } from "@agripay/ui/components/blocks";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@agripay/ui/components/table";
import { formatLe } from "@agripay/validation";
import { hasPermission } from "@agripay/validation/permissions";
import { requirePortal } from "@/server/auth/actor";
import { listLoanProducts } from "@/server/credit/products";

export default async function Page() {
  const { actor } = await requirePortal("/lender");
  const t = await getTranslations();
  const products = await listLoanProducts(actor);
  return (
    <>
      <PageHeader
        title={t("lender.products")}
        actions={
          hasPermission(actor.role, "loanProduct.manage") ? (
            <Button asChild>
              <Link href="/lender/products/new">
                <PlusIcon /> {t("lender.newProduct")}
              </Link>
            </Button>
          ) : null
        }
      />
      <div className="bg-card overflow-hidden rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("lender.productName")}</TableHead>
              <TableHead>{t("lender.minBand")}</TableHead>
              <TableHead className="text-right">{t("lender.firstCycleMax")}</TableHead>
              <TableHead className="text-right">{t("lender.maxAmount")}</TableHead>
              <TableHead className="text-right">{t("lender.fee")}</TableHead>
              <TableHead className="text-right">{t("lender.repayCap")}</TableHead>
              <TableHead className="text-right">{t("lender.loans")}</TableHead>
              <TableHead>{t("common.status")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {products.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-muted-foreground h-16 text-center">
                  {t("common.noResults")}
                </TableCell>
              </TableRow>
            ) : (
              products.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>
                    <Link href={`/lender/products/${p.id}`} className="font-medium hover:underline">
                      {p.name}
                    </Link>
                  </TableCell>
                  <TableCell>{t(`band.${p.minBand}`)}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatLe(p.firstCycleMaxLe.toFixed(2))}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatLe(p.maxAmountLe.toFixed(2))}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {p.flatFeePct.toString()}%
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {p.maxRepaymentPctPerSale.toString()}%
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{p._count.loans}</TableCell>
                  <TableCell>
                    <StatusBadge tone={p.active ? "success" : "muted"}>
                      {p.active ? t("lender.activeProduct") : "—"}
                    </StatusBadge>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
