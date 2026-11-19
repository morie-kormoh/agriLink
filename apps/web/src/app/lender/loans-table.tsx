import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { StatusBadge } from "@agrilink/ui/components/blocks";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@agrilink/ui/components/table";
import { formatLe } from "@agrilink/validation";
import { toneFor } from "@/components/finance/score-dial";
import { DecisionButtons } from "@/components/lender/lender-client";
import type { listLoans } from "@/server/credit/loans";

type Item = Awaited<ReturnType<typeof listLoans>>["items"][number];

export async function LoansTable({ items, decisions }: { items: Item[]; decisions?: boolean }) {
  const t = await getTranslations();
  return (
    <div className="bg-card overflow-x-auto rounded-xl border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Ref</TableHead>
            <TableHead>{t("lender.farmer")}</TableHead>
            <TableHead>{t("lender.product")}</TableHead>
            <TableHead>{t("lender.band")}</TableHead>
            <TableHead className="text-right">Le</TableHead>
            <TableHead className="text-right">{t("lender.outstandingNow")}</TableHead>
            <TableHead>{t("common.status")}</TableHead>
            {decisions ? <TableHead /> : null}
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.length === 0 ? (
            <TableRow>
              <TableCell colSpan={8} className="text-muted-foreground h-16 text-center">
                {t("common.noResults")}
              </TableCell>
            </TableRow>
          ) : (
            items.map((l) => (
              <TableRow key={l.id}>
                <TableCell>
                  <Link href={`/lender/loans/${l.id}`} className="font-medium hover:underline">
                    {l.ref}
                  </Link>
                  <p className="text-muted-foreground text-xs">
                    {l.createdAt.toLocaleDateString("en-GB")}
                  </p>
                </TableCell>
                <TableCell>
                  <p>{l.farmer.fullName}</p>
                  <p className="text-muted-foreground text-xs">
                    {l.farmer.agrilinkId} · {l.farmer.district.name}
                  </p>
                </TableCell>
                <TableCell>{l.product.name}</TableCell>
                <TableCell>
                  {l.bandAtApplication ? (
                    <StatusBadge tone={toneFor(l.bandAtApplication)}>
                      {t(`band.${l.bandAtApplication}`)} · {l.scoreAtApplication}
                    </StatusBadge>
                  ) : (
                    "—"
                  )}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatLe((l.approvedLe ?? l.requestedLe).toFixed(2))}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatLe(l.outstandingLe)}
                </TableCell>
                <TableCell>
                  <StatusBadge tone={toneFor(l.status)}>{t(`loanStatus.${l.status}`)}</StatusBadge>
                </TableCell>
                {decisions ? (
                  <TableCell>
                    <DecisionButtons loanId={l.id} canApprove={l.status !== "OFFERED"} />
                  </TableCell>
                ) : null}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
