import { PortalLayout } from "@/components/shell/portal-layout";

export default function AgentLayout({ children }: { children: React.ReactNode }) {
  return <PortalLayout prefix="/agent">{children}</PortalLayout>;
}
