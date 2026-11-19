import { getTranslations } from "next-intl/server";
import { Badge } from "@agrilink/ui/components/badge";

type Tone = "success" | "warning" | "destructive" | "info" | "muted" | "secondary";

const PURCHASE: Record<string, Tone> = {
  RECORDED: "info",
  APPROVED: "secondary",
  PAYMENT_PENDING: "warning",
  PAID: "success",
  PAYMENT_FAILED: "destructive",
  DISPUTED: "destructive",
  CANCELLED: "muted",
};
const PAYMENT: Record<string, Tone> = {
  PENDING: "info",
  PROCESSING: "warning",
  SUCCESS: "success",
  PARTIAL: "warning",
  FAILED: "destructive",
  CANCELLED: "muted",
};
const BATCH: Record<string, Tone> = {
  OPEN: "info",
  SUBMITTED: "warning",
  APPROVED: "success",
  CANCELLED: "muted",
};

export async function PurchaseStatus({ status }: { status: string }) {
  const t = await getTranslations("purchaseStatus");
  return <Badge variant={PURCHASE[status] ?? "secondary"}>{t(status)}</Badge>;
}
export async function PaymentStatus({ status }: { status: string }) {
  const t = await getTranslations("paymentStatus");
  return <Badge variant={PAYMENT[status] ?? "secondary"}>{t(status)}</Badge>;
}
export async function BatchStatus({ status }: { status: string }) {
  const t = await getTranslations("batchStatus");
  return <Badge variant={BATCH[status] ?? "secondary"}>{t(status)}</Badge>;
}
