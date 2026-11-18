import { requirePortal } from "@/server/auth/actor";
import { notFoundOn404 } from "@/server/page-helpers";
import { ProductEditor } from "../product-page";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { actor } = await requirePortal("/lender");
  const { id } = await params;
  return notFoundOn404(() => ProductEditor({ actor, id }));
}
