import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { EyeIcon } from "lucide-react";
import { Button } from "@agrilink/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@agrilink/ui/components/card";
import { PageHeader, StatusBadge } from "@agrilink/ui/components/blocks";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@agrilink/ui/components/table";
import { hasPermission } from "@agrilink/validation/permissions";
import { toneFor } from "@/components/finance/score-dial";
import { ConsentRequestForm, OfferForm } from "@/components/lender/lender-client";
import { requirePortal } from "@/server/auth/actor";
import { listLoanProducts } from "@/server/credit/products";
import { listConsentedFarmers, searchEligibleFarmers } from "@/server/passport/consent";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ product?: string }>;
}) {
  const { actor } = await requirePortal("/lender");
  const t = await getTranslations();
  const productId = (await searchParams).product;
  const products = (await listLoanProducts(actor)).filter((p) => p.active);
  const eligible = productId ? await searchEligibleFarmers(actor, productId) : null;
  const rows = eligible ? eligible.consented : await listConsentedFarmers(actor);
  const canOffer = hasPermission(actor.role, "loan.offer");
  return (
    <>
      <PageHeader title={t("lender.farmers")} description={t("lender.farmersSub")} />
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("lender.requestConsent")}</CardTitle>
          </CardHeader>
          <CardContent>
            <ConsentRequestForm />
          </CardContent>
        </Card>
        {products.length ? (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-muted-foreground">{t("lender.product")}:</span>
            <Button size="sm" variant={!productId ? "default" : "outline"} asChild>
              <Link href="/lender/farmers">All</Link>
            </Button>
            {products.map((p) => (
              <Button
                key={p.id}
                size="sm"
                variant={productId === p.id ? "default" : "outline"}
                asChild
              >
                <Link href={`/lender/farmers?product=${p.id}`}>{p.name}</Link>
              </Button>
            ))}
          </div>
        ) : null}
        {eligible?.anonymousEligible ? (
          <p className="text-muted-foreground text-sm">
            {t("lender.anonymous", { n: eligible.anonymousEligible })}
          </p>
        ) : null}
        {eligible?.suppressed ? (
          <p className="text-muted-foreground text-sm">{t("lender.anonymousFew")}</p>
        ) : null}
        <div className="bg-card overflow-x-auto rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("lender.farmer")}</TableHead>
                <TableHead>{t("lender.band")}</TableHead>
                <TableHead>{t("lender.scope")}</TableHead>
                <TableHead>{t("lender.loans")}</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-muted-foreground h-16 text-center">
                    {t("common.noResults")}
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((r) => (
                  <TableRow key={r.farmer.id}>
                    <TableCell>
                      <p className="font-medium">{r.farmer.fullName}</p>
                      <p className="text-muted-foreground text-xs">
                        {r.farmer.agrilinkId} · {r.farmer.district.name}
                      </p>
                    </TableCell>
                    <TableCell>
                      {r.score ? (
                        <StatusBadge
                          tone={toneFor(r.score.band)}
                        >{`${t(`band.${r.score.band}`)} · ${r.score.score}`}</StatusBadge>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell className="text-xs">
                      {t(`consentScope.${r.consent.scope}`)}
                      <br />
                      <span className="text-muted-foreground">
                        → {r.consent.expiresAt?.toLocaleDateString("en-GB")}
                      </span>
                    </TableCell>
                    <TableCell>
                      {r.lastLoan ? (
                        <StatusBadge
                          tone={toneFor(r.lastLoan.status)}
                        >{`${r.lastLoan.ref} · ${t(`loanStatus.${r.lastLoan.status}`)}`}</StatusBadge>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell className="space-y-2">
                      <Button size="sm" variant="outline" asChild>
                        <Link href={`/lender/farmers/${r.farmer.id}`}>
                          <EyeIcon /> {t("lender.viewPassport")}
                        </Link>
                      </Button>
                      {canOffer ? (
                        <OfferForm
                          farmerId={r.farmer.id}
                          products={products.map((p) => ({ id: p.id, name: p.name }))}
                        />
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </>
  );
}
