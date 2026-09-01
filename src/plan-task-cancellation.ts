export type PlanTaskCancellationResponse = {
  cancelled: boolean;
  reason: "running" | "unavailable" | null;
};

export type PlanTaskCancellationDecision = {
  clearTask: boolean;
  message: string | null;
};

export function planTaskCancellationDecision(
  response: PlanTaskCancellationResponse,
): PlanTaskCancellationDecision {
  if (response.cancelled) return { clearTask: true, message: null };
  return {
    clearTask: false,
    message: response.reason === "running"
      ? "任务已经开始计算，暂时无法取消；完成后仍会保留结果。"
      : "任务状态已经变化，正在重新查询。",
  };
}
