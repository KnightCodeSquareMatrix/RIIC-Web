import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { chmod, mkdir, mkdtemp, readFile, readdir, realpath, rename, rm, stat, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import path from "node:path";

import type {
  BaseBlueprint,
  CliCandidate,
  DebugBundle,
  FeedbackData,
  FeedbackRequest,
  HealthApiResponse,
  OperBoxEntry,
  PlanApiResponse,
  RotationProfile,
  SolverObservation,
} from "@/types";
import { isSklandConfigured, sklandDisabledReason } from "@/server/skland/session";
import { PublicApiError } from "./api-contract";
import { feedbackDirectoryGroup, toStoredFeedbackIssue } from "./feedback-record";
import {
  PLAN_SCHEMA_VERSION,
  createSolverObservation,
  inspectPlanComputeCapability,
  inspectSolverDeploymentReadiness,
  parsePlanComputePayload,
  solverObservationFromPlanRecord,
} from "./plan-protocol";
import { normalizeRotationResult } from "@/rotation-result";
import { parseShiftFile } from "./shift-parser";
import { isRotationProfile } from "@/rotation-settings";
import {
  isLegacySklandRunDirectoryName,
  isPrivateStorageChild,
  isSafePrivateStorageRoot,
} from "./private-storage";
import { resolveRuntimeDataDir } from "./runtime-data";
import {
  deleteExpiredBusinessRecords,
  queryBusinessRecords,
  recordFeedbackIfEnabled,
  updateFeedbackRecord,
  type PrivateArtifactDescriptor,
} from "./business-records";
import { isBusinessDatabaseReadEnabled, isBusinessFileFallbackEnabled } from "./business-config";

type JsonRecord = Record<string, unknown>;

type PendingServeRequest = {
  key: string;
  request: { id: number; method: string; params: JsonRecord };
  line: string;
  resolve: (value: ServeResult) => void;
  reject: (reason?: unknown) => void;
  timeoutMs: number;
  timer: NodeJS.Timeout | null;
  stderrStart: number;
  resendCount: number;
};

type ServeResult = {
  request: { id: number; method: string; params: JsonRecord };
  response: JsonRecord;
  stdout: string;
  stderr: string;
};

type PlanRequestBody = {
  layout: BaseBlueprint;
  operbox: OperBoxEntry[];
  sourceName?: string | null;
  rotation: RotationProfile;
  fiammettaEnable?: boolean;
  dataOwnerTag?: string | null;
};

const repoRoot = path.resolve(/* turbopackIgnore: true */ process.cwd());
const bundledCliRoot = path.join(repoRoot, "bin");
const bundledDataRoot = path.join(bundledCliRoot, "data");
const bundledFixtureRoot = path.join(repoRoot, "fixtures");
const coreRoot = path.resolve(/* turbopackIgnore: true */ process.env.INFRA_CORE_ROOT || path.join(repoRoot, "..", "ArknightsInfraCalc-v2"));
const storageRoot = path.resolve(/* turbopackIgnore: true */ process.env.BETA_STORAGE_DIR || path.join(repoRoot, "server", "storage"));
const feedbackRoot = path.resolve(/* turbopackIgnore: true */ process.env.BETA_FEEDBACK_DIR || path.join(storageRoot, "feedback"));
const cliRunRoot = path.resolve(/* turbopackIgnore: true */ process.env.BETA_CLI_RUN_DIR || path.join(storageRoot, "cli-runs"));
const cliReleaseRoot = path.resolve(/* turbopackIgnore: true */ process.env.BETA_CLI_RELEASE_DIR || path.join(storageRoot, "cli-releases"));
const activeCliPath = path.join(storageRoot, "active-cli.json");
const timeoutMs = Number(process.env.BETA_CLI_TIMEOUT_MS || 120_000);
const PRIVATE_RECORD_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const PRIVATE_MAINTENANCE_INTERVAL_MS = 60 * 60 * 1000;
const legacySklandPurgeMarker = path.join(storageRoot, ".skland-legacy-purge-v1.json");

function cliCandidates() {
  const platformCliName = process.platform === "win32" ? "infra-cli.exe" : "infra-cli";
  const fallbackCliName = process.platform === "win32" ? "infra-cli" : "infra-cli.exe";
  const bundledPlatformCli = path.join(bundledCliRoot, platformCliName);
  if (process.env.INFRA_CLI_EXPECTED_SHA256 !== undefined) {
    return [bundledPlatformCli];
  }
  const candidates = [
    process.env.INFRA_CLI_PATH,
    readActiveCliPath(),
    bundledPlatformCli,
    path.join(repoRoot, platformCliName),
    path.join(bundledCliRoot, fallbackCliName),
    path.join(repoRoot, fallbackCliName),
    path.join(coreRoot, "target", "release", platformCliName),
    path.join(coreRoot, "target", "debug", platformCliName),
    path.join(coreRoot, "target", "release", fallbackCliName),
    path.join(coreRoot, "target", "debug", fallbackCliName),
  ].filter(Boolean) as string[];

  return [...new Set(candidates.map((candidate) => path.resolve(candidate)))];
}

function readActiveCliPath() {
  try {
    const value = JSON.parse(readFileSync(activeCliPath, "utf-8")) as { path?: unknown };
    return typeof value.path === "string" ? value.path : undefined;
  } catch {
    return undefined;
  }
}

function fileMagic(filePath: string) {
  try {
    return readFileSync(filePath).subarray(0, 4);
  } catch {
    return Buffer.alloc(0);
  }
}

function describeCliCandidate(candidate: string): CliCandidate {
  const exists = existsSync(candidate);
  if (!exists) {
    return {
      path: candidate,
      exists,
      compatible: false,
      reason: "文件不存在",
    };
  }

  const magic = fileMagic(candidate);
  const isWindowsExe = magic[0] === 0x4d && magic[1] === 0x5a;
  const isElf = magic[0] === 0x7f && magic[1] === 0x45 && magic[2] === 0x4c && magic[3] === 0x46;

  if (process.platform === "win32" && isElf) {
    return {
      path: candidate,
      exists,
      compatible: false,
      reason: "Linux ELF 二进制不能在 Windows 直接运行；请设置 INFRA_CLI_PATH 指向 Windows 版 infra-cli.exe。",
    };
  }

  if (process.platform !== "win32" && isWindowsExe) {
    return {
      path: candidate,
      exists,
      compatible: false,
      reason: "Windows PE 二进制不能在当前平台直接运行。",
    };
  }

  return {
    path: candidate,
    exists,
    compatible: true,
    reason: null,
  };
}

function cliCandidateRecords() {
  return cliCandidates().map(describeCliCandidate);
}

function resolveCliPath() {
  const candidates = cliCandidateRecords();
  const found = candidates.find((candidate) => candidate.exists && candidate.compatible);
  if (!found) {
    const details = candidates
      .map((candidate) => {
        const missing = candidate.exists ? "" : "（不存在）";
        const reason = candidate.reason ? `（${candidate.reason}）` : "";
        return `${candidate.path}${missing}${reason}`;
      })
      .join(", ");
    throw new Error(`没有找到可运行的 infra-cli，已检查：${details}`);
  }
  return found.path;
}

function resolveSampleOperboxPath() {
  const candidates = [
    path.join(bundledFixtureRoot, "operbox_full_e2.json"),
    path.join(bundledFixtureRoot, "243", "operbox_full_e2.json"),
    path.join(coreRoot, "data", "fixtures", "243", "operbox_full_e2.json"),
  ].map((candidate) => path.resolve(/* turbopackIgnore: true */ candidate));

  const found = candidates.find((candidate) => existsSync(candidate));
  if (!found) {
    throw new Error(`没有找到样例 operbox，已检查：${candidates.join(", ")}`);
  }
  return found;
}

function isObject(value: unknown): value is JsonRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function assertPlanBody(body: unknown): asserts body is PlanRequestBody {
  if (!isObject(body) || !isObject(body.layout)) {
    throw new Error("请求缺少 layout 对象。");
  }
  if (!Array.isArray(body.operbox) || body.operbox.length === 0) {
    throw new Error("请求缺少非空 operbox 数组。");
  }
  if (!isRotationProfile(body.rotation)) {
    throw new Error("请求缺少受支持的 rotation 参数。");
  }
  if (body.fiammettaEnable != null && typeof body.fiammettaEnable !== "boolean") {
    throw new Error("请求的 fiammetta_enable 参数无效。");
  }
  if (body.dataOwnerTag != null && (typeof body.dataOwnerTag !== "string" || !/^[a-f0-9]{64}$/.test(body.dataOwnerTag))) {
    throw new Error("内部数据归属标识无效。");
  }
}

function safePathSegment(value: unknown) {
  const invalidPathChars = new Set(['<', '>', ':', '"', '/', "\\", "|", "?", "*"]);
  return String(value ?? "")
    .trim()
    .split("")
    .map((char) => (char.charCodeAt(0) < 32 || invalidPathChars.has(char) ? "_" : char))
    .join("")
    .replace(/\s+/g, "_")
    .slice(0, 48);
}

function makeStampedDirName(stamp: string, sourceName: unknown, id: string) {
  return [stamp.replace(/[:.]/g, "-"), safePathSegment(sourceName), id].filter(Boolean).join("_");
}

async function writeJson(filePath: string, value: unknown) {
  await writeFile(filePath, JSON.stringify(value, null, 2), "utf-8");
}

async function readJsonIfExists(filePath: string) {
  try {
    return JSON.parse(await readFile(filePath, "utf-8")) as unknown;
  } catch {
    return undefined;
  }
}

async function artifactDescriptor(
  key: string,
  filePaths: string[],
): Promise<PrivateArtifactDescriptor | null> {
  try {
    const values = await Promise.all(filePaths.map((filePath) => readFile(filePath)));
    const hash = createHash("sha256");
    let bytes = 0;
    for (const value of values) {
      bytes += value.byteLength;
      hash.update(value);
    }
    return { key, bytes, sha256: hash.digest("hex") };
  } catch {
    return null;
  }
}

async function ensurePrivateStorageBoundaries(): Promise<void> {
  const lexicalStorageRoot = path.resolve(/* turbopackIgnore: true */ storageRoot);
  const lexicalRoots = [
    path.resolve(/* turbopackIgnore: true */ cliRunRoot),
    path.resolve(/* turbopackIgnore: true */ feedbackRoot),
  ];
  if (!isSafePrivateStorageRoot(lexicalStorageRoot, [repoRoot, homedir()])) {
    throw new Error("整体存储目录配置过于宽泛。");
  }
  if (lexicalRoots.some((root) => !isPrivateStorageChild(lexicalStorageRoot, root))) {
    throw new Error("运行记录与反馈目录必须位于整体存储根目录内。");
  }
  await Promise.all([
    mkdir(lexicalStorageRoot, { recursive: true }),
    ...lexicalRoots.map((root) => mkdir(root, { recursive: true })),
  ]);
  const [resolvedStorageRoot, ...resolvedRoots] = await Promise.all([
    realpath(/* turbopackIgnore: true */ lexicalStorageRoot),
    ...lexicalRoots.map((root) => realpath(/* turbopackIgnore: true */ root)),
  ]);
  if (
    !isSafePrivateStorageRoot(resolvedStorageRoot, [repoRoot, homedir()])
    || resolvedRoots.some((root) => !isPrivateStorageChild(resolvedStorageRoot, root))
  ) {
    throw new Error("存储目录的真实路径越过了整体存储边界。");
  }
}

async function removePrivateDirectory(root: string, target: string): Promise<boolean> {
  let resolvedStorageRoot: string;
  let resolvedRoot: string;
  let resolvedTarget: string;
  try {
    [resolvedStorageRoot, resolvedRoot, resolvedTarget] = await Promise.all([
      realpath(/* turbopackIgnore: true */ storageRoot),
      realpath(/* turbopackIgnore: true */ root),
      realpath(/* turbopackIgnore: true */ target),
    ]);
  } catch (error) {
    if (isObject(error) && error.code === "ENOENT") return false;
    throw error;
  }
  if (!isSafePrivateStorageRoot(resolvedStorageRoot, [repoRoot, homedir()])) {
    throw new Error("拒绝使用过于宽泛的整体存储根目录删除数据。");
  }
  if (!isPrivateStorageChild(resolvedStorageRoot, resolvedRoot)) {
    throw new Error("运行记录与反馈目录必须位于整体存储根目录内。");
  }
  if (!isSafePrivateStorageRoot(resolvedRoot)) {
    throw new Error("拒绝从过于宽泛的存储根目录删除数据。");
  }
  if (!isPrivateStorageChild(resolvedRoot, resolvedTarget)) throw new Error("拒绝删除存储根目录之外的数据。");
  await rm(resolvedTarget, { recursive: true, force: true });
  return true;
}

async function privateDirectories(root: string) {
  try {
    const entries = await readdir(root, { withFileTypes: true });
    return entries.filter((entry) => entry.isDirectory()).map((entry) => path.join(root, entry.name));
  } catch (error) {
    if (isObject(error) && error.code === "ENOENT") return [];
    throw error;
  }
}

async function runDirectories() {
  return privateDirectories(cliRunRoot);
}

async function feedbackDirectories() {
  return privateDirectories(feedbackRoot);
}

async function ownerMetadata(directory: string): Promise<{ ownerTag?: unknown; diagnosticId?: unknown; sourceName?: unknown } | null> {
  const value = await readJsonIfExists(path.join(directory, "owner.json"));
  return isObject(value) ? value : null;
}

export async function maintainPrivateRecords(now = Date.now()): Promise<void> {
  await ensurePrivateStorageBoundaries();
  const legacyPurgeCompleted = existsSync(legacySklandPurgeMarker);
  const legacyDiagnosticIds = new Set<string>();
  for (const directory of await runDirectories()) {
    const metadata = await ownerMetadata(directory);
    const details = await stat(directory).catch(() => null);
    const expired = Boolean(details && now - details.mtimeMs >= PRIVATE_RECORD_TTL_MS);
    const legacySkland = !legacyPurgeCompleted
      && !metadata?.ownerTag
      && isLegacySklandRunDirectoryName(path.basename(directory));
    if (!expired && !legacySkland) continue;
    const result = await readJsonIfExists(path.join(directory, "result.json"));
    if (legacySkland && isObject(result) && typeof result.runId === "string") legacyDiagnosticIds.add(result.runId);
    await removePrivateDirectory(cliRunRoot, directory);
  }
  if (!legacyPurgeCompleted) {
    for (const directory of await feedbackDirectories()) {
      const meta = await readJsonIfExists(path.join(directory, "meta.json"));
      if (isObject(meta) && typeof meta.diagnosticId === "string" && legacyDiagnosticIds.has(meta.diagnosticId)) {
        await removePrivateDirectory(feedbackRoot, directory);
      }
    }
    await writeJson(legacySklandPurgeMarker, { version: 1, completedAt: new Date(now).toISOString() });
  }
  await deleteExpiredBusinessRecords(new Date(now)).catch(() => {
    console.error(JSON.stringify({ level: "error", event: "business_database_cleanup_failed" }));
  });
}

async function maintainPrivateRecordsIfDue(now = Date.now()): Promise<void> {
  const state = globalForInfra.__infraPrivateMaintenance ??= {
    lastCompletedAt: 0,
    promise: null,
  };
  if (state.promise) return state.promise;
  if (now - state.lastCompletedAt < PRIVATE_MAINTENANCE_INTERVAL_MS) return;

  const pending = maintainPrivateRecords(now).then(() => {
    state.lastCompletedAt = Date.now();
  });
  state.promise = pending;
  try {
    await pending;
  } finally {
    if (state.promise === pending) state.promise = null;
  }
}

export async function deleteSklandOwnedData(ownerTags: string[]): Promise<{ runs: number; feedback: number }> {
  const allowed = new Set(ownerTags.filter((value) => /^[a-f0-9]{64}$/.test(value)));
  if (allowed.size === 0) return { runs: 0, feedback: 0 };
  await maintainPrivateRecords();
  const diagnosticIds = new Set<string>();
  let runs = 0;
  for (const directory of await runDirectories()) {
    const metadata = await ownerMetadata(directory);
    if (typeof metadata?.ownerTag !== "string" || !allowed.has(metadata.ownerTag)) continue;
    if (typeof metadata.diagnosticId === "string") diagnosticIds.add(metadata.diagnosticId);
    await removePrivateDirectory(cliRunRoot, directory);
    runs += 1;
  }
  let feedback = 0;
  for (const directory of await feedbackDirectories()) {
    const meta = await readJsonIfExists(path.join(directory, "meta.json"));
    if (!isObject(meta)) continue;
    const owned = typeof meta.dataOwnerTag === "string" && allowed.has(meta.dataOwnerTag);
    const linked = typeof meta.diagnosticId === "string" && diagnosticIds.has(meta.diagnosticId);
    if (!owned && !linked) continue;
    await removePrivateDirectory(feedbackRoot, directory);
    feedback += 1;
  }
  return { runs, feedback };
}

async function privateRunForDiagnostic(
  diagnosticId: string
): Promise<{ directory: string; result: JsonRecord } | null> {
  if (!/^[a-f0-9-]{36}$/i.test(diagnosticId)) return null;
  const suffix = `_${diagnosticId}`;
  const directory = (await runDirectories())
    .find((candidate) => path.basename(candidate).endsWith(suffix));
  if (!directory) return null;
  const result = await readJsonIfExists(path.join(directory, "result.json"));
  return isObject(result) && result.runId === diagnosticId ? { directory, result } : null;
}

async function readShiftFiles(outputDir: string) {
  try {
    const entries = await readdir(outputDir, { withFileTypes: true });
    const files = entries
      .filter((entry) => entry.isFile() && /^team_shift_.*\.json$/i.test(entry.name))
      .map((entry) => path.join(outputDir, entry.name))
      .sort((left, right) => left.localeCompare(right, undefined, { numeric: true }));

    const shifts: unknown[] = [];
    const errors: string[] = [];
    for (const [index, file] of files.entries()) {
      const raw = await readFile(file, "utf-8").catch(() => null);
      if (!raw) {
        errors.push(`无法读取 ${path.basename(file)}`);
        continue;
      }
      const parsed = parseShiftFile(raw, index);
      if (parsed) shifts.push(parsed);
      else errors.push(`无法解析 ${path.basename(file)}`);
    }

    return { shifts, files, errors };
  } catch {
    return { shifts: [], files: [], errors: [`未找到 output_dir：${outputDir}`] };
  }
}

function countRoomsByKind(layout: BaseBlueprint, kind: string) {
  return Array.isArray(layout.rooms) ? layout.rooms.filter((room) => room.kind === kind).length : 0;
}

function serveErrorMessage(response: JsonRecord) {
  const error = response.error;
  if (isObject(error) && typeof error.message === "string") return error.message;
  return "unknown error";
}

function formatPlanFailure({
  layout,
  response,
  stderr,
}: {
  layout: BaseBlueprint;
  response: JsonRecord;
  stderr: string;
}) {
  const message = serveErrorMessage(response);
  const powerAssignmentsMatch = message.match(/power: expected (\d+) assignments, got (\d+)/);
  const stderrPowerMatch = stderr.match(/发电站:\s*过滤\s*\d+\s*(?:→|->|=>|>)\s*(\d+)/);

  if (powerAssignmentsMatch) {
    const expected = Number(powerAssignmentsMatch[1]);
    const got = Number(powerAssignmentsMatch[2]);
    const layoutPowerRooms = countRoomsByKind(layout, "power_plant") || expected;
    const filteredPowerCount = stderrPowerMatch ? Number(stderrPowerMatch[1]) : got;

    return [
      `发电站候选不足：当前布局有 ${layoutPowerRooms} 个发电站，但 infra-cli 只生成了 ${got} 组发电站排班。`,
      Number.isFinite(filteredPowerCount)
        ? `CLI 日志显示当前 box 筛选后只有 ${filteredPowerCount} 名可用于发电站的候选干员。`
        : undefined,
      layoutPowerRooms > got ? "处理方式：切换到 252/342 等 2 发电站布局，或补足可用于发电站的干员后重新导出 box。" : undefined,
      `原始错误：${message}`,
      stderr?.slice(0, 1200),
    ]
      .filter(Boolean)
      .join("\n");
  }

  return [
    !response.ok && `infra-cli serve error: ${message}`,
    stderr?.slice(0, 1200),
  ]
    .filter(Boolean)
    .join("\n");
}

class InfraCliServeClient {
  private child: ReturnType<typeof spawn> | null = null;
  private cliPath: string | null = null;
  private starting: Promise<void> | null = null;
  private stdoutBuffer = "";
  private stderrLog = "";
  private pending = new Map<string, PendingServeRequest>();
  private nextId = 1;
  private restartCount = 0;

  ensureStarted() {
    if (this.child && !this.child.killed) {
      return Promise.resolve();
    }
    if (this.starting) {
      return this.starting;
    }

    this.starting = new Promise((resolve, reject) => {
      let cliPath = "";
      try {
        cliPath = resolveCliPath();
      } catch (error) {
        this.starting = null;
        reject(error);
        return;
      }

      const dataDir = resolveRuntimeDataDir(cliPath);
      const env = { ...process.env };
      if (dataDir) {
        env.ARKNIGHTS_INFRA_DATA_DIR = dataDir;
      } else {
        delete env.ARKNIGHTS_INFRA_DATA_DIR;
      }
      const cwd = path.dirname(cliPath);
      const child = spawn(/* turbopackIgnore: true */ cliPath, ["serve"], { cwd, env, windowsHide: true, shell: false });
      let settled = false;

      this.child = child;
      this.cliPath = cliPath;
      this.stdoutBuffer = "";
      this.restartCount += 1;

      const settleOk = () => {
        if (settled) return;
        settled = true;
        this.starting = null;
        resolve();
      };
      const settleError = (error: unknown) => {
        if (settled) return;
        settled = true;
        this.starting = null;
        reject(error);
      };

      child.stdout?.on("data", (chunk) => {
        settleOk();
        this.handleStdout(chunk.toString());
      });
      child.stderr?.on("data", (chunk) => {
        this.stderrLog += chunk.toString();
        settleOk();
      });
      child.stdin?.on("error", (error) => {
        this.stderrLog += `stdin error: ${error.message}\n`;
      });
      child.on("spawn", settleOk);
      child.on("error", (error) => {
        this.stderrLog += `spawn error: ${error.message}\n`;
        if (this.child === child) {
          this.child = null;
        }
        settleError(error);
        this.rejectPending(`infra-cli serve 启动失败：${error.message}`);
      });
      child.on("close", (code, signal) => {
        this.handleClose(child, code, signal);
      });
    });

    return this.starting;
  }

  send(method: string, params: JsonRecord, options: { timeoutMs?: number } = {}) {
    const id = this.nextId++;
    const request = { id, method, params };
    const line = JSON.stringify(request);
    const key = JSON.stringify(id);
    const requestTimeoutMs = options.timeoutMs ?? timeoutMs;

    return new Promise<ServeResult>((resolve, reject) => {
      const pending: PendingServeRequest = {
        key,
        request,
        line,
        resolve,
        reject,
        timeoutMs: requestTimeoutMs,
        timer: null,
        stderrStart: this.stderrLog.length,
        resendCount: 0,
      };
      this.pending.set(key, pending);

      this.ensureStarted()
        .then(() => this.writePending(pending))
        .catch((error) => {
          this.pending.delete(key);
          reject(error);
        });
    });
  }

  ping() {
    return this.send("ping", {}, { timeoutMs: 10_000 });
  }

  stop(reason = "infra-cli serve 已停止。") {
    const child = this.child;
    this.child = null;
    this.starting = null;
    this.rejectPending(reason);

    if (!child || child.killed) return;

    child.stdin?.end();
    child.kill();
  }

  private writePending(pending: PendingServeRequest) {
    const child = this.child;
    if (!child || !child.stdin || child.stdin.destroyed) {
      throw new Error("infra-cli serve 未运行。");
    }

    if (pending.timer) {
      clearTimeout(pending.timer);
    }
    pending.stderrStart = this.stderrLog.length;
    pending.timer = setTimeout(() => {
      this.pending.delete(pending.key);
      pending.reject(new Error(`infra-cli serve 请求超时（${pending.timeoutMs}ms）。`));
      child.kill();
    }, pending.timeoutMs);

    try {
      child.stdin.write(`${pending.line}\n`, "utf-8", (error) => {
        if (!error) return;
        if (pending.timer) {
          clearTimeout(pending.timer);
        }
        this.pending.delete(pending.key);
        pending.reject(error);
      });
    } catch (error) {
      if (pending.timer) {
        clearTimeout(pending.timer);
      }
      this.pending.delete(pending.key);
      pending.reject(error);
    }
  }

  private handleStdout(chunk: string) {
    this.stdoutBuffer += chunk;
    for (;;) {
      const newline = this.stdoutBuffer.indexOf("\n");
      if (newline < 0) return;
      const line = this.stdoutBuffer.slice(0, newline).trim();
      this.stdoutBuffer = this.stdoutBuffer.slice(newline + 1);
      if (line) {
        this.handleStdoutLine(line);
      }
    }
  }

  private handleStdoutLine(line: string) {
    let parsed: JsonRecord;
    try {
      parsed = JSON.parse(line) as JsonRecord;
    } catch {
      this.stderrLog += `invalid stdout line: ${line}\n`;
      return;
    }

    const key = JSON.stringify(parsed.id);
    const pending = this.pending.get(key);
    if (!pending) return;

    if (pending.timer) {
      clearTimeout(pending.timer);
    }
    this.pending.delete(key);
    pending.resolve({
      request: pending.request,
      response: parsed,
      stdout: `${line}\n`,
      stderr: this.stderrLog.slice(pending.stderrStart),
    });
  }

  private handleClose(child: ReturnType<typeof spawn>, code: number | null, signal: NodeJS.Signals | null) {
    if (this.child !== child) return;
    this.child = null;
    this.starting = null;
    this.stderrLog += `infra-cli serve exited: code=${code ?? "null"} signal=${signal ?? "null"}\n`;

    const active = [...this.pending.values()];
    if (active.length === 0) return;

    for (const pending of active) {
      if (pending.timer) {
        clearTimeout(pending.timer);
      }
      if (pending.resendCount >= 1) {
        this.pending.delete(pending.key);
        pending.reject(new Error(this.closeErrorMessage(pending, code, signal)));
      } else {
        pending.resendCount += 1;
      }
    }

    if ([...this.pending.values()].some((pending) => pending.resendCount === 1)) {
      this.resendPending();
    }
  }

  private resendPending() {
    this.ensureStarted()
      .then(() => {
        for (const pending of this.pending.values()) {
          this.writePending(pending);
        }
      })
      .catch((error) => {
        this.rejectPending(error instanceof Error ? error.message : String(error));
      });
  }

  private closeErrorMessage(pending: PendingServeRequest, code: number | null, signal: NodeJS.Signals | null) {
    const stderr = this.stderrLog.slice(pending.stderrStart).trim();
    return [
      `infra-cli serve 已退出：code=${code ?? "null"} signal=${signal ?? "null"}`,
      stderr && `stderr:\n${stderr.slice(-2000)}`,
    ]
      .filter(Boolean)
      .join("\n");
  }

  private rejectPending(message: string) {
    for (const pending of this.pending.values()) {
      if (pending.timer) {
        clearTimeout(pending.timer);
      }
      pending.reject(new Error(message));
    }
    this.pending.clear();
  }

  info() {
    return {
      cliPath: this.cliPath,
      pid: this.child?.pid ?? null,
      running: Boolean(this.child && !this.child.killed),
      restartCount: this.restartCount,
    };
  }
}

const globalForInfra = globalThis as typeof globalThis & {
  __infraCliServeClient?: InfraCliServeClient;
  __infraCliCleanupRegistered?: boolean;
  __infraPrivateMaintenance?: {
    lastCompletedAt: number;
    promise: Promise<void> | null;
  };
};

function getServeClient() {
  globalForInfra.__infraCliServeClient ??= new InfraCliServeClient();
  return globalForInfra.__infraCliServeClient;
}

function stopServeClient(reason: string) {
  globalForInfra.__infraCliServeClient?.stop(reason);
}

function registerServeClientCleanup() {
  if (globalForInfra.__infraCliCleanupRegistered) return;
  globalForInfra.__infraCliCleanupRegistered = true;

  process.once("SIGINT", () => {
    stopServeClient("收到 SIGINT，正在关闭 infra-cli serve。");
    process.exit(130);
  });
  process.once("SIGTERM", () => {
    stopServeClient("收到 SIGTERM，正在关闭 infra-cli serve。");
    process.exit(143);
  });
  process.once("exit", () => {
    stopServeClient("进程退出，正在关闭 infra-cli serve。");
  });
}

registerServeClientCleanup();

export async function getHealth(): Promise<HealthApiResponse> {
  void maintainPrivateRecordsIfDue().catch(() => undefined);
  try {
    const candidates = cliCandidateRecords();
    const runnableCandidate = candidates.find((candidate) => candidate.exists && candidate.compatible);
    const cliPath = runnableCandidate?.path;
    const samplePath = (() => {
      try {
        return resolveSampleOperboxPath();
      } catch {
        return null;
      }
    })();
    const dataPath = cliPath ? resolveRuntimeDataDir(cliPath) : null;
    let serve: NonNullable<HealthApiResponse["serve"]> = getServeClient().info();
    let serveError = runnableCandidate
      ? null
      : candidates.find((candidate) => candidate.exists && candidate.reason)?.reason ?? "未找到可运行的 infra-cli。";

    if (cliPath) {
      try {
        const pingResult = await getServeClient().ping();
        const planCompute = inspectPlanComputeCapability(pingResult.response);
        const deploymentReadiness = inspectSolverDeploymentReadiness(
          planCompute,
          process.env.INFRA_CLI_EXPECTED_SHA256
        );
        serve = {
          ...getServeClient().info(),
          protocolMode: planCompute.supported ? "plan.compute" : "legacy",
          planCompute,
        };
        if (!deploymentReadiness.ready) {
          serveError = deploymentReadiness.reason;
        }
      } catch (error) {
        serveError = error instanceof Error ? error.message : String(error);
      }
    }

    return {
      ok: true,
      apiReady: true,
      cliReady: Boolean(cliPath) && !serveError,
      cliPath: cliPath ?? null,
      serve,
      serveError,
      candidates,
      coreRoot,
      repoRoot,
      bundledCliRoot,
      bundledDataRoot,
      samplePath,
      dataPath,
      storageRoot,
      feedbackRoot,
      cliRunRoot,
      sklandConfigured: isSklandConfigured(),
      sklandDisabledReason: sklandDisabledReason(),
    };
  } catch (error) {
    return {
      ok: true,
      apiReady: true,
      cliReady: false,
      cliPath: null,
      sklandConfigured: isSklandConfigured(),
      sklandDisabledReason: sklandDisabledReason(),
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function getPlanCacheSolverIdentity(): Promise<SolverObservation | null> {
  try {
    resolveCliPath();
    const ping = await getServeClient().ping();
    const capability = inspectPlanComputeCapability(ping.response);
    if (!capability.supported || !capability.solverExecutableSha256) return null;
    const readiness = inspectSolverDeploymentReadiness(capability, process.env.INFRA_CLI_EXPECTED_SHA256);
    return readiness.ready ? createSolverObservation(capability, new Date().toISOString()) : null;
  } catch {
    return null;
  }
}

export async function getSampleOperbox() {
  const samplePath = resolveSampleOperboxPath();
  const sample = JSON.parse(await readFile(samplePath, "utf-8")) as unknown;
  return {
    success: true,
    sourceName: "243 全精二示例",
    operbox: sample,
  };
}

export async function saveFeedback(body: FeedbackRequest): Promise<FeedbackData> {
  const savedAt = new Date().toISOString();
  const feedbackId = randomUUID();
  const kind = body.kind ?? "room_issue";
  const dirName = makeStampedDirName(savedAt, feedbackDirectoryGroup(body), feedbackId);
  const feedbackDir = path.join(feedbackRoot, dirName);
  const metaPath = path.join(feedbackDir, "meta.json");
  const issuePath = path.join(feedbackDir, "issue.json");
  await mkdir(feedbackDir, { recursive: true });

  const linkedRun = await privateRunForDiagnostic(body.diagnosticId);
  const owner = linkedRun ? await ownerMetadata(linkedRun.directory) : null;
  const dataOwnerTag = owner?.diagnosticId === body.diagnosticId && typeof owner.ownerTag === "string"
    ? owner.ownerTag
    : null;
  const solver = solverObservationFromPlanRecord(linkedRun?.result);
  const meta = {
    feedbackId,
    savedAt,
    diagnosticId: body.diagnosticId,
    kind,
    consent: body.consent,
    solver,
    ...(dataOwnerTag ? { dataOwnerTag } : {}),
  };

  await writeJson(metaPath, meta);
  await writeJson(issuePath, toStoredFeedbackIssue(body));
  await recordFeedbackIfEnabled({
    feedbackId,
    savedAt: new Date(savedAt),
    body,
    artifact: await artifactDescriptor(feedbackId, [metaPath, issuePath]),
  });

  return {
    feedbackId,
    savedAt,
  };
}

export async function describePlanArtifact(result: PlanApiResponse): Promise<PrivateArtifactDescriptor | null> {
  if (!result.runId || !result.resultPath) return null;
  const resolved = path.resolve(/* turbopackIgnore: true */ result.resultPath);
  const root = path.resolve(/* turbopackIgnore: true */ cliRunRoot);
  if (!isPrivateStorageChild(root, resolved)) return null;
  return artifactDescriptor(result.runId, [resolved]);
}

export async function runPlan(body: unknown): Promise<PlanApiResponse> {
  let runDir = "";
  let ephemeralRunDir = "";
  let resultPath = "";
  let solver: SolverObservation | undefined;
  const startedAt = new Date().toISOString();
  const start = performance.now();

  try {
    // Record retention is housekeeping. A corrupt legacy record must not block planning.
    void maintainPrivateRecordsIfDue().catch(() => undefined);
    assertPlanBody(body);

    const cliPath = resolveCliPath();
    const runId = randomUUID();
    runDir = path.join(cliRunRoot, makeStampedDirName(startedAt, body.sourceName, runId));
    try {
      await mkdir(runDir, { recursive: true });
    } catch {
      ephemeralRunDir = await mkdtemp(path.join(tmpdir(), "arknights-infra-run-"));
      runDir = ephemeralRunDir;
    }
    if (body.dataOwnerTag) {
      await writeJson(path.join(runDir, "owner.json"), {
        version: 1,
        ownerTag: body.dataOwnerTag,
        diagnosticId: runId,
        sourceName: body.sourceName ?? null,
        createdAt: startedAt,
      });
    }

    const layoutPath = path.join(runDir, "layout.json");
    const operboxPath = path.join(runDir, "operbox.json");
    const profilePath = path.join(runDir, "profile.json");
    const maaPath = path.join(runDir, "maa.json");
    const shiftsDir = path.join(runDir, "shifts");
    const debugBundlePath = path.join(runDir, "debug-bundle.json");
    const stdoutPath = path.join(runDir, "stdout.txt");
    const stderrPath = path.join(runDir, "stderr.txt");
    const commandPath = path.join(runDir, "command.txt");
    const serveRequestPath = path.join(runDir, "serve-request.json");
    const serveRequestLinePath = path.join(runDir, "serve-request.jsonl");
    const serveResponsePath = path.join(runDir, "serve-response.json");
    resultPath = path.join(runDir, "result.json");

    // 只把已拥有的干员交给求解器：未拥有干员 level=0 会违反 plan.compute schema，且排班用不到它们
    // 去重：同名保留第一个；阿米娅变体直接删除
    const seenNames = new Set<string>();
    const skipNames = new Set(["阿米娅（近卫）", "阿米娅（医疗）"]);
    body.operbox = body.operbox.filter((entry) => {
      if (!entry.own) return false;
      const name = entry.name.trim();
      if (skipNames.has(name) || seenNames.has(name)) return false;
      seenNames.add(name);
      return true;
    });
    if (body.operbox.length === 0) {
      throw new PublicApiError("AIC-BOX-1101", {
        fieldErrors: [{
          path: "operbox",
          code: "invalid_operbox",
          message: "干员数据中没有已拥有的干员，无法生成排班。",
        }],
      });
    }

    await writeJson(layoutPath, body.layout);
    await writeJson(operboxPath, body.operbox);

    const pingResult = await getServeClient().ping();
    const planCompute = inspectPlanComputeCapability(pingResult.response);
    solver = createSolverObservation(planCompute, new Date().toISOString());
    let serveResult: ServeResult;
    let profileJson: unknown;
    let maaJson: unknown;
    let trainingRoomJson: unknown;
    let trainingAdviceJson: unknown;
    let rotationSource: unknown;
    let serveShifts: unknown[] = [];
    let shiftFiles: string[] = [];
    let shiftReadErrors: string[] = [];
    let shiftsPath: string | undefined;
    let responseValidationError: string | undefined;

    if (planCompute.supported) {
      serveResult = await getServeClient().send("plan.compute", {
        schema_version: PLAN_SCHEMA_VERSION,
        layout: body.layout,
        operbox: body.operbox,
        labels: {
          layout: body.layout.template ?? null,
          operbox: body.sourceName ?? null,
        },
        options: {
          rotation: body.rotation,
          top: 20,
          system_preferences: {},
          maa_title: `${body.sourceName ?? "Arknights InfraCalc"} · ${String(body.layout.template ?? "layout")}`,
          fiammetta_enable: body.fiammettaEnable ?? true,
        },
      });

      let payload: ReturnType<typeof parsePlanComputePayload> = null;
      try {
        payload = parsePlanComputePayload(serveResult.response);
      } catch (error) {
        responseValidationError = error instanceof Error ? error.message : String(error);
      }
      profileJson = payload?.profile;
      maaJson = payload?.maa;
      trainingRoomJson = payload?.trainingRoom;
      trainingAdviceJson = payload?.trainingAdvice;
      rotationSource = payload?.rotation;
      serveShifts = payload && Array.isArray(payload.rotation.shifts) ? payload.rotation.shifts : [];
      if (profileJson) await writeJson(profilePath, profileJson);
      if (maaJson) await writeJson(maaPath, maaJson);
    } else {
      serveResult = await getServeClient().send("plan", {
        layout: layoutPath,
        operbox: operboxPath,
        profile_out: profilePath,
        maa_out: maaPath,
        output_dir: shiftsDir,
        top: 20,
        rotation: body.rotation,
        maa_title: `${body.sourceName ?? "Arknights InfraCalc"} · ${String(body.layout.template ?? "layout")}`,
      });

      profileJson = await readJsonIfExists(profilePath);
      maaJson = await readJsonIfExists(maaPath);
      const shiftRead = await readShiftFiles(shiftsDir);
      const responseResult = isObject(serveResult.response.result) ? serveResult.response.result : undefined;
      trainingAdviceJson = responseResult && typeof responseResult === "object"
        ? (responseResult as { training_advice?: unknown }).training_advice
        : undefined;
      rotationSource = responseResult;
      const responseShifts = responseResult && Array.isArray(responseResult.shifts) ? responseResult.shifts : [];
      serveShifts = responseShifts.length > 0 ? responseShifts : shiftRead.shifts;
      shiftFiles = shiftRead.files.map((file) => path.relative(repoRoot, file));
      shiftReadErrors = shiftRead.errors;
      shiftsPath = path.relative(repoRoot, shiftsDir);
    }

    const durationMs = Math.round(performance.now() - start);
    const command = `${cliPath} serve < ${path.relative(repoRoot, serveRequestLinePath)}`;
    await writeFile(commandPath, command, "utf-8");
    await writeJson(serveRequestPath, serveResult.request);
    await writeFile(serveRequestLinePath, `${JSON.stringify(serveResult.request)}\n`, "utf-8");
    await writeJson(serveResponsePath, serveResult.response);

    const rotationJson = normalizeRotationResult({
      source: rotationSource,
      shifts: serveShifts,
      profile: profileJson,
      fallbackProfile: body.rotation,
    });
    await writeFile(stdoutPath, serveResult.stdout, "utf-8");
    await writeFile(stderrPath, serveResult.stderr, "utf-8");

    const success = serveResult.response.ok === true && Boolean(profileJson) && Boolean(maaJson);
    const debugBundle: DebugBundle = {
      version: "beta-test-bundle-v2-next-serve",
      startedAt,
      durationMs,
      cliPath,
      command,
      exitCode: success ? 0 : null,
      signal: null,
      inputSummary: {
        layoutRooms: Array.isArray(body.layout.rooms) ? body.layout.rooms.length : null,
        operboxCount: body.operbox.length,
        sourceName: body.sourceName ?? null,
      },
      layout: body.layout,
      operbox: body.operbox,
      profileJson: profileJson as DebugBundle["profileJson"],
      maaJson: maaJson as DebugBundle["maaJson"],
      rotationJson: rotationJson as DebugBundle["rotationJson"],
      solver,
      shiftFiles,
      shiftReadErrors,
      serveRequest: serveResult.request,
      serveResponse: serveResult.response,
      stdout: serveResult.stdout,
      stderr: serveResult.stderr,
      savedFiles: ephemeralRunDir ? undefined : {
        runDir: path.relative(repoRoot, runDir),
        layout: path.relative(repoRoot, layoutPath),
        operbox: path.relative(repoRoot, operboxPath),
        profile: profileJson ? path.relative(repoRoot, profilePath) : undefined,
        maa: maaJson ? path.relative(repoRoot, maaPath) : undefined,
        shifts: shiftsPath,
        debugBundle: path.relative(repoRoot, debugBundlePath),
        stdout: path.relative(repoRoot, stdoutPath),
        stderr: path.relative(repoRoot, stderrPath),
        command: path.relative(repoRoot, commandPath),
        serveRequest: path.relative(repoRoot, serveRequestPath),
        serveRequestLine: path.relative(repoRoot, serveRequestLinePath),
        serveResponse: path.relative(repoRoot, serveResponsePath),
        result: path.relative(repoRoot, resultPath),
      },
    };
    await writeJson(debugBundlePath, debugBundle);

    const resultPayload: PlanApiResponse = {
      success,
      startedAt,
      durationMs,
      cliPath,
      command,
      exitCode: success ? 0 : null,
      signal: null,
      stdout: serveResult.stdout,
      stderr: serveResult.stderr,
      profileJson: profileJson as PlanApiResponse["profileJson"],
      maaJson: maaJson as PlanApiResponse["maaJson"],
      trainingRoomJson: trainingRoomJson as PlanApiResponse["trainingRoomJson"],
      trainingAdviceJson: trainingAdviceJson as PlanApiResponse["trainingAdviceJson"],
      rotationJson: rotationJson as PlanApiResponse["rotationJson"],
      solver,
      debugBundle,
      runId,
      runPath: runDir,
      relativeRunPath: path.relative(repoRoot, runDir),
      resultPath,
      relativeResultPath: path.relative(repoRoot, resultPath),
      error: success
        ? undefined
        : responseValidationError ??
          formatPlanFailure({
            layout: body.layout,
            response: serveResult.response,
            stderr: serveResult.stderr,
          }),
    };
    await writeJson(resultPath, resultPayload);

    return resultPayload;
  } catch (error) {
    // 显式的 API 校验错误（如空 box）直接透传，由路由映射为对应 HTTP 状态码
    if (error instanceof PublicApiError) throw error;
    const errorPayload: PlanApiResponse = {
      success: false,
      startedAt,
      solver,
      error: error instanceof Error ? error.message : String(error),
      runPath: runDir || undefined,
      relativeRunPath: runDir ? path.relative(repoRoot, runDir) : undefined,
    };
    if (resultPath) {
      await writeJson(resultPath, errorPayload);
    }
    return errorPayload;
  } finally {
    if (ephemeralRunDir) await rm(ephemeralRunDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

export async function listOpsRecords() {
  const databaseReads = isBusinessDatabaseReadEnabled();
  const recordsPromise = (async () => {
    if (databaseReads) {
      try {
        const [feedbackRecords, runRecords] = await Promise.all([
          queryBusinessRecords({ kind: "feedback", limit: 100 }),
          queryBusinessRecords({ kind: "runs", limit: 100 }),
        ]);
        return { feedbackRecords, runRecords };
      } catch (error) {
        if (!isBusinessFileFallbackEnabled()) throw error;
      }
    }
    const [feedbackRecords, runRecords] = await Promise.all([
      listStoredRecords(feedbackRoot, "meta.json", "issue.json"),
      listStoredRecords(cliRunRoot, "result.json", "debug-bundle.json"),
    ]);
    return { feedbackRecords, runRecords };
  })();
  const [{ feedbackRecords, runRecords }, releases, health, storage] = await Promise.all([
    recordsPromise,
    listCliReleases(),
    getHealth(),
    getOpsStorageStats(),
  ]);
  const feedback = databaseReads && "items" in feedbackRecords
    ? feedbackRecords.items.map((data) => ({ id: "id" in data ? String(data.id) : "", data, ops: { status: "status" in data ? data.status : null, note: "adminNote" in data ? data.adminNote : null } }))
    : feedbackRecords;
  const runs = databaseReads && "items" in runRecords
    ? runRecords.items.map((data) => ({ id: "diagnosticId" in data ? String(data.diagnosticId) : "", data, ops: null }))
    : runRecords;
  return { feedback, runs, releases, health, storage, activeCli: readActiveCliPath() ?? null };
}

async function listStoredRecords(root: string, primary: string, fallback: string) {
  const entries = await readdir(root, { withFileTypes: true }).catch(() => []);
  return Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .sort((a, b) => b.name.localeCompare(a.name))
      .slice(0, 200)
      .map(async (entry) => {
        const dir = path.join(root, entry.name);
        const data = (await readJsonIfExists(path.join(dir, primary))) ?? (await readJsonIfExists(path.join(dir, fallback)));
        const ops = await readJsonIfExists(path.join(dir, "ops.json"));
        return { id: entry.name, data, ops };
      })
  );
}

async function directorySize(root: string): Promise<number> {
  const entries = await readdir(root, { withFileTypes: true }).catch(() => []);
  const sizes = await Promise.all(entries.map(async (entry) => {
    const filePath = path.join(root, entry.name);
    return entry.isDirectory() ? directorySize(filePath) : stat(filePath).then((item) => item.size).catch(() => 0);
  }));
  return sizes.reduce((sum, size) => sum + size, 0);
}

async function getOpsStorageStats() {
  const [feedbackBytes, runBytes, releaseBytes] = await Promise.all([
    directorySize(feedbackRoot), directorySize(cliRunRoot), directorySize(cliReleaseRoot),
  ]);
  return { feedbackBytes, runBytes, releaseBytes, totalBytes: feedbackBytes + runBytes + releaseBytes };
}

export async function updateFeedbackOps(id: string, status: string, note: string) {
  if (!/^[\w.-]+$/.test(id)) throw new Error("记录 ID 非法。");
  if (!["pending", "working", "resolved"].includes(status)) throw new Error("状态非法。");
  if (isBusinessDatabaseReadEnabled()) {
    const updated = await updateFeedbackRecord({
      feedbackId: id,
      status: status as "pending" | "working" | "resolved",
      note,
    });
    if (updated || !isBusinessFileFallbackEnabled()) {
      if (!updated) throw new Error("记录不存在。");
      return updated;
    }
  }
  const dir = path.join(feedbackRoot, id);
  await stat(dir);
  const value = { status, note: note.trim().slice(0, 2000), updatedAt: new Date().toISOString() };
  await writeJson(path.join(dir, "ops.json"), value);
  return value;
}

export async function readOpsRecord(kind: "feedback" | "runs", id: string) {
  if (!/^[\w.-]+$/.test(id)) throw new Error("记录 ID 非法。");
  const root = kind === "feedback" ? feedbackRoot : cliRunRoot;
  const dir = path.join(root, id);
  const names = kind === "feedback"
    ? ["meta.json", "issue.json", "debug-bundle.json"]
    : ["result.json", "debug-bundle.json", "stderr.txt", "stdout.txt"];
  const files = await Promise.all(names.map(async (name) => [name, await readFile(path.join(dir, name), "utf-8").catch(() => null)]));
  if (files.every(([, value]) => value === null)) throw new Error("记录不存在。");
  return Object.fromEntries(files);
}

async function listCliReleases() {
  const entries = await readdir(/* turbopackIgnore: true */ cliReleaseRoot, { withFileTypes: true }).catch(() => []);
  return Promise.all(entries.filter((entry) => entry.isDirectory()).map(async (entry) => {
    const metadata = await readJsonIfExists(path.join(cliReleaseRoot, entry.name, "metadata.json"));
    return { id: entry.name, metadata };
  })).then((items) => items.sort((a, b) => b.id.localeCompare(a.id)));
}

export async function uploadCliRelease(file: File, label: string) {
  if (!file.size || file.size > 150 * 1024 * 1024) throw new Error("CLI 文件必须在 1B 到 150MB 之间。");
  const bytes = Buffer.from(await file.arrayBuffer());
  const isElf = bytes[0] === 0x7f && bytes[1] === 0x45 && bytes[2] === 0x4c && bytes[3] === 0x46;
  const isPe = bytes[0] === 0x4d && bytes[1] === 0x5a;
  if (!isElf && !isPe) throw new Error("仅接受 ELF 或 Windows PE 可执行文件。");
  const platform = isPe ? "windows" : "linux";
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const uploadedAt = new Date().toISOString();
  const id = `${uploadedAt.replace(/[:.]/g, "-")}_${sha256.slice(0, 12)}`;
  const releaseDir = path.join(cliReleaseRoot, id);
  const binaryPath = path.join(releaseDir, isPe ? "infra-cli.exe" : "infra-cli");
  await mkdir(releaseDir, { recursive: false });
  await writeFile(binaryPath, bytes, { flag: "wx" });
  if (!isPe) await chmod(binaryPath, 0o750);
  const metadata = { id, label: label.trim().slice(0, 80) || file.name, originalName: file.name, platform, size: file.size, sha256, uploadedAt, path: binaryPath };
  await writeJson(path.join(releaseDir, "metadata.json"), metadata);
  return metadata;
}

export async function publishCliRelease(file: File, label: string) {
  const metadata = await uploadCliRelease(file, label);
  const active = await activateCliRelease(metadata.id);
  return { ...metadata, active };
}

export async function activateCliRelease(id: string) {
  if (!/^[\w.-]+$/.test(id)) throw new Error("Release ID 非法。");
  const metadata = await readJsonIfExists(path.join(cliReleaseRoot, id, "metadata.json"));
  if (!isObject(metadata) || typeof metadata.path !== "string") throw new Error("Release 不存在。");
  const candidate = describeCliCandidate(metadata.path);
  if (!candidate.exists || !candidate.compatible) throw new Error(candidate.reason || "CLI 不可用。");
  await stat(metadata.path);
  await mkdir(storageRoot, { recursive: true });
  const temp = `${activeCliPath}.${randomUUID()}.tmp`;
  await writeJson(temp, { releaseId: id, path: metadata.path, activatedAt: new Date().toISOString() });
  await rename(temp, activeCliPath);
  stopServeClient("CLI 版本已切换，等待下次请求重启。");
  return { releaseId: id, path: metadata.path };
}

export async function runOpsSmokeTest() {
  const sample = await getSampleOperbox();
  const layout = JSON.parse(await readFile(path.join(repoRoot, "src", "layouts", "243.json"), "utf-8")) as BaseBlueprint;
  return runPlan({
    layout,
    operbox: sample.operbox as OperBoxEntry[],
    sourceName: "ops-smoke-243-full-e2",
    rotation: "abc_12_6_6",
  });
}
