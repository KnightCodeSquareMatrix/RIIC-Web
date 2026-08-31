import {
  assertSameOrigin,
  createRequestId,
  failureResponse,
  PublicApiError,
  successResponse,
} from "@/server/api-contract";
import { requireWebsiteSession } from "@/server/auth/authorization";
import {
  cancelPlanTask,
  getPlanTask,
  planQueuePosition,
  PLAN_TASK_ETA_PER_TASK_SECONDS,
} from "@/server/plan-task";
import { ensurePlanTaskWorkerStarted } from "@/server/plan-task-worker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function authorizeTask(taskId: string, request: Request) {
  const task = await getPlanTask(taskId);
  if (!task) throw new PublicApiError("AIC-REQ-1001", { fieldErrors: [{ path: "taskId", code: "not_found", message: "任务不存在或已过期。" }] });
  if (task.userId) {
    const session = await requireWebsiteSession(request);
    if (session.user.id !== task.userId) throw new PublicApiError("AIC-AUTH-2002");
  }
  return task;
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const requestId = createRequestId();
  const startedAt = performance.now();
  try {
    assertSameOrigin(request);
    const { id: taskId } = await params;
    const task = await authorizeTask(taskId, request);
    if (task.status === "pending" || task.status === "running") ensurePlanTaskWorkerStarted();
    if (task.status === "pending") {
      const queuePosition = await planQueuePosition(taskId);
      return successResponse({
        taskId,
        status: "pending",
        queuePosition,
        etaSeconds: queuePosition * PLAN_TASK_ETA_PER_TASK_SECONDS,
      }, requestId);
    }
    if (task.status === "running") {
      return successResponse({
        taskId,
        status: "running",
        queuePosition: 0,
        etaSeconds: PLAN_TASK_ETA_PER_TASK_SECONDS,
      }, requestId);
    }
    return successResponse({
      taskId,
      status: task.status,
      ...(task.status === "done" ? { result: task.result } : {}),
      ...(task.status === "failed" ? { error: task.error } : {}),
    }, requestId);
  } catch (error) {
    return failureResponse(error, requestId, `/api/tasks/${(await params).id}`, startedAt);
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const requestId = createRequestId();
  const startedAt = performance.now();
  try {
    assertSameOrigin(request);
    const { id: taskId } = await params;
    const task = await authorizeTask(taskId, request);
    const result = await cancelPlanTask(task.id);
    return successResponse({
      taskId,
      cancelled: result === "cancelled",
      reason: result === "cancelled" ? null : result,
    }, requestId);
  } catch (error) {
    return failureResponse(error, requestId, `/api/tasks/${(await params).id}`, startedAt);
  }
}
