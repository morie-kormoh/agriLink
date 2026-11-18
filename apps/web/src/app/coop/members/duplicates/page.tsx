import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ArrowRightLeftIcon, CopyCheckIcon } from "lucide-react";
import { EmptyState, PageHeader } from "@agripay/ui/components/blocks";
import { Card, CardContent } from "@agripay/ui/components/card";
import { formatSlPhone } from "@agripay/validation";
import { hasPermission } from "@agripay/validation/permissions";
import { DuplicateActions } from "@/components/farmers/duplicate-actions";
import { formatDate } from "@/lib/format";
import { requirePortal } from "@/server/auth/actor";
import { listSuspectedDuplicates } from "@/server/farmers/service";

function Summary({
  f,
  href,
}: {
  f: {
    agripayId: string;
    fullName: string;
    phone: string;
    community: string;
    dateOfBirth: Date | null;
    chiefdom: { name: string };
    createdAt: Date;
  };
  href?: string;
}) {
  const body = (
    <div className="min-w-0 space-y-0.5">
      <p className="text-muted-foreground font-mono text-xs">{f.agripayId}</p>
      <p className="truncate font-medium">{f.fullName}</p>
      <p className="text-muted-foreground truncate text-sm">
        {formatSlPhone(f.phone)} · {f.community}, {f.chiefdom.name}
      </p>
      <p className="text-muted-foreground text-xs">
        DOB {formatDate(f.dateOfBirth)} · {formatDate(f.createdAt)}
      </p>
    </div>
  );
  return href ? (
    <Link href={href} className="hover:bg-secondary/40 block rounded-md border p-3">
      {body}
    </Link>
  ) : (
    <div className="rounded-md border p-3">{body}</div>
  );
}

export default async function DuplicatesPage() {
  const { actor } = await requirePortal("/coop");
  if (!hasPermission(actor.role, "farmer.resolveDuplicate")) redirect("/coop");
  const t = await getTranslations("duplicates");
  const items = await listSuspectedDuplicates(actor);

  return (
    <>
      <PageHeader title={t("title")} description={t("subtitle")} />
      {items.length === 0 ? (
        <EmptyState icon={CopyCheckIcon} title={t("none")} />
      ) : (
        <div className="space-y-4">
          {items.map(({ farmer, original }) => (
            <Card key={farmer.id} className="gap-3 py-4">
              <CardContent className="space-y-3 px-4">
                <p className="text-accent-foreground text-sm">{farmer.duplicateNote}</p>
                <div className="grid items-center gap-3 md:grid-cols-[1fr_auto_1fr]">
                  <Summary f={farmer} href={`/coop/members/${farmer.id}`} />
                  <ArrowRightLeftIcon className="text-muted-foreground mx-auto size-4" />
                  {original ? (
                    <Summary f={original} href={`/coop/members/${original.id}`} />
                  ) : (
                    <div className="text-muted-foreground text-sm">—</div>
                  )}
                </div>
                <DuplicateActions farmerId={farmer.id} />
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
