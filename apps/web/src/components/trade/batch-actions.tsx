"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { BanknoteIcon, Loader2Icon, MoreHorizontalIcon, SendIcon } from "lucide-react";
import { Button } from "@agripay/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@agripay/ui/components/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@agripay/ui/components/dropdown-menu";
import { Input } from "@agripay/ui/components/input";
import { Label } from "@agripay/ui/components/label";
import { toast } from "@agripay/ui/components/sonner";
import {
  approveBatchAction,
  approvePurchaseAction,
  cancelPurchaseAction,
  submitBatchAction,
} from "@/app/actions/trade";

export function SubmitBatchButton({ batchId, disabled }: { batchId: string; disabled?: boolean }) {
  const t = useTranslations("trade");
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      disabled={disabled || pending}
      onClick={() =>
        start(async () => {
          const r = await submitBatchAction(batchId);
          if (!r.ok) return void toast.error(r.error);
          toast.success(t("submitted"));
          router.refresh();
        })
      }
    >
      {pending ? <Loader2Icon className="animate-spin" /> : <SendIcon />} {t("submit")}
    </Button>
  );
}

export function ApproveBatchButton({
  batchId,
  count,
  total,
}: {
  batchId: string;
  count: number;
  total: string;
}) {
  const t = useTranslations("trade");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  return (
    <>
      <Button size="lg" onClick={() => setOpen(true)} disabled={count === 0}>
        <BanknoteIcon /> {t("approve")}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("approve")}</DialogTitle>
            <DialogDescription>{t("approveConfirm", { count, total })}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              ✕
            </Button>
            <Button
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const r = await approveBatchAction(batchId);
                  if (!r.ok) return void toast.error(r.error);
                  toast.success(t("approved", { count: r.data.approved }));
                  if (r.data.held.length) {
                    toast.warning(
                      t("held", {
                        count: r.data.held.length,
                        reasons: r.data.held
                          .map((h) => `${h.ref} (${t(`holdReason.${h.reason}`)})`)
                          .join(", "),
                      }),
                    );
                  }
                  setOpen(false);
                  router.refresh();
                })
              }
            >
              {pending ? <Loader2Icon className="animate-spin" /> : <BanknoteIcon />} {t("approve")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function PurchaseRowActions({
  purchaseId,
  canApprove,
  canCancel,
}: {
  purchaseId: string;
  canApprove: boolean;
  canCancel: boolean;
}) {
  const t = useTranslations("trade");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [cancelOpen, setCancelOpen] = useState(false);
  const [reason, setReason] = useState("");
  if (!canApprove && !canCancel) return null;
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="Actions" disabled={pending}>
            {pending ? <Loader2Icon className="animate-spin" /> : <MoreHorizontalIcon />}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {canApprove ? (
            <DropdownMenuItem
              onSelect={() =>
                start(async () => {
                  const r = await approvePurchaseAction(purchaseId);
                  if (!r.ok) return void toast.error(r.error);
                  toast.success(t("approved", { count: 1 }));
                  router.refresh();
                })
              }
            >
              {t("approveOne")}
            </DropdownMenuItem>
          ) : null}
          {canCancel ? (
            <DropdownMenuItem variant="destructive" onSelect={() => setCancelOpen(true)}>
              {t("cancel")}
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("cancel")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="cancel-reason">{t("cancelReason")}</Label>
            <Input id="cancel-reason" value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
          <DialogFooter>
            <Button
              variant="destructive"
              disabled={pending || reason.trim().length < 3}
              onClick={() =>
                start(async () => {
                  const r = await cancelPurchaseAction(purchaseId, reason);
                  if (!r.ok) return void toast.error(r.error);
                  toast.success(t("cancelled"));
                  setCancelOpen(false);
                  router.refresh();
                })
              }
            >
              {t("cancel")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
