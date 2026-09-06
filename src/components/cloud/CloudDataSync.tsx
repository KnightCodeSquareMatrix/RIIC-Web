"use client";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";

import { acceptAccountDataConsent, getAccountDataConsent, getCloudWorkspace, putCloudWorkspace } from "@/api";
import { CloudSyncSession, type CloudSyncStatus, type CloudUpload } from "@/cloud-sync-session";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { PRIVACY_VERSION, TERMS_VERSION } from "@/legal-policy";
import type { CloudWorkspaceData } from "@/types";
import { DataConsentDialog } from "./DataConsentDialog";

export function CloudDataSync(props: {
  userId: string | null;
  hasLocalSession: boolean;
  workspace: CloudUpload;
  refreshKey: number;
  onApply: (workspace: CloudWorkspaceData) => void;
  onWorkspaceChanged: (workspace: CloudWorkspaceData | null) => void;
}) {
  const intl = useTranslations();
  const { userId, workspace, refreshKey } = props;
  const latest = useRef(props);
  const session = useRef<CloudSyncSession | null>(null);
  const [status, setStatus] = useState<CloudSyncStatus>({ consentOpen: false, saving: false, error: null, errorCode: null });
  useEffect(() => { latest.current = props; });

  useEffect(() => {
    setStatus({ consentOpen: false, saving: false, error: null, errorCode: null });
    if (!userId) {
      latest.current.onWorkspaceChanged(null);
      return;
    }
    const active = new CloudSyncSession({
      userId,
      storage: window.localStorage,
      dismissedKey: `cloud-consent-dismissed:${userId}:${TERMS_VERSION}:${PRIVACY_VERSION}`,
      local: () => latest.current,
      getConsent: getAccountDataConsent,
      acceptConsent: (signal) => acceptAccountDataConsent({ termsAccepted: true, privacyAccepted: true, termsVersion: TERMS_VERSION, privacyVersion: PRIVACY_VERSION }, signal),
      getWorkspace: getCloudWorkspace,
      putWorkspace: putCloudWorkspace,
      apply: (remote) => latest.current.onApply(remote),
      changed: (remote) => latest.current.onWorkspaceChanged(remote),
      status: setStatus,
    });
    session.current = active;
    active.start();
    return () => { active.dispose(); if (session.current === active) session.current = null; };
  }, [userId]);

  useEffect(() => { session.current?.update(); }, [workspace]);
  useEffect(() => { session.current?.refresh(); }, [refreshKey]);

  const errorMessages = {
    consent: intl("components_cloud_CloudDataSync.syncError_consent"),
    policy: intl("components_cloud_CloudDataSync.syncError_policy"),
    invalid: intl("components_cloud_CloudDataSync.syncError_invalid"),
    retry: intl("components_cloud_CloudDataSync.syncError_retry"),
    session: intl("components_cloud_CloudDataSync.syncError_session"),
    paused: intl("components_cloud_CloudDataSync.syncError_paused"),
  };
  const error = status.error ? errorMessages[status.error] : null;
  return <>
    <DataConsentDialog open={status.consentOpen} saving={status.saving} error={error} reloadRequired={status.error === "policy"} onAccept={() => { if (status.error === "policy") window.location.reload(); else void session.current?.accept(); }} onDecline={() => session.current?.decline()} />
    {error && !status.consentOpen ? <Alert data-cloud-sync-error role="status" className="my-2">
      <AlertDescription className="break-words">
        <p>{error}{status.errorCode ? ` (${status.errorCode})` : ""}</p>
        {status.error === "paused" || status.error === "consent" ? <Button variant="outline" size="sm" onClick={() => session.current?.retry()}>{intl("components_cloud_CloudDataSync.resumeSync")}</Button> : null}
      </AlertDescription>
    </Alert> : null}
  </>;
}
