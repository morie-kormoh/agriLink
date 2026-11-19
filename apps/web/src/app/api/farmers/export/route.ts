import { prisma } from "@agrilink/db";
import { can } from "@agrilink/validation/permissions";
import { api } from "@/server/api";
import { audit } from "@/server/audit";
import { requireActor } from "@/server/auth/actor";
import { forbidden } from "@/server/errors";
import { farmerScope } from "@/server/farmers/scope";

export const dynamic = "force-dynamic";

function csvCell(v: unknown): string {
  const s = v == null ? "" : String(v);
  // Neutralise spreadsheet formula injection and quote when needed.
  const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** CSV export of farmers in the actor's scope (co-op admins / platform admins). */
export const GET = api(async () => {
  const { actor } = await requireActor(["COOP_ADMIN", "SUPER_ADMIN"]);
  if (!can(actor, "farmer.import")) throw forbidden();
  const farmers = await prisma.farmer.findMany({
    where: farmerScope(actor),
    orderBy: { agrilinkId: "asc" },
    include: {
      district: true,
      chiefdom: true,
      wallets: { where: { isPrimary: true }, take: 1 },
      plots: {
        include: {
          cropCycles: { include: { crop: true }, take: 1, orderBy: { createdAt: "desc" } },
        },
      },
    },
  });
  const header = [
    "agrilink_id",
    "full_name",
    "gender",
    "date_of_birth",
    "phone",
    "district",
    "chiefdom",
    "community",
    "main_crop",
    "total_acres",
    "wallet_provider",
    "wallet_verified",
    "kyc_tier",
    "status",
    "has_disability",
    "registered_at",
  ];
  const lines = farmers.map((f) =>
    [
      f.agrilinkId,
      f.fullName,
      f.gender,
      f.dateOfBirth?.toISOString().slice(0, 10),
      `0${f.phone.replace(/^\+232/, "")}`,
      f.district.name,
      f.chiefdom.name,
      f.community,
      f.plots[0]?.cropCycles[0]?.crop.name,
      f.plots.reduce((s, p) => s + Number(p.sizeAcres), 0).toFixed(2),
      f.wallets[0]?.provider,
      f.wallets[0]?.verified ? "yes" : "no",
      f.kycTier,
      f.status,
      f.hasDisability ? "yes" : "no",
      f.createdAt.toISOString(),
    ]
      .map(csvCell)
      .join(","),
  );
  await audit(prisma, {
    actor,
    action: "farmer.exported",
    entity: "Organization",
    entityId: actor.orgId ?? "platform",
    after: { rows: farmers.length },
  });
  return new Response([header.join(","), ...lines].join("\n") + "\n", {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="agrilink-farmers-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
});
