import "server-only";

import { normalizePersistedPlanData } from "@/persistence";
import type { AppErrorCode, PublicPlanData } from "@/types";

import { ERROR_DEFINITIONS, PublicApiError } from "./api-contract";
import { recordPlanRunBestEffort } from "./business-records";
import {
  describePlanArtifact,
  getPlanCacheSolverIdentity,
  runPlan,
} from "./infra";
import {
  completePlanCache,
  evictPlanCacheKeys,
  recordPlanCacheReferenceBestEffort,
  releasePlanCacheLease,
  resolvePlanCache,
  type PlanCacheResolution,
} from "./plan-cache";
import { publicPlanSha256, resolveSavedPlanCalculationContext } from "./plan-result-binding";
import {
  claimNextPlanTask,
  completePlanTask,
  deleteExpiredPlanTasks,
  isCurrentPlanTaskAttempt,
  recoverStaleRunningTasks,
  type PlanTaskPayload,
  type PlanTaskRow,
} from "./plan-task";
import { toPublicPlanData } from "./public-plan";
import { validateSavedPlanCalculationContext } from "./workspace-payload";

const IDLE_POLL_MS = 500;
const FAILURE_RETRY_MS = 2_000;
const MAINTENANCE_INTERVAL_MS = 30_000;

type WorkerState = {
  running: boolean;
  lastMaintenanceAt: number;
};

const workerGlobal = globalThis as typeof globalThis & {
  __aicPlanTaskWorker?: WorkerState;
};
const workerState = workerGlobal.__aicPlanTaskWorker ??= {
  running: false,
  lastMaintenanceAt: 0,
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    timer.unref();
  });
}

function errorCodeOf(error: unknown): AppErrorCode {
  return error instanceof PublicApiError ? error.code : "AIC-SYS-5000";
}

function publicErrorMessage(error: unknown): string {
  const code = errorCodeOf(error);
  return error instanceof PublicApiError
    ? error.message
    : ERROR_DEFINITIONS[code].message;
}

function savedPlanContext(payload: PlanTaskPayload, result: PublicPlanData) {
  if (!payload.operboxContentHmac || !payload.operboxHmacKeyVersion) return null;
  const solverContext = validateSavedPlanCalculationContext({
    presetLabel: payload.layoutTemplate,
    layout: payload.layout,
    rotationProfile: payload.rotation,
    fiammettaEnabled: payload.fiammettaEnable,
  });
  const persistedResult = normalizePersistedPlanData(result, payload.rotation);
  return solverContext && persistedResult
    ? resolveSavedPlanCalculationContext(solverContext, persistedResult)
    : null;
}

async function recordSuccessfulTask(input: {
  task: PlanTaskRow;
  result: PublicPlanData;
  solver: Awaited<ReturnType<typeof getPlanCacheSolverIdentity>> | undefined;
  artifact: Awaited<ReturnType<typeof describePlanArtifact>>;
  createdAt?: Date;
}): Promise<boolean> {
  const { task, result, solver, artifact } = input;
  const calculationContext = savedPlanContext(task.payload, result);
  return recordPlanRunBestEffort({
    diagnosticId: result.diagnosticId,
    userId: task.userId,
    dataOwnerTag: task.payload.dataOwnerTag ?? null,
    sourceType: task.payload.sourceType,
    status: "success",
    layoutTemplate: task.payload.layoutTemplate,
    roomCount: task.payload.roomCount,
    operatorCount: task.payload.operatorCount,
    rotation: task.payload.rotation,
    fiammettaEnable: task.payload.fiammettaEnable,
    durationMs: result.durationMs,
    solver,
    artifact,
    calculationContext,
    publicResultSha256: calculationContext ? publicPlanSha256(result) : null,
    operboxContentHmac: calculationContext ? task.payload.operboxContentHmac ?? null : null,
    operboxHmacKeyVersion: calculationContext ? task.payload.operboxHmacKeyVersion ?? null : null,
    createdAt: input.createdAt,
  });
}

async function storeCacheReference(
  lease: Extract<PlanCacheResolution, { kind: "lease" }> | { kind: "hit"; keyHmac: string },
  task: PlanTaskRow,
  diagnosticId: string,
): Promise<boolean> {
  return recordPlanCacheReferenceBestEffort({
    cacheKeyHmac: lease.keyHmac,
    diagnosticId,
    userId: task.payload.sourceType === "maa" ? task.userId : null,
  });
}

