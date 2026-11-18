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
import { toneFor } from "@/components/finance/score-dial";
import { requirePortal } from "@/server/auth/actor";
import { listLenderConsents } from "@/server/passport/consent";

export default async function Page() {
  const { actor } = await requirePortal("/lender");
  const t = await getTranslations();
  const rows = await listLenderConsents(actor);
  return (
    <>
      <PageHeader title={t("lender.consents")} />
      <div className="bg-card overflow-x-auto rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Ref</TableHead>
              <TableHead>{t("lender.farmer")}</TableHead>
              <TableHead>{t("lender.scope")}</TableHead>
              <TableHead>{t("lender.purpose2")}</TableHead>
              <TableHead>{t("common.status")}</TableHead>
              <TableHead>→</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-muted-foreground h-16 text-center">
                  {t("common.noResults")}
                </TableCell>
              </TableRow>
            ) : (
              rows.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="text-xs">
                    {c.ref}
                    <br />
                    <span className="text-muted-foreground">
                      {c.createdAt.toLocaleDateString("en-GB")}
                    </span>
                  </TableCell>
                  <TableCell>
                    {c.farmer.fullName}
                    <p className="text-muted-foreground text-xs">{c.farmer.agripayId}</p>
                  </TableCell>
                  <TableCell className="text-xs">{t(`consentScope.${c.scope}`)}</TableCell>
                  <TableCell className="text-xs">{c.purpose}</TableCell>
                  <TableCell>
                    <StatusBadge tone={toneFor(c.status)}>
                      {t(`consentStatus.${c.status}`)}
                    </StatusBadge>
                  </TableCell>
                  <TableCell className="text-xs">
                    {c.expiresAt?.toLocaleDateString("en-GB") ?? "—"}
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
