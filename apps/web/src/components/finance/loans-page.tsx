import { getTranslations } from "next-intl/server";
import {
  BanknoteIcon,
  CheckIcon,
  HandCoinsIcon,
  ShieldCheckIcon,
  StoreIcon,
  XIcon,
} from "lucide-react";
import { formatVoucherCode } from "@agrilink/finance";
import { VoucherTicket } from "@agrilink/ui/components/voucher-ticket";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@agrilink/ui/components/card";
import { EmptyState, PageHeader, StatusBadge } from "@agrilink/ui/components/blocks";
import { Alert, AlertDescription, Progress } from "@agrilink/ui/components/misc";
import { formatLe } from "@agrilink/validation";
import type { Actor } from "@agrilink/validation/permissions";
import {
  acceptOfferAction,
  acceptRestructureAction,
  cancelLoanAction,
} from "@/app/actions/finance";
import { farmerLoanOverview } from "@/server/credit/loans";
import { ApplyForm, Terms } from "./loans-client";
import { PinConfirm } from "./pin-confirm";
import { toneFor } from "./score-dial";

const fmt = (d: Date | null | undefined) =>
  d ? d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—";

export async function LoansPage({ actor }: { actor: Actor }) {
  const t = await getTranslations();
  const o = await farmerLoanOverview(actor);
  const offers = o.loans.filter((l) => l.status === "OFFERED");
  const active = o.loans.filter((l) =>
    [
      "APPLIED",
      "ACCEPTED",
      "APPROVED",
      "DISBURSED",
      "REPAYING",
      "LATE",
      "RESTRUCTURED",
      "DEFAULTED",
    ].includes(l.status),
  );
  const past = o.loans.filter((l) => !offers.includes(l) && !active.includes(l));

  return (
    <>
      <PageHeader title={t("credit.title")} description={t("credit.subtitle")} />
      <Alert className="mb-6">
        <ShieldCheckIcon />
        <AlertDescription>{t("credit.responsible")}</AlertDescription>
      </Alert>

      <div className="space-y-6">
        {offers.map((l) => {
          const d = l.disclosure as { lines: string[] } | null;
          return (
            <Card key={l.id} className="border-sky-300">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <HandCoinsIcon className="text-primary size-4" /> {t("credit.offers")}:{" "}
                  {l.product.lenderOrg.name}
                </CardTitle>
                <CardDescription>{l.ref}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {d ? <Terms lines={d.lines} /> : null}
                <div className="flex gap-2">
                  <PinConfirm
                    label={t("credit.accept")}
                    icon={<CheckIcon />}
                    title={t("credit.accept")}
                    action={acceptOfferAction.bind(null, l.id)}
                    successMessage={t("credit.offerAccepted")}
                  >
                    {d ? <Terms lines={d.lines} /> : null}
                  </PinConfirm>
                  <PinConfirm
                    label={t("credit.cancel")}
                    icon={<XIcon />}
                    variant="outline"
                    title={t("credit.cancel")}
                    action={cancelLoanAction.bind(null, l.id)}
                  />
                </div>
              </CardContent>
            </Card>
          );
        })}

        {active.map((l) => {
          const owed = Number(l.outstandingLe);
          const total = Number(l.totalDueLe ?? 0);
          const v = l.voucher;
          const coolingOff =
            l.status === "DISBURSED" &&
            l.coolingOffUntil &&
            l.coolingOffUntil > new Date() &&
            v &&
            v.remainingLe.equals(v.valueLe);
          const restructure = l.pendingRestructure as { dueDate: string; reason: string } | null;
          return (
            <Card key={l.id}>
              <CardHeader>
                <CardTitle className="flex flex-wrap items-center gap-2">
                  <BanknoteIcon className="text-indigo size-4 dark:text-white" />{" "}
                  {t("credit.myLoan")}: {l.product.name}
                  <StatusBadge tone={toneFor(l.status)}>{t(`loanStatus.${l.status}`)}</StatusBadge>
                </CardTitle>
                <CardDescription>
                  {l.product.lenderOrg.name} · {l.ref}
                  {l.dueDate ? ` · ${t("credit.due", { date: fmt(l.dueDate) })}` : ""}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {total > 0 ? (
                  <div className="space-y-1">
                    <div className="flex justify-between text-sm">
                      <span>
                        {t("credit.repaid")}:{" "}
                        <b className="tabular-nums">{formatLe(l.repaidLe.toFixed(2))}</b>
                      </span>
                      <span>
                        {t("credit.owed")}:{" "}
                        <b className="tabular-nums">{formatLe(l.outstandingLe)}</b>
                      </span>
                    </div>
                    <Progress value={total ? ((total - owed) / total) * 100 : 0} />
                  </div>
                ) : null}
                {v && (v.status === "ISSUED" || v.status === "PARTIALLY_REDEEMED") ? (
                  <VoucherTicket
                    code={formatVoucherCode(v.code)}
                    title={t("credit.voucher")}
                    issuer={l.product.lenderOrg.name}
                    remaining={
                      <>
                        {t("credit.left")}:{" "}
                        <b className="tabular-nums">{formatLe(v.remainingLe.toFixed(2))}</b> /{" "}
                        {formatLe(v.valueLe.toFixed(2))}
                      </>
                    }
                    validUntil={t("credit.validUntil", { date: fmt(v.expiresAt) })}
                    note={t("credit.voucherHint")}
                  >
                    {o.dealers.length ? (
                      <div className="text-sm">
                        <p className="flex items-center gap-1 font-medium">
                          <StoreIcon className="size-4" /> {t("credit.where")}
                        </p>
                        <ul className="text-muted-foreground mt-1 space-y-0.5">
                          {o.dealers.map((d) => (
                            <li key={d.id}>
                              {d.org.name} · {d.district.name}
                              {d.org.phone ? ` · ${d.org.phone}` : ""}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                  </VoucherTicket>
                ) : null}
                {v?.redemptions.length ? (
                  <ul className="space-y-1 text-sm">
                    {v.redemptions.map((r) => (
                      <li key={r.id} className="flex justify-between">
                        <span>
                          {fmt(r.createdAt)} · {r.dealer.org.name}
                        </span>
                        <span className="tabular-nums">{formatLe(r.amountLe.toFixed(2))}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
                {restructure ? (
                  <Alert>
                    <AlertDescription className="space-y-2">
                      <p>
                        {t("credit.restructure")}: <b>{fmt(new Date(restructure.dueDate))}</b> —{" "}
                        {restructure.reason}
                      </p>
                      <PinConfirm
                        label={t("credit.acceptRestructure")}
                        size="sm"
                        title={t("credit.acceptRestructure")}
                        action={acceptRestructureAction.bind(null, l.id)}
                      />
                    </AlertDescription>
                  </Alert>
                ) : null}
                {coolingOff || ["APPLIED", "ACCEPTED"].includes(l.status) ? (
                  <div className="flex flex-wrap items-center gap-3">
                    <PinConfirm
                      label={t("credit.cancel")}
                      icon={<XIcon />}
                      variant="outline"
                      size="sm"
                      title={t("credit.cancel")}
                      action={cancelLoanAction.bind(null, l.id)}
                    />
                    {coolingOff ? (
                      <span className="text-muted-foreground text-xs">
                        {t("credit.cancelHint", {
                          time: l.coolingOffUntil!.toLocaleString("en-GB"),
                        })}
                      </span>
                    ) : null}
                  </div>
                ) : null}
              </CardContent>
            </Card>
          );
        })}

        {!active.length ? (
          <section className="space-y-3">
            <h2 className="text-lg font-semibold">{t("nav.products")}</h2>
            {o.products.length === 0 ? (
              <EmptyState icon={HandCoinsIcon} title={t("credit.noLoans")} />
            ) : null}
            <div className="grid gap-4 md:grid-cols-2">
              {o.products.map(({ product: p, eligibility: e }) => (
                <Card key={p.id}>
                  <CardHeader>
                    <CardTitle>{p.name}</CardTitle>
                    <CardDescription>
                      {p.lenderOrg.name} · {t("lender.fee")}: {p.flatFeePct.toString()}% ·{" "}
                      {t("lender.repayCap")}: {p.maxRepaymentPctPerSale.toString()}%
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {p.description ? (
                      <p className="text-muted-foreground text-sm">{p.description}</p>
                    ) : null}
                    {e.eligible ? (
                      <>
                        <p className="text-sm font-medium text-emerald-700">
                          {t("credit.eligible", { amount: formatLe(e.limitLe) })}
                        </p>
                        <ApplyForm
                          productId={p.id}
                          limitLe={e.limitLe}
                          minLe={e.minAmountLe}
                          lender={p.lenderOrg.name}
                        />
                      </>
                    ) : (
                      <div className="text-sm">
                        <p className="text-muted-foreground font-medium">
                          {t("credit.notEligible")}
                        </p>
                        <ul className="text-muted-foreground mt-1 list-disc pl-5">
                          {e.reasons.map((r) => (
                            <li key={r}>{t(`credit.reasons.${r}` as never)}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>
        ) : null}

        {past.length ? (
          <Card>
            <CardHeader>
              <CardTitle>{t("credit.history")}</CardTitle>
            </CardHeader>
            <CardContent className="divide-y text-sm">
              {past.map((l) => (
                <div key={l.id} className="flex items-center justify-between py-2">
                  <span>
                    {l.ref} · {l.product.name} · {fmt(l.createdAt)}
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="tabular-nums">
                      {formatLe((l.approvedLe ?? l.requestedLe).toFixed(2))}
                    </span>
                    <StatusBadge tone={toneFor(l.status)}>
                      {t(`loanStatus.${l.status}`)}
                    </StatusBadge>
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>
        ) : null}
      </div>
    </>
  );
}
