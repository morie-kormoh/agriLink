import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { DownloadIcon, UserPlusIcon } from "lucide-react";
import { prisma } from "@agrilink/db";
import { Button } from "@agrilink/ui/components/button";
import { PageHeader } from "@agrilink/ui/components/blocks";
import { farmerSearchSchema, formatSlPhone, isYouth } from "@agrilink/validation";
import { type Actor, hasPermission } from "@agrilink/validation/permissions";
import { Pagination } from "@/components/pagination";
import { formatDate } from "@/lib/format";
import { searchFarmers } from "@/server/farmers/service";
import { FarmerFilters } from "./farmer-filters";
import { type FarmerRow, FarmersTable } from "./farmers-table";

/** Shared server component for /agent/farmers, /coop/members and /admin/farmers. */
export async function FarmerListPage({
  actor,
  searchParams,
  basePath,
  newHref,
  title,
  children,
}: {
  actor: Actor;
  searchParams: Record<string, string | string[] | undefined>;
  basePath: string;
  newHref?: string;
  title?: string;
  children?: React.ReactNode;
}) {
  const t = await getTranslations();
  const params = farmerSearchSchema.parse(
    Object.fromEntries(
      Object.entries(searchParams).filter(([, v]) => typeof v === "string" && v !== ""),
    ),
  );
  const [result, crops] = await Promise.all([
    searchFarmers(actor, params),
    prisma.crop.findMany({
      where: { active: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  const rows: FarmerRow[] = result.items.map((f) => ({
    id: f.id,
    agrilinkId: f.agrilinkId,
    fullName: f.fullName,
    gender: f.gender,
    phone: formatSlPhone(f.phone),
    location: `${f.community}, ${f.chiefdom.name}`,
    crop: f.plots[0]?.cropCycles[0]?.crop.name ?? null,
    kycTier: f.kycTier,
    status: f.status,
    youth: isYouth(f.dateOfBirth),
    hasDisability: f.hasDisability,
    walletVerified: f.wallets[0]?.verified ?? null,
    registeredAt: formatDate(f.createdAt),
  }));

  return (
    <>
      <PageHeader
        title={title ?? t("farmer.listTitle")}
        description={`${result.total.toLocaleString("en")} ${t("farmer.listTitle").toLowerCase()}`}
        actions={
          <>
            {hasPermission(actor.role, "farmer.import") ? (
              <Button variant="outline" asChild>
                <a href="/api/farmers/export">
                  <DownloadIcon /> {t("farmer.export")}
                </a>
              </Button>
            ) : null}
            {newHref ? (
              <Button asChild>
                <Link href={newHref}>
                  <UserPlusIcon /> {t("nav.registerFarmer")}
                </Link>
              </Button>
            ) : null}
          </>
        }
      />
      {children}
      <FarmerFilters crops={crops} />
      <FarmersTable rows={rows} basePath={basePath} />
      <Pagination
        page={result.page}
        pages={result.pages}
        total={result.total}
        searchParams={searchParams}
        basePath={basePath}
      />
    </>
  );
}