async function executeTask(task: PlanTaskRow): Promise<void> {
  const { id, payload } = task;
  let lease: Extract<PlanCacheResolution, { kind: "lease" }> | null = null;
  try {
    const cacheSolver = await getPlanCacheSolverIdentity();
    if (cacheSolver) {
      const cache = await resolvePlanCache({
        layout: payload.layout,
        operbox: payload.operbox,
        sourceType: payload.sourceType,
        sourceName: payload.sourceName ?? "",
        rotation: payload.rotation,
        fiammettaEnable: payload.fiammettaEnable,
        solver: cacheSolver,
      });
      if (cache.kind === "hit") {
        if (!await isCurrentPlanTaskAttempt(id, task.attempts)) return;
        const runStored = await recordSuccessfulTask({
          task,
          result: cache.result,
          solver: cacheSolver,
          artifact: null,
        });
        const referenceStored = runStored
          && await storeCacheReference(cache, task, cache.result.diagnosticId);
        if (!referenceStored) await evictPlanCacheKeys([cache.keyHmac]).catch(() => undefined);
        await completePlanTask(id, { status: "done", result: cache.result }, task.attempts);
        return;
      }
      if (cache.kind === "lease") lease = cache;
    }

    const result = await runPlan({
      layout: payload.layout,
      operbox: payload.operbox,
      sourceName: payload.sourceName,
      rotation: payload.rotation,
      fiammettaEnable: payload.fiammettaEnable,
      dataOwnerTag: payload.dataOwnerTag ?? null,
    });
    const publicResult = toPublicPlanData(
      result,
      {
        layoutLabel: payload.layoutTemplate,
        sourceName: payload.sourceName ?? "已导入的干员数据",
      },
      id,
    );
    if (!await isCurrentPlanTaskAttempt(id, task.attempts)) {
      if (lease) await releasePlanCacheLease(lease).catch(() => undefined);
      return;
    }
    const runStored = await recordSuccessfulTask({
      task,
      result: publicResult,
      solver: result.solver,
      artifact: await describePlanArtifact(result),
      createdAt: result.startedAt ? new Date(result.startedAt) : new Date(),
    });
    if (lease) {
      const activeLease = lease;
      if (!runStored) {
        await releasePlanCacheLease(activeLease);
      } else {
        const referenceStored = await storeCacheReference(activeLease, task, publicResult.diagnosticId);
        if (referenceStored) await completePlanCache(activeLease, publicResult);
        else await releasePlanCacheLease(activeLease);
      }
      lease = null;
    }
    await completePlanTask(id, { status: "done", result: publicResult }, task.attempts);
  } catch (error) {
    if (lease) await releasePlanCacheLease(lease).catch(() => undefined);
    if (!await isCurrentPlanTaskAttempt(id, task.attempts)) return;
    const code = errorCodeOf(error);
    await recordPlanRunBestEffort({
      diagnosticId: id,
      userId: task.userId,
      dataOwnerTag: payload.dataOwnerTag ?? null,
      sourceType: payload.sourceType,
      status: "failed",
      layoutTemplate: payload.layoutTemplate,
      roomCount: payload.roomCount,
      operatorCount: payload.operatorCount,
      rotation: payload.rotation,
      fiammettaEnable: payload.fiammettaEnable,
      errorCode: code,
      createdAt: new Date(),
    });
    await completePlanTask(id, { status: "failed", error: publicErrorMessage(error) }, task.attempts);
    console.error(JSON.stringify({ level: "error", event: "plan_task_failed", taskId: id, code }));
  }
}

async function runMaintenance(): Promise<void> {
  const now = Date.now();
  if (now - workerState.lastMaintenanceAt < MAINTENANCE_INTERVAL_MS) return;
  workerState.lastMaintenanceAt = now;
  const recovered = await recoverStaleRunningTasks(new Date(now));
  const deleted = await deleteExpiredPlanTasks(new Date(now));
  if (recovered > 0 || deleted > 0) {
    console.info(JSON.stringify({ level: "info", event: "plan_task_maintenance", recovered, deleted }));
  }
}

async function runWorker(): Promise<void> {
  while (workerState.running) {
    try {
      await runMaintenance();
      const task = await claimNextPlanTask();
      if (!task) {
        await sleep(IDLE_POLL_MS);
        continue;
      }
      await executeTask(task);
    } catch {
      console.error(JSON.stringify({ level: "error", event: "plan_task_worker_loop_failed" }));
      await sleep(FAILURE_RETRY_MS);
    }
  }
}

export function ensurePlanTaskWorkerStarted(): void {
  if (workerState.running) return;
  workerState.running = true;
  void runWorker().finally(() => {
    workerState.running = false;
  });
}
