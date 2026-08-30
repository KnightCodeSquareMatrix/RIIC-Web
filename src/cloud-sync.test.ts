import assert from "node:assert/strict";
import test from "node:test";

import { cloudSyncMetadataKey, cloudWorkspaceFingerprint, readCloudSyncMetadata, writeCloudSyncMetadata } from "./cloud-sync.ts";
import type { CloudWorkspacePutRequest } from "./types.ts";

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
