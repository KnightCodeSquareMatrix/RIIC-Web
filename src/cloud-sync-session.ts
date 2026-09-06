import { cloudWorkspaceFingerprint, readCloudSyncMetadata, writeCloudSyncMetadata } from "./cloud-sync.ts";
import type { AccountDataConsentData, CloudWorkspaceData, CloudWorkspacePutRequest } from "./types.ts";

export type CloudUpload = Exclude<CloudWorkspacePutRequest, { restoreRevisionId: string }>;
export type CloudSyncStatus = {
  consentOpen: boolean;
  saving: boolean;
  error: "consent" | "policy" | "invalid" | "retry" | "session" | "paused" | null;
  errorCode: string | null;
};

type Dependencies = {
  userId: string;
  storage: Pick<Storage, "getItem" | "setItem">;
  dismissedKey: string;
  local: () => { workspace: CloudUpload; hasLocalSession: boolean };
  getConsent: (signal: AbortSignal) => Promise<AccountDataConsentData>;
  acceptConsent: (signal: AbortSignal) => Promise<unknown>;
  getWorkspace: (signal: AbortSignal) => Promise<CloudWorkspaceData>;
  putWorkspace: (data: CloudUpload, signal: AbortSignal) => Promise<CloudWorkspaceData>;
  apply: (data: CloudWorkspaceData) => void;
  changed: (data: CloudWorkspaceData | null) => void;
  status: (status: CloudSyncStatus) => void;
};

/** One account-scoped, serialized sync loop. Local edits never abort an active upload. */
export class CloudSyncSession {
  private readonly dependencies: Dependencies;
  private readonly controller = new AbortController();
  private timer: ReturnType<typeof setTimeout> | undefined;
  private busy = false;
  private paused = false;
  private consentKnown = false;
  private initialized = false;
  private refreshRequested = false;
  private forceUpload = false;
  private fingerprint: string | null = null;
  private blockedFingerprint: string | null = null;
  private retryAt = 0;
  private failures = 0;
  private state: CloudSyncStatus = { consentOpen: false, saving: false, error: null, errorCode: null };

  constructor(dependencies: Dependencies) { this.dependencies = dependencies; }

  start() {
    this.dependencies.changed(null);
    this.publish();
    this.schedule(0);
  }

  update() { this.schedule(1200); }

  refresh() {
    this.refreshRequested = true;
    this.schedule(0);
  }

  dispose() {
    clearTimeout(this.timer);
    this.controller.abort();
  }

  decline() {
    this.dependencies.storage.setItem(this.dependencies.dismissedKey, "1");
    this.paused = true;
    this.state.consentOpen = false;
    clearTimeout(this.timer);
    this.publish();
  }

  retry() {
    if (this.busy || this.state.error === "session") return;
    if (this.state.error === "consent") {
      this.state.consentOpen = true;
      this.publish();
      return;
    }
    this.failures = 0;
    this.paused = false;
    this.schedule(0);
  }

  async accept() {
    if (this.busy || this.state.error === "policy" || this.controller.signal.aborted || Date.now() < this.retryAt) return;
    clearTimeout(this.timer);
    this.busy = true;
    this.state.saving = true;
    this.publish();
    try {
      await this.dependencies.acceptConsent(this.controller.signal);
      if (this.controller.signal.aborted) return;
      this.consentKnown = true;
      this.initialized = false;
      this.forceUpload = true;
      this.paused = false;
      this.blockedFingerprint = null;
      this.failures = 0;
      this.state = { consentOpen: false, saving: false, error: null, errorCode: null };
    } catch (cause) {
      if (!this.controller.signal.aborted) this.failed(cause, null, true);
    } finally {
      this.busy = false;
      this.state.saving = false;
      this.publish();
      this.schedule(0);
    }
  }

  private publish() {
    if (!this.controller.signal.aborted) this.dependencies.status({ ...this.state });
  }

  private schedule(debounceMs: number) {
    if (this.controller.signal.aborted || this.busy || this.paused || this.state.consentOpen) return;
    const current = cloudWorkspaceFingerprint(this.dependencies.local().workspace);
    if (current === this.blockedFingerprint || (this.initialized && !this.refreshRequested && current === this.fingerprint)) return;
    clearTimeout(this.timer);
    const delay = Math.max(debounceMs, this.retryAt - Date.now());
    // Avoid overflowing a long Retry-After into an immediate browser timer.
    this.timer = setTimeout(() => {
      if (Date.now() < this.retryAt) this.schedule(0);
      else void this.synchronize();
    }, Math.min(delay, 2_147_483_647));
  }

