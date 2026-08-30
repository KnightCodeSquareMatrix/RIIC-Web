"use client";

import { WebsiteAccountPanel } from "@/components/auth/WebsiteAccountPanel";
import { StatusCenterPage } from "@/components/pages/StatusCenterShell";
import type { CloudWorkspaceData, SavedPlanData } from "@/types";

export interface AccountStatusCenterProps {
  onSessionChanged?: (authenticated: boolean) => void | Promise<void>;
  cloudWorkspace?: CloudWorkspaceData | null;
  onRestoreSavedPlan?: (plan: SavedPlanData) => void;
  onCloudDataChanged?: () => void;
}

export function AccountStatusCenter(props: AccountStatusCenterProps) {
  return (
    <StatusCenterPage data-account-management>
      <WebsiteAccountPanel {...props} />
    </StatusCenterPage>
  );
}
