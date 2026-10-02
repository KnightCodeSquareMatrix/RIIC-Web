import WorkbenchApp from "@/App";
import { WebsiteSessionProvider } from "@/website-session";
import { AgentRuntimeAccountBoundary } from "@/components/agent/AgentRuntimeProvider";
import { FeatureAccessProvider } from "@/components/workbench/FeatureAccessProvider";

export default function WorkbenchLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <WebsiteSessionProvider>
      <FeatureAccessProvider>
        <AgentRuntimeAccountBoundary />
        <WorkbenchApp>{children}</WorkbenchApp>
      </FeatureAccessProvider>
    </WebsiteSessionProvider>
  );
}