  private failed(cause: unknown, attemptedFingerprint: string | null, consentSubmission = false) {
    const failure = cause && typeof cause === "object" ? cause as { code?: string; retryable?: boolean; retryAfterSeconds?: number } : {};
    this.state.errorCode = typeof failure.code === "string" && /^AIC-[A-Z]+-\d{4}$/.test(failure.code) ? failure.code : null;
    if (failure.code === "AIC-DATA-8001") {
      this.consentKnown = false;
      this.paused = true;
      this.state.error = "consent";
      this.state.consentOpen = this.dependencies.storage.getItem(this.dependencies.dismissedKey) !== "1";
    } else if (failure.code === "AIC-AUTH-2008") {
      this.paused = true;
      this.state.error = "session";
    } else if (failure.code === "AIC-DATA-8003" && consentSubmission) {
      this.paused = true;
      this.state.error = "policy";
    } else if (failure.code === "AIC-DATA-8003" || failure.code === "AIC-BOX-1101") {
      this.state.error = "invalid";
      this.blockedFingerprint = attemptedFingerprint;
      if (attemptedFingerprint === null) this.paused = true;
    } else if (failure.code === "AIC-RATE-6001" || failure.retryable === true || cause instanceof TypeError) {
      this.failures += 1;
      const retryAfter = Number(failure.retryAfterSeconds);
      const delay = Number.isFinite(retryAfter) && retryAfter >= 0
        ? retryAfter * 1000 : failure.code === "AIC-RATE-6001" ? 60_000 : 5_000;
      this.retryAt = Date.now() + Math.max(delay, Math.min(60_000, 5_000 * 2 ** (this.failures - 1)));
      this.paused = this.failures >= 5;
      this.state.error = this.paused ? "paused" : "retry";
    } else {
      this.paused = true;
      this.state.error = "paused";
    }
  }

  private store(remote: CloudWorkspaceData, fingerprint: string) {
    if (this.controller.signal.aborted) return;
    writeCloudSyncMetadata(this.dependencies.storage, this.dependencies.userId, { revision: remote.revision, fingerprint });
    this.fingerprint = fingerprint;
    this.dependencies.changed(remote);
  }

  private async synchronize() {
    if (this.busy || this.controller.signal.aborted) return;
    this.busy = true;
    let attemptedFingerprint: string | null = null;
    const signal = this.controller.signal;
    try {
      if (this.refreshRequested) {
        this.refreshRequested = false;
        this.initialized = false;
        this.consentKnown = false;
      }
      if (!this.consentKnown) {
        const consent = await this.dependencies.getConsent(signal);
        if (signal.aborted) return;
        if (!consent.cloudSyncEnabled) { this.paused = true; return; }
        if (!consent.current) {
          this.failed({ code: "AIC-DATA-8001" }, null);
          return;
        }
        this.consentKnown = true;
      }
      if (!this.initialized) {
        const remote = await this.dependencies.getWorkspace(signal);
        if (signal.aborted) return;
        const { workspace, hasLocalSession } = this.dependencies.local();
        const localFingerprint = cloudWorkspaceFingerprint(workspace);
        attemptedFingerprint = localFingerprint;
        const metadata = readCloudSyncMetadata(this.dependencies.storage, this.dependencies.userId);
        if ((!metadata && (hasLocalSession || this.forceUpload)) || (metadata && metadata.fingerprint !== localFingerprint)) {
          const uploaded = await this.dependencies.putWorkspace({ ...workspace, ...(metadata ? { baseRevision: metadata.revision } : {}) }, signal);
          this.store(uploaded, localFingerprint);
        } else if (remote.exists && (!metadata || remote.revision > metadata.revision)) {
          if (signal.aborted) return;
          this.dependencies.apply(remote);
          this.store(remote, cloudWorkspaceFingerprint({ state: remote.state!, operbox: remote.operbox, result: remote.result }));
        } else {
          this.fingerprint = localFingerprint;
          this.dependencies.changed(remote);
        }
        if (signal.aborted) return;
        this.initialized = true;
        this.forceUpload = false;
      } else {
        const { workspace } = this.dependencies.local();
        attemptedFingerprint = cloudWorkspaceFingerprint(workspace);
        if (attemptedFingerprint === this.fingerprint) return;
        const remote = await this.dependencies.putWorkspace(workspace, signal);
        this.store(remote, attemptedFingerprint);
      }
      if (signal.aborted) return;
      this.failures = 0;
      this.retryAt = 0;
      this.blockedFingerprint = null;
      this.state.error = null;
      this.state.errorCode = null;
    } catch (cause) {
      if (!signal.aborted) this.failed(cause, attemptedFingerprint);
    } finally {
      this.busy = false;
      this.publish();
      this.schedule(1200);
    }
  }
}
