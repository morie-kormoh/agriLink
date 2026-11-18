import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { KeyRoundIcon } from "lucide-react";
import { Button } from "@agripay/ui/components/button";
import { Alert, AlertDescription, AlertTitle } from "@agripay/ui/components/misc";
import { FarmerProfile } from "@/components/farmers/farmer-profile";
import { requirePortal } from "@/server/auth/actor";
import { getFarmerOr404 } from "@/server/farmers/page-helpers";

export default async function FarmerHome() {
  const { actor, user } = await requirePortal("/farmer");
  const t = await getTranslations("security");
  const farmer = await getFarmerOr404(actor, actor.farmerId ?? "");
  return (
    <>
      {!user.pinSet ? (
        <Alert variant="warning" className="mb-6">
          <KeyRoundIcon />
          <AlertTitle>{t("pinNotSet")}</AlertTitle>
          <AlertDescription>
            <p>{t("pinBody")}</p>
            <Button asChild size="sm" className="mt-2">
              <Link href="/settings/security">{t("savePin")}</Link>
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}
      <FarmerProfile farmer={farmer} actor={actor} />
    </>
  );
}
