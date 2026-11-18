import { PassportPage } from "@/components/finance/passport-page";
import { requirePortal } from "@/server/auth/actor";

export default async function Page() {
  const { actor } = await requirePortal("/farmer");
  return <PassportPage actor={actor} />;
}
