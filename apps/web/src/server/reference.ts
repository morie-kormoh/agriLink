import "server-only";
import { unstable_cache } from "next/cache";
import { prisma } from "@agrilink/db";
import type { Actor } from "@agrilink/validation/permissions";

export interface ReferenceData {
  districts: {
    id: string;
    code: string;
    name: string;
    region: string;
    chiefdoms: { id: string; name: string }[];
  }[];
  crops: { id: string; code: string; name: string }[];
  cooperatives: { id: string; name: string }[];
  version: string;
}

const loadGeo = unstable_cache(
  async () => {
    const [districts, crops] = await Promise.all([
      prisma.district.findMany({
        orderBy: { name: "asc" },
        include: { region: true, chiefdoms: { orderBy: { name: "asc" } } },
      }),
      prisma.crop.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    ]);
    return {
      districts: districts.map((d) => ({
        id: d.id,
        code: d.code,
        name: d.name,
        region: d.region.name,
        // "Other (not listed)" last
        chiefdoms: d.chiefdoms
          .map((c) => ({ id: c.id, name: c.name }))
          .sort((a, b) =>
            a.name.startsWith("Other")
              ? 1
              : b.name.startsWith("Other")
                ? -1
                : a.name.localeCompare(b.name),
          ),
      })),
      crops: crops.map((c) => ({ id: c.id, code: c.code, name: c.name })),
    };
  },
  ["reference-geo-v1"],
  { revalidate: 3600 },
);

/** Districts, chiefdoms, crops and the cooperatives the actor can register into (cached offline by the agent app). */
export async function getReferenceData(actor: Actor): Promise<ReferenceData> {
  const geo = await loadGeo();
  const cooperatives =
    actor.role === "SUPER_ADMIN"
      ? await prisma.organization.findMany({
          where: { type: "COOPERATIVE", active: true },
          orderBy: { name: "asc" },
          select: { id: true, name: true },
        })
      : actor.orgId
        ? await prisma.organization.findMany({
            where: { id: actor.orgId, type: "COOPERATIVE" },
            select: { id: true, name: true },
          })
        : [];
  return { ...geo, cooperatives, version: new Date().toISOString().slice(0, 10) };
}
