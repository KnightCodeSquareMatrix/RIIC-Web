import WorkbenchApp from "@/App";
import { WebsiteSessionProvider } from "@/website-session";
import { AgentRuntimeAccountBoundary } from "@/components/agent/AgentRuntimeProvider";

export default function WorkbenchLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <WebsiteSessionProvider>
      <AgentRuntimeAccountBoundary />
      <WorkbenchApp>{children}</WorkbenchApp>
    </WebsiteSessionProvider>
  );
}
