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

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const requestId = createRequestId();
  const startedAt = performance.now();
  try {
    const health = await getHealth();
    const plannerReady = Boolean(health.ok && health.cliReady);
    const sklandEnabled = isSklandFeatureEnabled();
    const sklandAvailable = Boolean(sklandEnabled && health.sklandConfigured && !health.sklandDisabledReason);
    const data: PublicHealthData = {
      status: plannerReady ? "ready" : "unavailable",
      plannerReady,
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

