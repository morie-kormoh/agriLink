import { requirePortal } from "@/server/auth/actor";
import { ProductEditor } from "../product-page";

export default async function Page() {
  const { actor } = await requirePortal("/lender");
  return <ProductEditor actor={actor} />;
}
