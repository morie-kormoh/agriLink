import { getTranslations } from "next-intl/server";
import { formatVoucherCode } from "@agrilink/finance";
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
import type { dealerRedemptions } from "@/server/credit/dealers";

type Items = Awaited<ReturnType<typeof dealerRedemptions>>["items"];

export async function SettlementsTable({ items }: { items: Items }) {
  const t = await getTranslations("dealer");
  const tg = await getTranslations();
  return (
    <div className="bg-card overflow-x-auto rounded-xl border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{tg("common.ref")}</TableHead>
            <TableHead>{t("farmer")}</TableHead>
            <TableHead>{t("items")}</TableHead>
            <TableHead className="text-right">Le</TableHead>
            <TableHead>{t("settlements")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.length === 0 ? (
            <TableRow>
              <TableCell colSpan={5} className="text-muted-foreground h-16 text-center">
                {t("noRedemptions")}
              </TableCell>
            </TableRow>
          ) : (
            items.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="text-xs">
                  {r.ref}
                  <br />
                  <span className="text-muted-foreground">
                    {r.createdAt.toLocaleString("en-GB")}
                  </span>
                </TableCell>
                <TableCell>
                  {r.voucher.farmer.fullName}
                  <p className="text-muted-foreground font-mono text-xs">
                    {formatVoucherCode(r.voucher.code)}
                  </p>
                </TableCell>
                <TableCell className="text-xs">
                  {(r.items as { name: string; qty: number }[])
                    .map((i) => `${i.name} ×${i.qty}`)
                    .join(", ")}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatLe(r.amountLe.toFixed(2))}
                </TableCell>
                <TableCell>
                  <StatusBadge tone={r.settledAt ? "success" : "warning"}>
                    {r.settledAt ? `${t("settled")} · ${r.payment?.ref ?? ""}` : t("pending")}
                  </StatusBadge>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
