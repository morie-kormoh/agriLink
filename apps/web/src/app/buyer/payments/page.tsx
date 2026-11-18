import { PaymentsPage } from "@/components/trade/pages";
import { requirePortal } from "@/server/auth/actor";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { actor } = await requirePortal("/buyer");
  return (
    <PaymentsPage actor={actor} basePath="/buyer/payments" searchParams={await searchParams} />
  );
}
