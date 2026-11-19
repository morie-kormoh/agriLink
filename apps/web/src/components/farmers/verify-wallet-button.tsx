"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { BadgeCheckIcon, Loader2Icon } from "lucide-react";
import { Button } from "@agrilink/ui/components/button";
import { toast } from "@agrilink/ui/components/sonner";
import { verifyWalletAction } from "@/app/actions/farmers";

export function VerifyWalletButton({
  farmerId,
  walletId,
  label,
}: {
  farmerId: string;
  walletId: string;
  label: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      size="sm"
      variant="outline"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const res = await verifyWalletAction(farmerId, walletId);
          if (!res.ok) return void toast.error(res.error);
          if (res.data.match) toast.success(`Wallet name matches · KYC tier ${res.data.kycTier}`);
          else toast.warning("The wallet name does not match the farmer's name.");
          router.refresh();
        })
      }
    >
      {pending ? <Loader2Icon className="animate-spin" /> : <BadgeCheckIcon />}
      {label}
    </Button>
  );
}
