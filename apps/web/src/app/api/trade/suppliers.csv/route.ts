import { prisma } from "@agripay/db";
import { api } from "@/server/api";
import { audit } from "@/server/audit";
import { requireActor } from "@/server/auth/actor";
import { supplierReport } from "@/server/trade/batches";

export const dynamic = "force-dynamic";

function cell(v: unknown) {
  const s = v == null ? "" : v instanceof Date ? v.toISOString().slice(0, 10) : String(v);
  const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** Supplier traceability export for buyers (module 03). */
export const GET = api(async () => {
  const { actor } = await requireActor(["BUYER_ADMIN", "BUYER_STAFF", "COOP_ADMIN"]);
  const rows = await supplierReport(actor);
  const header = [
    "agripay_id",
    "full_name",
    "district",
    "chiefdom",
    "community",
    "crop",
    "purchases",
    "quantity",
    "unit",
    "net_le",
    "last_purchase",
  ];
  const lines = rows.map((r) =>
    [
      r.agripayId,
      r.fullName,
      r.district,
      r.chiefdom,
      r.community,
      r.crop,
      r.purchases,
      r.quantity,
      r.unit,
      r.netLe,
      r.lastPurchase,
    ]
      .map(cell)
      .join(","),
  );
  await audit(prisma, {
    actor,
    action: "suppliers.exported",
    entity: "Organization",
    entityId: actor.orgId ?? "",
    after: { rows: rows.length },
  });
  return new Response(`${header.join(",")}\n${lines.join("\n")}\n`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="agripay-suppliers-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
});
