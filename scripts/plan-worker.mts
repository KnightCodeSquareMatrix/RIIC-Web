// 排班任务队列 Worker：独立进程，单线程消费 plan_task。
// 运行：npm run worker:plan（或 node --experimental-strip-types --import ./scripts/ts-path-loader.mjs scripts/plan-worker.mts）
import nextEnv from "@next/env";

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
  releasePlanCacheLease,
  resolvePlanCache,
  type PlanCacheResolution,
} from "../src/server/plan-cache.ts";
import {
  claimNextPlanTask,
  completePlanTask,
  recoverStaleRunningTasks,
  type PlanTaskRow,
} from "../src/server/plan-task.ts";
import { toPublicPlanData } from "../src/server/public-plan.ts";

const { loadEnvConfig } = nextEnv;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function errorCodeOf(error: unknown): string {
  return error instanceof PublicApiError ? error.code : "AIC-SYS-5000";
}

async function executeTask(task: PlanTaskRow): Promise<void> {
  const { id, payload } = task;
  let lease: Extract<PlanCacheResolution, { kind: "lease" }> | null = null;
  try {
    // 缓存快路径：命中直接完成，不占用求解器。
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
        await recordPlanRunBestEffort({
          diagnosticId: cache.result.diagnosticId,
          userId: task.userId,
          dataOwnerTag: payload.dataOwnerTag ?? null,
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
        });
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
    await recordPlanRunBestEffort({
      diagnosticId: result.runId ?? id,
      userId: task.userId,
      dataOwnerTag: payload.dataOwnerTag ?? null,
      sourceType: payload.sourceType,
      status: result.success ? "success" : "failed",
      layoutTemplate: payload.layoutTemplate,
      roomCount: payload.roomCount,
      operatorCount: payload.operatorCount,
      rotation: payload.rotation,
      fiammettaEnable: payload.fiammettaEnable,
      durationMs: result.durationMs,
      errorCode: result.success ? null : (result.error && typeof result.error === "object" && "code" in result.error
        ? String((result.error as { code?: unknown }).code)
        : "AIC-PLAN-3004"),
      solver: result.solver,
      artifact: await describePlanArtifact(result),
      createdAt: result.startedAt ? new Date(result.startedAt) : new Date(),
    });
    if (lease) await completePlanCache(lease, publicResult);
    await completePlanTask(id, { status: "done", result: publicResult });
  } catch (error) {
    if (lease) await releasePlanCacheLease(lease).catch(() => undefined);
    const message = error instanceof Error ? error.message : String(error);
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
      errorCode: errorCodeOf(error),
      createdAt: new Date(),
    });
    await completePlanTask(id, { status: "failed", error: message });
    console.error(`[plan-worker] task ${id} failed: ${message}`);
  }
}

async function main(): Promise<void> {
  loadEnvConfig(process.cwd());
  const recovered = await recoverStaleRunningTasks();
  console.log(`[plan-worker] started, recovered ${recovered} stale running task(s)`);

  let shuttingDown = false;
  process.on("SIGINT", () => { shuttingDown = true; });
  process.on("SIGTERM", () => { shuttingDown = true; });

  while (!shuttingDown) {
    try {
      const task = await claimNextPlanTask();
      if (!task) {
        await sleep(500);
        continue;
      }
      console.log(`[plan-worker] executing task ${task.id} (attempt ${task.attempts})`);
      await executeTask(task);
    } catch (error) {
      console.error("[plan-worker] loop error:", error);
      await sleep(2_000);
    }
  }

  console.log("[plan-worker] shutting down");
  await (getDatabase().$client as { end: () => Promise<void> }).end().catch(() => undefined);
}

void main();
