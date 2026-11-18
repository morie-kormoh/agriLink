import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ArrowLeftIcon } from "lucide-react";
import { prisma } from "@agripay/db";
import { Card, CardContent } from "@agripay/ui/components/card";
import { PageHeader } from "@agripay/ui/components/blocks";
import type { Actor } from "@agripay/validation/permissions";
import { ProductForm, type ProductFormValue } from "@/components/lender/lender-client";
import { getLoanProduct } from "@/server/credit/products";
import { listVerifiedDealers } from "@/server/credit/dealers";

const EMPTY: ProductFormValue = {
  name: "",
  description: "",
  minAmountLe: "500",
  firstCycleMaxLe: "1000",
  maxAmountLe: "3000",
  graduationPct: "50",
  flatFeePct: "10",
  minBand: "FAIR",
  maxDebtToIncomePct: "40",
  maxRepaymentPctPerSale: "50",
  dueMonthDay: "",
  voucherValidDays: "60",
  allowedCategories: ["SEED", "FERTILISER"],
  eligibleDealerIds: [],
  cropIds: [],
  districtIds: [],
  requiresGroupGuarantee: false,
  active: true,
};

export async function ProductEditor({ actor, id }: { actor: Actor; id?: string }) {
  const t = await getTranslations();
  const [crops, districts, dealers, p] = await Promise.all([
    prisma.crop.findMany({
      where: { active: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.district.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    listVerifiedDealers(),
    id ? getLoanProduct(actor, id) : null,
  ]);
  const initial: ProductFormValue = p
    ? {
        name: p.name,
        description: p.description ?? "",
        minAmountLe: p.minAmountLe.toFixed(2),
        firstCycleMaxLe: p.firstCycleMaxLe.toFixed(2),
        maxAmountLe: p.maxAmountLe.toFixed(2),
        graduationPct: p.graduationPct.toString(),
        flatFeePct: p.flatFeePct.toString(),
        minBand: p.minBand,
        maxDebtToIncomePct: p.maxDebtToIncomePct.toString(),
        maxRepaymentPctPerSale: p.maxRepaymentPctPerSale.toString(),
        dueMonthDay: p.dueMonthDay ?? "",
        voucherValidDays: String(p.voucherValidDays),
        allowedCategories: p.allowedCategories,
        eligibleDealerIds: p.eligibleDealerIds,
        cropIds: p.cropIds,
        districtIds: p.districtIds,
        requiresGroupGuarantee: p.requiresGroupGuarantee,
        active: p.active,
      }
    : EMPTY;
  return (
    <>
      <Link
        href="/lender/products"
        className="text-muted-foreground hover:text-foreground mb-3 inline-flex items-center gap-1 text-sm"
      >
        <ArrowLeftIcon className="size-4" /> {t("lender.products")}
      </Link>
      <PageHeader title={p ? `${t("lender.editProduct")}: ${p.name}` : t("lender.newProduct")} />
      <Card>
        <CardContent className="pt-6">
          <ProductForm
            id={p?.id}
            initial={initial}
            crops={crops}
            districts={districts}
            dealers={dealers.map((d) => ({ id: d.id, name: `${d.org.name} · ${d.district.name}` }))}
          />
        </CardContent>
      </Card>
    </>
  );
}
