import {
  ApiClientError,
  requestData,
} from "@/api";
import type { BaseBlueprint, OperBoxEntry, RotationProfile } from "@/types";
import type { PublicPlanData } from "@/types";

const BACKOFF_MS = [2_000, 4_000, 8_000, 16_000, 32_000];

type PlanTaskStatus = "pending" | "running" | "done" | "failed" | "cancelled";
type PlanTaskPollData = {
  status: PlanTaskStatus;
  queuePosition?: number;
  etaSeconds?: number;
  result?: PublicPlanData;
  error?: string | null;
};
type Progress = Pick<PlanTaskPollData, "status" | "queuePosition" | "etaSeconds"> & {
  pollStopped: false;
  error: null;
};

type Callbacks = {
  onProgress: (progress: Progress) => void;
  onDone: (result: PublicPlanData) => void;
  onTerminal: (status: PlanTaskStatus, message: string | null) => void;
  onStopped: (error?: string) => void;
};

export type PlanTaskPoller = {
  resume: () => void;
  dispose: () => void;
};

export function submitPlanTaskRequest(payload: {
  layout: BaseBlueprint;
  operbox: OperBoxEntry[];
  sourceName: string | null;
  boxSource: "skland" | "maa";
  rotation: RotationProfile;
  fiammetta_enable?: boolean;
}): Promise<{ taskId: string }> {
  return requestData("/api/tasks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export function cancelPlanTaskRequest(taskId: string): Promise<{
  taskId: string;
  cancelled: boolean;
  reason: "running" | "unavailable" | null;
}> {
  return requestData(`/api/tasks/${encodeURIComponent(taskId)}`, { method: "DELETE" });
}

export function startPlanTaskPoller(taskId: string, callbacks: Callbacks): PlanTaskPoller {
  let disposed = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const stopTimer = () => {
    if (timer) clearTimeout(timer);
    timer = null;
  };
  const schedule = (attempt: number) => {
    if (attempt >= BACKOFF_MS.length) return callbacks.onStopped();
    timer = setTimeout(() => void poll(attempt + 1), BACKOFF_MS[attempt]);
  };
  const poll = async (attempt: number): Promise<void> => {
    if (disposed) return;
    try {
      const data = await requestData<PlanTaskPollData>(`/api/tasks/${encodeURIComponent(taskId)}`);
      if (disposed) return;
      if (data.status === "done") {
        if (data.result) callbacks.onDone(data.result);
        else callbacks.onTerminal("failed", "排班任务结果无效，请重新生成。");
        return;
      }
      if (data.status === "failed" || data.status === "cancelled") {
        callbacks.onTerminal(
          data.status,
          data.error ?? (data.status === "cancelled" ? "任务已取消。" : "排班失败，请重试。"),
        );
        return;
      }
      callbacks.onProgress({
        status: data.status,
        queuePosition: data.queuePosition,
        etaSeconds: data.etaSeconds,
        pollStopped: false,
        error: null,
      });
      schedule(attempt);
    } catch (error) {
      if (disposed) return;
      if (error instanceof ApiClientError && error.code === "AIC-REQ-1001") {
        callbacks.onTerminal("failed", "任务不存在或已过期，请重新生成排班。");
        return;
      }
      if (error instanceof ApiClientError && error.code === "AIC-AUTH-2002") {
        callbacks.onTerminal("failed", "任务状态异常，请刷新页面后重试。");
        return;
      }
      if (error instanceof ApiClientError && error.code === "AIC-AUTH-2001") {
        callbacks.onStopped("登录已过期，请重新登录后刷新页面继续查询。");
        return;
      }
      if (attempt >= BACKOFF_MS.length) callbacks.onStopped("网络异常，请点击查询进度。");
      else schedule(attempt);
    }
  };

  void poll(0);
  return {
    resume: () => {
      stopTimer();
      void poll(0);
    },
    dispose: () => {
      disposed = true;
      stopTimer();
    },
  };
}
