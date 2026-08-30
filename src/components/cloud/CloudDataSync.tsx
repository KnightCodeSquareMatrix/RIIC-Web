"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  acceptAccountDataConsent,
  getAccountDataConsent,
  getCloudWorkspace,
  putCloudWorkspace,
} from "@/api";
import {
  cloudWorkspaceFingerprint,
  readCloudSyncMetadata,
  writeCloudSyncMetadata,
} from "@/cloud-sync";
import { PRIVACY_VERSION, TERMS_VERSION } from "@/legal-policy";
import type { CloudWorkspaceData, CloudWorkspacePutRequest } from "@/types";
import { DataConsentDialog } from "./DataConsentDialog";

type UploadRequest = Exclude<CloudWorkspacePutRequest, { restoreRevisionId: string }>;

export function CloudDataSync({
  userId,
  hasLocalSession,
  workspace,
  refreshKey,
  onApply,
  onWorkspaceChanged,
}: {
  userId: string | null;
  hasLocalSession: boolean;
  workspace: UploadRequest;
  refreshKey: number;
  onApply: (workspace: CloudWorkspaceData) => void;
  onWorkspaceChanged: (workspace: CloudWorkspaceData | null) => void;
}) {
  const latestWorkspace = useRef(workspace);
  const syncController = useRef<AbortController | null>(null);
  const initializedUser = useRef<string | null>(null);
  const syncedFingerprint = useRef<string | null>(null);
  const [consentOpen, setConsentOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    latestWorkspace.current = workspace;
  }, [workspace]);

  const synchronizeFirst = useCallback(async (user: string, signal: AbortSignal, forceUpload = false) => {
    const remote = await getCloudWorkspace(signal);
    if (signal.aborted) return;
    const local = latestWorkspace.current;
    const localFingerprint = cloudWorkspaceFingerprint(local);
    const metadata = readCloudSyncMetadata(window.localStorage, user);
    if (!metadata) {
      if (hasLocalSession || forceUpload) {
        const uploaded = await putCloudWorkspace(local, signal);
        if (signal.aborted) return;
        writeCloudSyncMetadata(window.localStorage, user, { revision: uploaded.revision, fingerprint: localFingerprint });
        syncedFingerprint.current = localFingerprint;
        onWorkspaceChanged(uploaded);
      } else if (remote.exists) {
        if (signal.aborted) return;
        onApply(remote);
        const remoteRequest: UploadRequest = { state: remote.state!, operbox: remote.operbox, result: remote.result };
        const remoteFingerprint = cloudWorkspaceFingerprint(remoteRequest);
        writeCloudSyncMetadata(window.localStorage, user, { revision: remote.revision, fingerprint: remoteFingerprint });
        syncedFingerprint.current = remoteFingerprint;
        onWorkspaceChanged(remote);
      } else {
        syncedFingerprint.current = localFingerprint;
        onWorkspaceChanged(remote);
      }
    } else if (metadata.fingerprint !== localFingerprint) {
      const uploaded = await putCloudWorkspace({ ...local, baseRevision: metadata.revision }, signal);
      if (signal.aborted) return;
      writeCloudSyncMetadata(window.localStorage, user, { revision: uploaded.revision, fingerprint: localFingerprint });
      syncedFingerprint.current = localFingerprint;
      onWorkspaceChanged(uploaded);
    } else if (remote.exists && remote.revision > metadata.revision) {
      if (signal.aborted) return;
      onApply(remote);
      const remoteRequest: UploadRequest = { state: remote.state!, operbox: remote.operbox, result: remote.result };
      const remoteFingerprint = cloudWorkspaceFingerprint(remoteRequest);
      writeCloudSyncMetadata(window.localStorage, user, { revision: remote.revision, fingerprint: remoteFingerprint });
      syncedFingerprint.current = remoteFingerprint;
      onWorkspaceChanged(remote);
    } else {
      syncedFingerprint.current = localFingerprint;
      onWorkspaceChanged(remote);
    }
    initializedUser.current = user;
  }, [hasLocalSession, onApply, onWorkspaceChanged]);

  useEffect(() => {
    let cancelled = false;
    syncController.current?.abort();
    const controller = new AbortController();
    syncController.current = controller;
    initializedUser.current = null;
    syncedFingerprint.current = null;
    onWorkspaceChanged(null);
    if (!userId) {
      setConsentOpen(false);
      controller.abort();
      if (syncController.current === controller) syncController.current = null;
      return;
    }
    void getAccountDataConsent(controller.signal).then(async (consent) => {
      if (cancelled) return;
      if (!consent.cloudSyncEnabled) return;
      if (!consent.current) {
        const dismissed = window.localStorage.getItem(`cloud-consent-dismissed:${userId}:${TERMS_VERSION}:${PRIVACY_VERSION}`) === "1";
        if (!dismissed) setConsentOpen(true);
        return;
      }
      await synchronizeFirst(userId, controller.signal);
    }).catch((cause) => {
      if (!cancelled && !(cause instanceof DOMException && cause.name === "AbortError")) {
        setError(cause instanceof Error ? cause.message : "云端同步暂不可用，当前数据仍保存在本地。");
      }
    });
    return () => {
      cancelled = true;
      controller.abort();
      if (syncController.current === controller) syncController.current = null;
    };
  }, [onWorkspaceChanged, refreshKey, synchronizeFirst, userId]);

  useEffect(() => {
    if (!userId || initializedUser.current !== userId) return;
    const fingerprint = cloudWorkspaceFingerprint(workspace);
    if (fingerprint === syncedFingerprint.current) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void putCloudWorkspace(workspace, controller.signal).then((remote) => {
        if (controller.signal.aborted) return;
        syncedFingerprint.current = fingerprint;
        writeCloudSyncMetadata(window.localStorage, userId, { revision: remote.revision, fingerprint });
        onWorkspaceChanged(remote);
        setError(null);
      }).catch((cause) => {
        if (!(cause instanceof DOMException && cause.name === "AbortError")) {
          setError(cause instanceof Error ? cause.message : "云端同步失败，已保留本地副本。");
        }
      });
    }, 1200);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [onWorkspaceChanged, userId, workspace]);

  async function accept() {
    if (!userId) return;
    setSaving(true);
    setError(null);
    try {
      const controller = syncController.current ?? new AbortController();
      syncController.current = controller;
      await acceptAccountDataConsent({
        termsAccepted: true,
        privacyAccepted: true,
        termsVersion: TERMS_VERSION,
        privacyVersion: PRIVACY_VERSION,
      }, controller.signal);
      if (controller.signal.aborted) return;
      setConsentOpen(false);
      await synchronizeFirst(userId, controller.signal, true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "无法保存同意状态，请稍后重试。");
    } finally {
      setSaving(false);
    }
  }

  function decline() {
    if (userId) window.localStorage.setItem(`cloud-consent-dismissed:${userId}:${TERMS_VERSION}:${PRIVACY_VERSION}`, "1");
    setConsentOpen(false);
  }

  return <DataConsentDialog open={consentOpen} saving={saving} error={error} onAccept={() => void accept()} onDecline={decline} />;
}
