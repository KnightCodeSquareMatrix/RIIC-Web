import { normalizePersistedPlanData } from "../src/persistence.ts";
import { PublicApiError } from "../src/server/api-contract.ts";
import { recordPlanRunBestEffort } from "../src/server/business-records.ts";
import { getDatabase } from "../src/server/db/index.ts";
import {
  describePlanArtifact,
  getPlanCacheSolverIdentity,
  runPlan,
} from "../src/server/infra.ts";
import {
  completePlanCache,
  evictPlanCacheKeys,
  recordPlanCacheReferenceBestEffort,
  releasePlanCacheLease,
  resolvePlanCache,
  type PlanCacheResolution,
} from "../src/server/plan-cache.ts";
import { publicPlanSha256, resolveSavedPlanCalculationContext } from "../src/server/plan-result-binding.ts";
import {
  claimNextPlanTask,
  cleanupExpiredPlanTasks,
  completePlanTask,
  recordPlanWorkerHeartbeat,
  recoverStaleRunningTasks,
  type ClaimedPlanTask,
} from "../src/server/plan-task.ts";
import { toPublicPlanData } from "../src/server/public-plan.ts";

const HEARTBEAT_INTERVAL_MS = 5_000;
const CLEANUP_INTERVAL_MS = 60_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function errorCodeOf(error: unknown) {
  return error instanceof PublicApiError ? error.code : "AIC-SYS-5000";
}

async function executeTask(task: ClaimedPlanTask): Promise<void> {
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
        const persistedResult = normalizePersistedPlanData(cache.result, payload.rotation);
        if (!persistedResult) throw new PublicApiError("AIC-SYS-5000");
        const savedPlanContext = payload.operboxContentHmac && payload.operboxHmacKeyVersion
          ? resolveSavedPlanCalculationContext(payload.calculationContext, persistedResult)
          : null;
        const runStored = await recordPlanRunBestEffort({
          diagnosticId: cache.result.diagnosticId,
          userId: task.userId,
          dataOwnerTag: payload.dataOwnerTag,
          sourceType: payload.sourceType,
          status: "success",
          layoutTemplate: payload.layoutTemplate,
          roomCount: payload.roomCount,
          operatorCount: payload.operatorCount,
          rotation: payload.rotation,
          fiammettaEnable: payload.fiammettaEnable,
          durationMs: cache.result.durationMs,
          solver: cacheSolver,
          artifact: null,
          calculationContext: savedPlanContext,
          publicResultSha256: savedPlanContext ? publicPlanSha256(persistedResult) : null,
          operboxContentHmac: savedPlanContext ? payload.operboxContentHmac : null,
          operboxHmacKeyVersion: savedPlanContext ? payload.operboxHmacKeyVersion : null,
        });
        const referenceStored = runStored && await recordPlanCacheReferenceBestEffort({
          cacheKeyHmac: cache.keyHmac,
          diagnosticId: cache.result.diagnosticId,
          userId: payload.cacheReferenceUserId,
        });
        if (!referenceStored) await evictPlanCacheKeys([cache.keyHmac]).catch(() => undefined);
        await completePlanTask(id, { status: "done", result: cache.result });
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
      dataOwnerTag: payload.dataOwnerTag,
    });
    const publicResult = toPublicPlanData(
      result,
      {
        layoutLabel: payload.layoutTemplate,
        sourceName: payload.sourceName ?? "已导入的干员数据",
      },
      id,
    );
    const persistedResult = normalizePersistedPlanData(publicResult, payload.rotation);
    const savedPlanContext = persistedResult && payload.operboxContentHmac && payload.operboxHmacKeyVersion
      ? resolveSavedPlanCalculationContext(payload.calculationContext, persistedResult)
      : null;
    const runStored = await recordPlanRunBestEffort({
      diagnosticId: result.runId ?? id,
      userId: task.userId,
      dataOwnerTag: payload.dataOwnerTag,
      sourceType: payload.sourceType,
      status: result.success ? "success" : "failed",
      layoutTemplate: payload.layoutTemplate,
      roomCount: payload.roomCount,
      operatorCount: payload.operatorCount,
      rotation: payload.rotation,
      fiammettaEnable: payload.fiammettaEnable,
      durationMs: result.durationMs,
      errorCode: result.success ? null : "AIC-PLAN-3004",
      solver: result.solver,
      artifact: await describePlanArtifact(result),
      calculationContext: savedPlanContext,
      publicResultSha256: savedPlanContext && persistedResult ? publicPlanSha256(persistedResult) : null,
      operboxContentHmac: savedPlanContext ? payload.operboxContentHmac : null,
      operboxHmacKeyVersion: savedPlanContext ? payload.operboxHmacKeyVersion : null,
      createdAt: result.startedAt ? new Date(result.startedAt) : new Date(),
    });
    if (lease) {
      const activeLease = lease;
      if (!runStored) {
        await releasePlanCacheLease(activeLease);
      } else {
        const referenceStored = await recordPlanCacheReferenceBestEffort({
          cacheKeyHmac: activeLease.keyHmac,
          diagnosticId: publicResult.diagnosticId,
          userId: payload.cacheReferenceUserId,
        });
        if (referenceStored) await completePlanCache(activeLease, publicResult);
        else await releasePlanCacheLease(activeLease);
      }
      lease = null;
    }
    await completePlanTask(id, { status: "done", result: publicResult });
  } catch (error) {
    if (lease) await releasePlanCacheLease(lease).catch(() => undefined);
    await recordPlanRunBestEffort({
      diagnosticId: id,
      userId: task.userId,
      dataOwnerTag: payload.dataOwnerTag,
      sourceType: payload.sourceType,
      status: "failed",
      layoutTemplate: payload.layoutTemplate,
      roomCount: payload.roomCount,
      operatorCount: payload.operatorCount,
      rotation: payload.rotation,
      fiammettaEnable: payload.fiammettaEnable,
      errorCode: errorCodeOf(error),
      createdAt: new Date(),
    });
    await completePlanTask(id, { status: "failed", error: "排班失败，请重试。" });
    console.error(JSON.stringify({
      level: "error",
      event: "plan_task_failed",
      taskId: id,
      errorCode: errorCodeOf(error),
      errorType: error instanceof Error ? error.name : typeof error,
    }));
  }
}

