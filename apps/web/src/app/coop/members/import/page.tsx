import { redirect } from "next/navigation";
import { hasPermission } from "@agrilink/validation/permissions";
import { ImportFarmers } from "@/components/farmers/import-farmers";
import { requirePortal } from "@/server/auth/actor";

export default async function CoopImportPage() {
  const { actor } = await requirePortal("/coop");
  if (!hasPermission(actor.role, "farmer.import")) redirect("/coop");
  return (
    <div className="mx-auto max-w-4xl">
      <ImportFarmers doneHref="/coop/members" />
    </div>
  );
}
