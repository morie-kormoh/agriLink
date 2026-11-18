import { PortalLayout } from "@/components/shell/portal-layout";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <PortalLayout prefix="/admin">{children}</PortalLayout>;
}
