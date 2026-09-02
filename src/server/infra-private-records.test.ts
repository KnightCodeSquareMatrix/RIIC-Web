import assert from "node:assert/strict";
import { mkdtemp, mkdir, readdir, readFile, rm, stat, utimes, writeFile } from "node:fs/promises";
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
  const reproductionDiagnosticId = "22222222-2222-4222-8222-222222222222";
  const reproductionRun = path.join(runsRoot, `2026-09-02_MAA_${reproductionDiagnosticId}`);
  const linkedFeedback = path.join(feedbackRoot, "linked-feedback");
  const ownedFeedback = path.join(feedbackRoot, "owned-feedback");
  const unrelatedFeedback = path.join(feedbackRoot, "unrelated-feedback");
  const deletableFeedback = path.join(feedbackRoot, "deletable-feedback");
  const corruptFeedbackId = "33333333-3333-4333-8333-333333333333";
  const corruptFeedback = path.join(feedbackRoot, `2026-09-02_制造站_${corruptFeedbackId}`);
  await Promise.all([
    mkdir(targetRun),
    mkdir(unrelatedRun),
    mkdir(reproductionRun),
    mkdir(linkedFeedback),
    mkdir(ownedFeedback),
    mkdir(unrelatedFeedback),
    mkdir(deletableFeedback),
    mkdir(corruptFeedback),
  ]);
  await Promise.all([
    writeFile(path.join(targetRun, "owner.json"), JSON.stringify({ ownerTag: targetOwnerTag, diagnosticId })),
    writeFile(path.join(unrelatedRun, "owner.json"), JSON.stringify({ ownerTag: unrelatedOwnerTag })),
    writeFile(path.join(reproductionRun, "layout.json"), JSON.stringify({
      template: "243",
      drone_cap: 200,
      scenario: {},
      rooms: [
        { id: "control", kind: "control_center", level: 5 },
        { id: "power", kind: "power_plant", level: 3 },
      ],
    })),
    writeFile(path.join(reproductionRun, "operbox.json"), JSON.stringify([{
      id: "char_002_amiya",
      name: "阿米娅",
      own: true,
      level: 80,
      elite: 2,
      potential: 6,
      rarity: 5,
    }])),
    writeFile(path.join(reproductionRun, "reproduction.json"), JSON.stringify({
      sourceName: "MAA 导入",
      rotation: "abc_12_6_6",
      fiammettaEnabled: false,
    })),
    writeFile(path.join(reproductionRun, "result.json"), JSON.stringify({
      runId: reproductionDiagnosticId,
      success: false,
      error: "solver exited",
    })),
    writeFile(path.join(reproductionRun, "stderr.txt"), "debug tail"),
    writeFile(path.join(linkedFeedback, "meta.json"), JSON.stringify({ diagnosticId })),
    writeFile(path.join(ownedFeedback, "meta.json"), JSON.stringify({ dataOwnerTag: targetOwnerTag })),
    writeFile(path.join(unrelatedFeedback, "meta.json"), JSON.stringify({ dataOwnerTag: unrelatedOwnerTag })),
    writeFile(path.join(deletableFeedback, "meta.json"), JSON.stringify({ feedbackId: "feedback-delete" })),
    writeFile(path.join(corruptFeedback, "meta.json"), "{invalid-json"),
  ]);
  const previousStorageDir = process.env.BETA_STORAGE_DIR;
  const previousRunsDir = process.env.BETA_CLI_RUN_DIR;
  const previousFeedbackDir = process.env.BETA_FEEDBACK_DIR;
  const previousExpectedCliSha256 = process.env.INFRA_CLI_EXPECTED_SHA256;
  process.env.BETA_STORAGE_DIR = storageRoot;
  process.env.BETA_CLI_RUN_DIR = runsRoot;
  process.env.BETA_FEEDBACK_DIR = feedbackRoot;
  process.env.INFRA_CLI_EXPECTED_SHA256 = "0".repeat(64);
  context.after(() => {
    if (previousStorageDir === undefined) delete process.env.BETA_STORAGE_DIR;
    else process.env.BETA_STORAGE_DIR = previousStorageDir;
    if (previousRunsDir === undefined) delete process.env.BETA_CLI_RUN_DIR;
    else process.env.BETA_CLI_RUN_DIR = previousRunsDir;
    if (previousFeedbackDir === undefined) delete process.env.BETA_FEEDBACK_DIR;
    else process.env.BETA_FEEDBACK_DIR = previousFeedbackDir;
    if (previousExpectedCliSha256 === undefined) delete process.env.INFRA_CLI_EXPECTED_SHA256;
    else process.env.INFRA_CLI_EXPECTED_SHA256 = previousExpectedCliSha256;
  });

  const { deleteFeedbackArtifacts, deleteSklandOwnedData, readPlanReproduction, runPlan } = await import("./infra.ts");

  const planInput = {
    layout: {
      template: "243",
      drone_cap: 200,
      scenario: {},
      rooms: [
        { id: "control", kind: "control_center", level: 5 },
        { id: "power", kind: "power_plant", level: 3 },
      ],
    },
    operbox: [{
      id: "char_002_amiya",
      name: "阿米娅",
      own: true,
      level: 80,
      elite: 2,
      potential: 6,
      rarity: 5,
    }],
    sourceName: "失败链路测试",
    rotation: "abc_12_6_6",
    fiammettaEnable: true,
  };
  for (const deferArtifacts of [false, true]) {
    const failed = await runPlan(planInput, { deferArtifacts });
    assert.equal(failed.success, false);
    assert.ok(failed.runId);
    const recorded = await readPlanReproduction(failed.runId!);
    assert.equal(recorded.available, true);
    assert.equal(recorded.layout?.template, "243");
    assert.equal(recorded.operbox?.[0]?.name, "阿米娅");
    assert.equal(recorded.rotationCount, 3);
    assert.equal(recorded.fiammettaEnabled, true);
    assert.equal("command" in recorded, false);

    const runName = (await readdir(runsRoot)).find((name) => name.includes(failed.runId!));
    assert.ok(runName);
    const files = await readdir(path.join(runsRoot, runName!));
    assert.ok(files.includes("layout.json"));
    assert.ok(files.includes("operbox.json"));
    assert.ok(files.includes("reproduction.json"));
    assert.ok(files.includes(deferArtifacts ? "run-envelope.json" : "result.json"));
    const storedOperbox = JSON.parse(await readFile(path.join(runsRoot, runName!, "operbox.json"), "utf8"));
    assert.equal(storedOperbox[0].name, "阿米娅");
  }
  await rm(path.join(storageRoot, ".skland-legacy-purge-v1.json"), { force: true });

  const reproduction = await readPlanReproduction(reproductionDiagnosticId);
  assert.equal(reproduction.available, true);
  assert.equal(reproduction.rotation, "abc_12_6_6");
  assert.equal(reproduction.rotationCount, 3);
  assert.equal(reproduction.fiammettaEnabled, false);
  assert.equal(reproduction.error, "solver exited");
  assert.equal(reproduction.stderrExcerpt, "debug tail");

  assert.equal(await deleteFeedbackArtifacts(["feedback-delete"]), 1);
  await assert.rejects(stat(deletableFeedback), { code: "ENOENT" });
  await assert.doesNotReject(stat(unrelatedFeedback));
  assert.equal(await deleteFeedbackArtifacts([corruptFeedbackId]), 1);
  await assert.rejects(stat(corruptFeedback), { code: "ENOENT" });

  const expiredAt = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
  await utimes(unrelatedRun, expiredAt, expiredAt);
  assert.deepEqual(await deleteSklandOwnedData([targetOwnerTag]), { runs: 1, feedback: 2 });
  await assert.rejects(stat(targetRun), { code: "ENOENT" });
  await assert.rejects(stat(linkedFeedback), { code: "ENOENT" });
  await assert.rejects(stat(ownedFeedback), { code: "ENOENT" });
  await assert.doesNotReject(stat(unrelatedRun));
  await assert.doesNotReject(stat(unrelatedFeedback));
  await assert.rejects(stat(path.join(storageRoot, ".skland-legacy-purge-v1.json")), { code: "ENOENT" });
});
