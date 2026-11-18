import { PortalLayout } from "@/components/shell/portal-layout";

export default function Layout({ children }: { children: React.ReactNode }) {
  return <PortalLayout prefix="/lender">{children}</PortalLayout>;
}
