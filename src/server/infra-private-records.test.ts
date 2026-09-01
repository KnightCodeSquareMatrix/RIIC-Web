import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, stat, utimes, writeFile } from "node:fs/promises";
import { register } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  isLegacySklandRunDirectoryName,
  isPrivateStorageChild,
  isSafePrivateStorageRoot,
} from "./private-storage.ts";
import { REQUIRED_RUNTIME_DATA_FILES, resolveRuntimeDataDir } from "./runtime-data.ts";

register("../../scripts/ts-path-loader.mjs", import.meta.url);

test("private record deletion accepts only strict children of the configured root", () => {
  const root = path.resolve("private-record-test-root");
  assert.equal(isPrivateStorageChild(root, path.join(root, "run-1")), true);
  assert.equal(isPrivateStorageChild(root, path.join(root, "nested", "run-2")), true);
  assert.equal(isPrivateStorageChild(root, root), false);
  assert.equal(isPrivateStorageChild(root, path.dirname(root)), false);
  assert.equal(isPrivateStorageChild(root, path.resolve(`${root}-sibling`, "run-3")), false);
});

test("legacy migration recognizes both current and old identifying Skland run labels", () => {
  assert.equal(isLegacySklandRunDirectoryName("2026-08-05_森空岛同步_run-id"), true);
  assert.equal(isLegacySklandRunDirectoryName("2026-07-01_skland_123456789_1700000000_run-id"), true);
  assert.equal(isLegacySklandRunDirectoryName("2026-08-05_MAA导入_run-id"), false);
});

test("private record deletion refuses filesystem and explicitly disallowed broad roots", () => {
  const workspace = path.resolve("workspace-root");
  const storage = path.join(workspace, "server", "storage");
  assert.equal(isSafePrivateStorageRoot(path.parse(storage).root), false);
  assert.equal(isSafePrivateStorageRoot(workspace, [workspace]), false);
  assert.equal(isSafePrivateStorageRoot(path.dirname(workspace), [workspace]), false);
  assert.equal(isSafePrivateStorageRoot(storage, [workspace]), true);
});

test("runtime data override is used only when the solver data set is complete", async (context) => {
  const root = await mkdtemp(path.join(tmpdir(), "arkinfra-runtime-data-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const cliPath = path.join(root, "bin", "infra-cli");
  const configuredDataDir = path.join(root, "shared-data");
  await mkdir(configuredDataDir, { recursive: true });

  for (const fileName of REQUIRED_RUNTIME_DATA_FILES.slice(0, -1)) {
    await writeFile(path.join(configuredDataDir, fileName), "{}", "utf-8");
  }
  assert.equal(resolveRuntimeDataDir(cliPath, configuredDataDir), null);

  await writeFile(path.join(configuredDataDir, REQUIRED_RUNTIME_DATA_FILES.at(-1)!), "{}", "utf-8");
  assert.equal(resolveRuntimeDataDir(cliPath, configuredDataDir), path.resolve(configuredDataDir));
});

test("Skland owned-data deletion removes only matching runs and feedback without global maintenance", async (context) => {
  const root = await mkdtemp(path.join(tmpdir(), "arkinfra-owned-delete-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const storageRoot = path.join(root, "storage");
  const runsRoot = path.join(storageRoot, "cli-runs");
  const feedbackRoot = path.join(storageRoot, "feedback");
  await Promise.all([
    mkdir(runsRoot, { recursive: true }),
    mkdir(feedbackRoot, { recursive: true }),
  ]);

  const targetOwnerTag = "a".repeat(64);
  const unrelatedOwnerTag = "b".repeat(64);
  const diagnosticId = "11111111-1111-4111-8111-111111111111";
  const targetRun = path.join(runsRoot, "target-run");
  const unrelatedRun = path.join(runsRoot, "expired-unrelated-run");
  const linkedFeedback = path.join(feedbackRoot, "linked-feedback");
  const ownedFeedback = path.join(feedbackRoot, "owned-feedback");
  const unrelatedFeedback = path.join(feedbackRoot, "unrelated-feedback");
  await Promise.all([
    mkdir(targetRun),
    mkdir(unrelatedRun),
    mkdir(linkedFeedback),
    mkdir(ownedFeedback),
    mkdir(unrelatedFeedback),
  ]);
  await Promise.all([
    writeFile(path.join(targetRun, "owner.json"), JSON.stringify({ ownerTag: targetOwnerTag, diagnosticId })),
    writeFile(path.join(unrelatedRun, "owner.json"), JSON.stringify({ ownerTag: unrelatedOwnerTag })),
    writeFile(path.join(linkedFeedback, "meta.json"), JSON.stringify({ diagnosticId })),
    writeFile(path.join(ownedFeedback, "meta.json"), JSON.stringify({ dataOwnerTag: targetOwnerTag })),
    writeFile(path.join(unrelatedFeedback, "meta.json"), JSON.stringify({ dataOwnerTag: unrelatedOwnerTag })),
  ]);
  const expiredAt = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
  await utimes(unrelatedRun, expiredAt, expiredAt);

  const previousStorageDir = process.env.BETA_STORAGE_DIR;
  const previousRunsDir = process.env.BETA_CLI_RUN_DIR;
  const previousFeedbackDir = process.env.BETA_FEEDBACK_DIR;
  process.env.BETA_STORAGE_DIR = storageRoot;
  process.env.BETA_CLI_RUN_DIR = runsRoot;
  process.env.BETA_FEEDBACK_DIR = feedbackRoot;
  context.after(() => {
    if (previousStorageDir === undefined) delete process.env.BETA_STORAGE_DIR;
    else process.env.BETA_STORAGE_DIR = previousStorageDir;
    if (previousRunsDir === undefined) delete process.env.BETA_CLI_RUN_DIR;
    else process.env.BETA_CLI_RUN_DIR = previousRunsDir;
    if (previousFeedbackDir === undefined) delete process.env.BETA_FEEDBACK_DIR;
    else process.env.BETA_FEEDBACK_DIR = previousFeedbackDir;
  });

  const { deleteSklandOwnedData } = await import("./infra.ts");
  assert.deepEqual(await deleteSklandOwnedData([targetOwnerTag]), { runs: 1, feedback: 2 });
  await assert.rejects(stat(targetRun), { code: "ENOENT" });
  await assert.rejects(stat(linkedFeedback), { code: "ENOENT" });
  await assert.rejects(stat(ownedFeedback), { code: "ENOENT" });
  await assert.doesNotReject(stat(unrelatedRun));
  await assert.doesNotReject(stat(unrelatedFeedback));
  await assert.rejects(stat(path.join(storageRoot, ".skland-legacy-purge-v1.json")), { code: "ENOENT" });
});
