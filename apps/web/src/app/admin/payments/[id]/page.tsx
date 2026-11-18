import { PaymentDetailPage } from "@/components/trade/pages";
import { requirePortal } from "@/server/auth/actor";
import { notFoundOn404 } from "@/server/page-helpers";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { actor } = await requirePortal("/admin");
  const { id } = await params;
  return notFoundOn404(() => PaymentDetailPage({ actor, id, backPath: "/admin/payments" }));
}
