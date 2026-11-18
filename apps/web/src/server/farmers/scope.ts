import "server-only";
import type { Prisma } from "@agripay/db";
import type { Actor } from "@agripay/validation/permissions";
import { forbidden } from "../errors";

/** Prisma `where` limiting farmers to what the actor may see (module 01 scope rules). */
export function farmerScope(actor: Actor): Prisma.FarmerWhereInput {
  switch (actor.role) {
    case "SUPER_ADMIN":
      return {};
    case "COOP_ADMIN":
    case "COOP_STAFF":
      if (!actor.orgId) throw forbidden();
      return { cooperativeId: actor.orgId };
    case "AGENT":
      return {
        OR: [
          { registeredById: actor.userId },
          ...(actor.orgId ? [{ cooperativeId: actor.orgId }] : []),
        ],
      };
    case "FARMER":
      if (!actor.farmerId) throw forbidden();
      return { id: actor.farmerId };
    default:
      // Buyers, lenders, dealers and programme officers get farmer data through
      // purchases / consent in later modules — never through the registry directly.
      throw forbidden();
  }
}

/** Resource context for `can()` from a loaded farmer row. */
export function farmerResource(f: {
  id: string;
  cooperativeId: string | null;
  registeredById: string | null;
}) {
  return { orgId: f.cooperativeId, farmerId: f.id, registeredById: f.registeredById };
}
