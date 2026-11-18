import { PortalLayout } from "@/components/shell/portal-layout";

export default function CoopLayout({ children }: { children: React.ReactNode }) {
  return <PortalLayout prefix="/coop">{children}</PortalLayout>;
}
