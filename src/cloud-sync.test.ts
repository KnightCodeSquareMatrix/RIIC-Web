import assert from "node:assert/strict";
import test from "node:test";

import { cloudSyncMetadataKey, cloudWorkspaceFingerprint, readCloudSyncMetadata, writeCloudSyncMetadata } from "./cloud-sync.ts";
import type { CloudWorkspacePutRequest } from "./types.ts";
import type { TestContext } from "node:test";
import { CloudSyncSession, type CloudSyncStatus, type CloudUpload } from "./cloud-sync-session.ts";
import type { CloudWorkspaceData } from "./types.ts";

const request = {
  state: {
    presetLabel: "243",
    layout: { template: "243", drone_cap: 0, scenario: {}, rooms: [] },
    sourceName: null,
    boxSource: "sample",
    layoutDirty: false,
    layoutSource: "local",
    localLayoutBackup: null,
    rotationProfile: "abc_12_6_6",
    fiammettaEnabled: false,
    activeShift: 0,
  },
  operbox: null,
  result: null,
} satisfies Exclude<CloudWorkspacePutRequest, { restoreRevisionId: string }>;

test("cloud fingerprint changes with local edits", () => {
  assert.notEqual(cloudWorkspaceFingerprint(request), cloudWorkspaceFingerprint({
    ...request,
    state: { ...request.state, activeShift: 1 },
  }));
});

test("cloud sync metadata is scoped per website user", () => {
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
  };
  writeCloudSyncMetadata(storage, "user-a", { revision: 3, fingerprint: "fp" });
  assert.deepEqual(readCloudSyncMetadata(storage, "user-a"), { revision: 3, fingerprint: "fp" });
  assert.equal(readCloudSyncMetadata(storage, "user-b"), null);
  assert.notEqual(cloudSyncMetadataKey("user-a"), cloudSyncMetadataKey("user-b"));
});

function sessionHarness(context: TestContext, overrides: Partial<ConstructorParameters<typeof CloudSyncSession>[0]> = {}) {
  context.mock.timers.enable({ apis: ["Date", "setTimeout"], now: 100_000 });
  let workspace: CloudUpload = structuredClone(request);
  const values = new Map<string, string>();
  const uploads: CloudUpload[] = [];
  const changes: (CloudWorkspaceData | null)[] = [];
  const statuses: CloudSyncStatus[] = [];
  const remote: CloudWorkspaceData = { exists: false, revision: 0, state: null, operbox: null, result: null, revisions: [], updatedAt: null, syncedAt: null };
  const session = new CloudSyncSession({
    userId: "user-a",
    dismissedKey: "dismissed:a:v1",
    storage: { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => { values.set(key, value); } },
    local: () => ({ workspace, hasLocalSession: true }),
    getConsent: async () => ({ current: true, cloudSyncEnabled: true, termsVersion: "1", privacyVersion: "1", acceptedAt: null, revokedAt: null }),
    acceptConsent: async () => undefined,
    getWorkspace: async () => remote,
    putWorkspace: async (input) => { uploads.push(input); return { ...remote, ...input, exists: true, revision: uploads.length }; },
    apply: (data) => { workspace = { state: data.state!, operbox: data.operbox, result: data.result }; },
    changed: (data) => changes.push(data),
    status: (state) => statuses.push(state),
    ...overrides,
  });
  context.after(() => session.dispose());
  const tick = async (ms: number) => {
    context.mock.timers.tick(ms);
    for (let i = 0; i < 30; i++) await Promise.resolve();
  };
  return { session, uploads, changes, statuses, remote, tick, edit: (shift: number) => {
    workspace = { ...workspace, state: { ...workspace.state, activeShift: shift } };
    session.update();
  } };
}

test("expired cloud consent stops uploads until explicit acceptance", async (context) => {
  let accepted = false;
  let attempts = 0;
  const h = sessionHarness(context, {
    putWorkspace: async () => { attempts++; if (!accepted) throw { code: "AIC-DATA-8001" }; return h.remote; },
    acceptConsent: async () => { accepted = true; },
  });
  h.session.start(); await h.tick(0);
  assert.equal(attempts, 1);
  assert.equal(h.statuses.at(-1)?.consentOpen, true);
  h.edit(1); await h.tick(120_000);
  assert.equal(attempts, 1);
  await h.session.accept(); await h.tick(0);
  assert.equal(attempts, 2);
  assert.equal(h.statuses.at(-1)?.error, null);
});

