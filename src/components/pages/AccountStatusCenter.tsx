"use client";

import { WebsiteAccountPanel } from "@/components/auth/WebsiteAccountPanel";
import { StatusCenterPage } from "@/components/pages/StatusCenterShell";
import type { CloudWorkspaceData, SavedPlanData } from "@/types";
import type { CloudSyncStatus } from "@/cloud-sync";

export interface AccountStatusCenterProps {
  onSessionChanged?: (authenticated: boolean) => void | Promise<void>;
  cloudWorkspace?: CloudWorkspaceData | null;
  cloudSyncStatus?: CloudSyncStatus;
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
