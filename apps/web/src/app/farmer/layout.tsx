import { PortalLayout } from "@/components/shell/portal-layout";

export default function FarmerLayout({ children }: { children: React.ReactNode }) {
  return <PortalLayout prefix="/farmer">{children}</PortalLayout>;
}
