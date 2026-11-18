import { BatchDetail } from "@/components/trade/batch-detail";
import { requirePortal } from "@/server/auth/actor";
import { notFoundOn404 } from "@/server/page-helpers";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { actor } = await requirePortal("/coop");
  const { id } = await params;
  return notFoundOn404(() =>
    BatchDetail({ actor, id, basePath: "/coop/collections", paymentsPath: "/coop/payments" }),
  );
}