test("429 cooldown survives local edits and manual retries", async (context) => {
  let attempts = 0;
  const h = sessionHarness(context, { putWorkspace: async () => {
    attempts++;
    if (attempts === 1) throw { code: "AIC-RATE-6001", retryAfterSeconds: 60 };
    return h.remote;
  } });
  h.session.start(); await h.tick(0);
  h.edit(1); h.session.retry(); await h.tick(59_999);
  assert.equal(attempts, 1);
  await h.tick(1);
  assert.equal(attempts, 2);
  assert.equal(h.statuses.at(-1)?.error, null);
});

test("invalid uploads are blocked by fingerprint and resume only for changed data", async (context) => {
  let attempts = 0;
  const h = sessionHarness(context, { putWorkspace: async () => { attempts++; throw { code: "AIC-DATA-8003" }; } });
  h.session.start(); await h.tick(0);
  h.session.update(); h.session.retry(); await h.tick(120_000);
  assert.equal(attempts, 1);
  h.edit(1); await h.tick(1200);
  assert.equal(attempts, 2);
  assert.equal(h.statuses.at(-1)?.error, "invalid");
});

test("transient failures use bounded exponential retry and then pause", async (context) => {
  let attempts = 0;
  const h = sessionHarness(context, { getConsent: async () => { attempts++; throw { retryable: true }; } });
  h.session.start(); await h.tick(0);
  for (const delay of [5000, 10_000, 20_000, 40_000]) await h.tick(delay);
  assert.equal(attempts, 5);
  assert.equal(h.statuses.at(-1)?.error, "paused");
  h.edit(1); await h.tick(300_000);
  assert.equal(attempts, 5);
});

test("login expiry does not retry even when workspace changes", async (context) => {
  let attempts = 0;
  const h = sessionHarness(context, { getConsent: async () => { attempts++; throw { code: "AIC-AUTH-2008" }; } });
  h.session.start(); await h.tick(0);
  h.edit(1); h.session.retry(); await h.tick(300_000);
  assert.equal(attempts, 1);
  assert.equal(h.statuses.at(-1)?.error, "session");
});

test("edits during upload serialize one later upload of the latest workspace", async (context) => {
  let release!: (remote: CloudWorkspaceData) => void;
  const uploads: CloudUpload[] = [];
  const h = sessionHarness(context, { putWorkspace: async (input) => {
    uploads.push(input);
    if (uploads.length === 1) return new Promise((resolve) => { release = resolve; });
    return h.remote;
  } });
  h.session.start(); await h.tick(0);
  h.edit(1); h.edit(2); await h.tick(10_000);
  assert.equal(uploads.length, 1);
  release(h.remote); await h.tick(0); await h.tick(1200);
  assert.equal(uploads.length, 2);
  assert.equal(uploads[1].state.activeShift, 2);
});

test("account disposal aborts requests and ignores late replies", async (context) => {
  let release!: (remote: CloudWorkspaceData) => void;
  let signal!: AbortSignal;
  const h = sessionHarness(context, { putWorkspace: async (_input, requestSignal) => {
    signal = requestSignal;
    return new Promise((resolve) => { release = resolve; });
  } });
  h.session.start(); await h.tick(0);
  h.session.dispose();
  const statusCount = h.statuses.length;
  release(h.remote); await h.tick(120_000);
  assert.equal(signal.aborted, true);
  assert.equal(h.statuses.length, statusCount);
  assert.deepEqual(h.changes, [null]);
});

test("explicit refresh rechecks cloud consent without bypassing failure cooldown", async (context) => {
  let reads = 0;
  let current = true;
  const h = sessionHarness(context, { getConsent: async () => {
    reads++;
    return { current, cloudSyncEnabled: true, termsVersion: "1", privacyVersion: "1", acceptedAt: null, revokedAt: null };
  } });
  h.session.start(); await h.tick(0);
  current = false;
  h.session.refresh(); await h.tick(0);
  assert.equal(reads, 2);
  assert.equal(h.statuses.at(-1)?.error, "consent");
  h.session.decline(); h.session.refresh(); await h.tick(120_000);
  assert.equal(reads, 2);
});