export async function runPlanWorker(): Promise<void> {
  const releaseSha = process.env.APP_RELEASE_SHA?.trim() ?? "";
  if (!/^[0-9a-f]{40}$/.test(releaseSha)) throw new Error("APP_RELEASE_SHA must be a full lowercase Git commit SHA.");

  const startedAt = new Date();
  const recovery = await recoverStaleRunningTasks(startedAt);
  await cleanupExpiredPlanTasks(startedAt);
  await recordPlanWorkerHeartbeat({ releaseSha, startedAt });
  console.log(`[plan-worker] started release=${releaseSha} recovered=${recovery.recovered} failed=${recovery.failed}`);

  let shuttingDown = false;
  let heartbeatInFlight = false;
  let cleanupInFlight = false;
  const heartbeatTimer = setInterval(() => {
    if (heartbeatInFlight) return;
    heartbeatInFlight = true;
    void recordPlanWorkerHeartbeat({ releaseSha, startedAt })
      .catch((error) => console.error("[plan-worker] heartbeat failed:", error))
      .finally(() => { heartbeatInFlight = false; });
  }, HEARTBEAT_INTERVAL_MS);
  const cleanupTimer = setInterval(() => {
    if (cleanupInFlight) return;
    cleanupInFlight = true;
    void cleanupExpiredPlanTasks()
      .catch((error) => console.error("[plan-worker] cleanup failed:", error))
      .finally(() => { cleanupInFlight = false; });
  }, CLEANUP_INTERVAL_MS);
  heartbeatTimer.unref();
  cleanupTimer.unref();

  process.on("SIGINT", () => { shuttingDown = true; });
  process.on("SIGTERM", () => { shuttingDown = true; });

  while (!shuttingDown) {
    try {
      const task = await claimNextPlanTask();
      if (!task) {
        await sleep(500);
        continue;
      }
      console.log(`[plan-worker] executing task ${task.id} attempt=${task.attempts}`);
      await executeTask(task);
    } catch (error) {
      console.error("[plan-worker] loop error:", error);
      await sleep(2_000);
    }
  }

  clearInterval(heartbeatTimer);
  clearInterval(cleanupTimer);
  console.log("[plan-worker] shutting down");
  await (getDatabase().$client as { end: () => Promise<void> }).end().catch(() => undefined);
}
