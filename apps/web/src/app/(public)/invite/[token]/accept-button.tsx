"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2Icon } from "lucide-react";
import { Button } from "@agrilink/ui/components/button";
import { toast } from "@agrilink/ui/components/sonner";
import { acceptInvitationAction } from "@/app/actions/auth";

export function AcceptInviteButton({ token, label }: { token: string; label: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      className="w-full"
      size="lg"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const res = await acceptInvitationAction(token);
          if (!res.ok) return void toast.error(res.error);
          router.replace(res.data.redirectTo);
          router.refresh();
        })
      }
    >
      {pending ? <Loader2Icon className="animate-spin" /> : null}
      {label}
    </Button>
  );
}
