"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { UsersIcon } from "lucide-react";
import { Badge } from "@agripay/ui/components/badge";
import { EmptyState } from "@agripay/ui/components/blocks";
import { type ColumnDef, DataTable } from "@agripay/ui/components/data-table";

export interface FarmerRow {
  id: string;
  agripayId: string;
  fullName: string;
  gender: string;
  phone: string;
  location: string;
  crop: string | null;
  kycTier: number;
  status: string;
  youth: boolean;
  hasDisability: boolean;
  walletVerified: boolean | null;
  registeredAt: string;
}

const STATUS_TONE: Record<string, "success" | "warning" | "muted" | "secondary"> = {
  ACTIVE: "success",
  DUPLICATE_SUSPECTED: "warning",
  INACTIVE: "muted",
  DRAFT: "secondary",
};

export function FarmersTable({ rows, basePath }: { rows: FarmerRow[]; basePath: string }) {
  const t = useTranslations();
  const router = useRouter();

  const columns: ColumnDef<FarmerRow>[] = [
    {
      accessorKey: "agripayId",
      header: t("farmer.agripayId"),
      cell: ({ row }) => (
        <span className="font-mono text-xs font-semibold">{row.original.agripayId}</span>
      ),
    },
    {
      accessorKey: "fullName",
      header: t("farmer.name"),
      cell: ({ row }) => (
        <div className="min-w-40">
          <p className="font-medium">{row.original.fullName}</p>
          <p className="text-muted-foreground text-xs">
            {t(`gender.${row.original.gender}`)}
            {row.original.youth ? ` · ${t("farmer.youth")}` : ""}
            {row.original.hasDisability ? ` · ${t("farmer.disability")}` : ""}
          </p>
        </div>
      ),
    },
    { accessorKey: "phone", header: t("farmer.fields.phone"), enableSorting: false },
    { accessorKey: "location", header: t("farmer.location"), enableSorting: false },
    { accessorKey: "crop", header: t("farmer.crop"), cell: ({ row }) => row.original.crop ?? "—" },
    {
      accessorKey: "kycTier",
      header: t("farmer.tier"),
      cell: ({ row }) => (
        <Badge variant={row.original.kycTier >= 2 ? "success" : "secondary"}>
          T{row.original.kycTier}
        </Badge>
      ),
    },
    {
      accessorKey: "status",
      header: t("common.status"),
      cell: ({ row }) => (
        <Badge variant={STATUS_TONE[row.original.status] ?? "secondary"}>
          {t(`farmerStatus.${row.original.status}`)}
        </Badge>
      ),
    },
    { accessorKey: "registeredAt", header: t("farmer.registered") },
  ];

  if (!rows.length) {
    return <EmptyState icon={UsersIcon} title={t("common.noResults")} />;
  }
  return (
    <DataTable
      columns={columns}
      data={rows}
      onRowClick={(r) => router.push(`${basePath}/${r.id}`)}
    />
  );
}
