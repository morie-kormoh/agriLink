import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ArrowLeftIcon } from "lucide-react";
import { formatVoucherCode } from "@agrilink/finance";
import { Card, CardContent, CardHeader, CardTitle } from "@agrilink/ui/components/card";
import { Field, PageHeader, StatusBadge } from "@agrilink/ui/components/blocks";
import { formatLe } from "@agrilink/validation";
import { toneFor } from "@/components/finance/score-dial";
import { DecisionButtons, ServicingForms } from "@/components/lender/lender-client";
import { Terms } from "@/components/finance/loans-client";
import { requirePortal } from "@/server/auth/actor";
import { getLoan } from "@/server/credit/loans";
import { notFoundOn404 } from "@/server/page-helpers";

const fmt = (d: Date | null) =>
  d ? d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { actor } = await requirePortal("/lender");
  const t = await getTranslations();
  const { id } = await params;
  const {
    loan: l,
    outstandingLe,
    daysPastDue,
    canDefault,
    timeline,
  } = await notFoundOn404(() => getLoan(actor, id));
  const open = ["DISBURSED", "REPAYING", "LATE", "RESTRUCTURED", "DEFAULTED"].includes(l.status);
  const disc = l.disclosure as { lines: string[] } | null;
  return (
    <>
      <Link
        href="/lender/loans"
        className="text-muted-foreground hover:text-foreground mb-3 inline-flex items-center gap-1 text-sm"
      >
        <ArrowLeftIcon className="size-4" /> {t("nav.allLoans")}
      </Link>
      <PageHeader
        title={`${l.ref} · ${l.farmer.fullName}`}
        description={`${l.product.name} · ${l.farmer.agrilinkId} · ${l.farmer.district.name}`}
        actions={
          <>
            <StatusBadge tone={toneFor(l.status)}>{t(`loanStatus.${l.status}`)}</StatusBadge>
            {daysPastDue > 0 && open ? (
              <StatusBadge tone="warning">
                {t("lender.daysPastDue", { n: daysPastDue })}
              </StatusBadge>
            ) : null}
          </>
        }
      />
      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-6">
          <Card>
            <CardContent className="grid gap-4 pt-6 sm:grid-cols-4">
              <Field label={t("credit.amount")}>
                {formatLe((l.approvedLe ?? l.requestedLe).toFixed(2))}
              </Field>
              <Field label={t("lender.fee")}>
                {l.feeLe ? formatLe(l.feeLe.toFixed(2)) : `${l.product.flatFeePct.toString()}%`}
              </Field>
              <Field label={t("credit.repaid")}>{formatLe(l.repaidLe.toFixed(2))}</Field>
              <Field label={t("credit.owed")}>{formatLe(outstandingLe)}</Field>
              <Field label={t("credit.due", { date: "" }).trim()}>{fmt(l.dueDate)}</Field>
              <Field label={t("lender.band")}>
                {l.bandAtApplication
                  ? `${t(`band.${l.bandAtApplication}`)} (${l.scoreAtApplication})`
                  : "—"}
              </Field>
              <Field label={t("credit.voucher")}>
                {l.voucher
                  ? `${formatVoucherCode(l.voucher.code)} · ${t(`voucherStatus.${l.voucher.status}`)}`
                  : "—"}
              </Field>
              <Field label={t("groups.title")}>{l.group?.name ?? "—"}</Field>
            </CardContent>
          </Card>
          {["APPLIED", "ACCEPTED", "OFFERED"].includes(l.status) ? (
            <Card>
              <CardContent className="pt-6">
                <DecisionButtons loanId={l.id} canApprove={l.status !== "OFFERED"} />
              </CardContent>
            </Card>
          ) : null}
          {open ? (
            <ServicingForms
              loanId={l.id}
              isAdmin={actor.role === "LENDER_ADMIN"}
              canDefault={canDefault}
            />
          ) : null}
          {disc ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t("credit.terms")}</CardTitle>
              </CardHeader>
              <CardContent>
                <Terms
                  lines={disc.lines}
                  note={
                    l.disclosureAcceptedAt
                      ? `PIN · ${l.disclosureAcceptedAt.toLocaleString("en-GB")}`
                      : undefined
                  }
                />
              </CardContent>
            </Card>
          ) : null}
        </div>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("credit.history")}</CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="relative space-y-4 border-l pl-5">
              {timeline.map((e, i) => (
                <li key={i} className="text-sm">
                  <span className="border-background bg-primary absolute -left-1.5 mt-1.5 size-3 rounded-full border-2" />
                  <p className="font-medium">{t(`credit.timeline.${e.key}` as never)}</p>
                  <p className="text-muted-foreground text-xs">
                    {e.at.toLocaleString("en-GB")}
                    {e.detail ? ` · ${e.detail}` : ""}
                  </p>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
