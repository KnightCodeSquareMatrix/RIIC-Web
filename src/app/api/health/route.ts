import { getHealth } from "@/server/infra";
import {
  areRateLimitsEnabled,
  createRequestId,
  failureResponse,
  healthHttpStatus,
  isDebugToolsEnabled,
  successResponse,
} from "@/server/api-contract";
import type { PublicHealthData } from "@/types";
import { isSklandFeatureEnabled } from "@/deployment";
import { isPlanTaskQueueEnabled } from "@/server/business-config";
import { getPlanWorkerHealth } from "@/server/plan-task";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const requestId = createRequestId();
  const startedAt = performance.now();
  try {
    const health = await getHealth();
    const taskQueueEnabled = isPlanTaskQueueEnabled();
    const expectedReleaseSha = process.env.APP_RELEASE_SHA?.trim() ?? "";
    const workerHealth = taskQueueEnabled
      ? await getPlanWorkerHealth({ expectedReleaseSha }).catch(() => ({ ready: false, releaseSha: null, heartbeatAt: null }))
      : { ready: false, releaseSha: null, heartbeatAt: null };
    const plannerReady = Boolean(health.ok && health.cliReady && (!taskQueueEnabled || workerHealth.ready));
    const sklandEnabled = isSklandFeatureEnabled();
    const sklandAvailable = Boolean(sklandEnabled && health.sklandConfigured && !health.sklandDisabledReason);
    const data: PublicHealthData = {
      status: plannerReady ? "ready" : "unavailable",
      plannerReady,
      taskQueue: {
        enabled: taskQueueEnabled,
        ready: taskQueueEnabled && workerHealth.ready,
        releaseMatched: taskQueueEnabled && workerHealth.releaseSha === expectedReleaseSha,
      },
      ...(sklandEnabled ? {
        skland: {
          available: sklandAvailable,
          message: sklandAvailable ? null : "当前未开放森空岛登录，可使用 MAA 导入。",
        },
      } : {}),
      features: {
        debugTools: isDebugToolsEnabled(),
        rateLimit: areRateLimitsEnabled(),
      },
    };
    return successResponse(data, requestId, healthHttpStatus(plannerReady));
  } catch (error) {
    return failureResponse(error, requestId, "/api/health", startedAt, "AIC-SYS-5000");
  }
}
