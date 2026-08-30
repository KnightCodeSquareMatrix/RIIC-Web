import WorkbenchApp from "@/App";
import { WebsiteSessionProvider } from "@/website-session";

export default function WorkbenchLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <WebsiteSessionProvider>
      <WorkbenchApp>{children}</WorkbenchApp>
    </WebsiteSessionProvider>
  );
}
