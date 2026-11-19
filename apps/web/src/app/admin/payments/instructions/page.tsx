import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { CheckCircle2Icon } from "lucide-react";
import { Badge } from "@agrilink/ui/components/badge";
import { EmptyState, PageHeader } from "@agrilink/ui/components/blocks";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@agrilink/ui/components/table";
import { formatDateTime, formatLe } from "@/lib/format";
import { requirePortal } from "@/server/auth/actor";
import { listInstructions } from "@/server/payments/service";
import { InstructionActions } from "./instruction-actions";

export default async function InstructionsPage() {
  const { actor } = await requirePortal("/admin");
  const t = await getTranslations();
  const rows = await listInstructions(actor);
  return (
    <>
      <PageHeader
        title={t("payments.instructionsTitle")}
        description="Failed, retrying and in-flight transfers to mobile money providers."
      />
      {rows.length === 0 ? (
        <EmptyState icon={CheckCircle2Icon} title="Nothing pending or failed." />
      ) : (
        <div className="bg-card overflow-hidden rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("payments.ref")}</TableHead>
                <TableHead>Provider</TableHead>
                <TableHead>To</TableHead>
                <TableHead className="text-right">{t("payments.amount")}</TableHead>
                <TableHead>{t("payments.status")}</TableHead>
                <TableHead className="text-right">{t("payments.attempts")}</TableHead>
                <TableHead>{t("payments.lastError")}</TableHead>
                <TableHead>{t("payments.nextAttempt")}</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>
                    <Link
                      className="text-primary font-mono text-xs underline"
                      href={`/admin/payments/${r.split.payment.id}`}
                    >
                      {r.split.payment.ref}
                    </Link>
                    <p className="text-muted-foreground text-xs">
                      {t(`splitType.${r.split.type}`)}
                    </p>
                  </TableCell>
                  <TableCell>{r.provider}</TableCell>
                  <TableCell className="font-mono text-xs">{r.toAccount}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatLe(r.amountLe.toString())}
                  </TableCell>
                  <TableCell>
                    <Badge variant={r.status === "FAILED" ? "destructive" : "warning"}>
                      {r.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">{r.attempts}</TableCell>
                  <TableCell className="text-destructive max-w-56 truncate text-xs">
                    {r.lastError ?? ""}
                  </TableCell>
                  <TableCell className="text-xs">
                    {r.status === "FAILED" ? "—" : formatDateTime(r.nextAttemptAt)}
                  </TableCell>
                  <TableCell>
                    <InstructionActions id={r.id} status={r.status} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </>
  );
}
