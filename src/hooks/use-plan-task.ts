"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { PlanTaskPoller } from "@/plan-task-poller";
import type { PublicPlanData } from "@/types";

const STORAGE_KEY = "aic-plan-task-v1";
type PlanTaskStatus = "pending" | "running" | "done" | "failed" | "cancelled";

export type PlanTaskUiState = {
  taskId: string | null;
  status: PlanTaskStatus | null;
  queuePosition: number | null;
  etaSeconds: number | null;
  pollStopped: boolean;
  result: PublicPlanData | null;
  error: string | null;
};

type PlanTaskOptions = {
  onDone: (result: PublicPlanData) => void;
  onFailed: (message: string) => void;
};

const initialState: PlanTaskUiState = {
  taskId: null,
  status: null,
  queuePosition: null,
  etaSeconds: null,
  pollStopped: false,
  result: null,
  error: null,
};

function storedTaskId(): string | null {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null") as { taskId?: unknown } | null;
    return typeof value?.taskId === "string" && value.taskId ? value.taskId : null;
  } catch {
    return null;
  }
}

function storeTaskId(taskId: string | null): void {
  try {
    if (taskId) localStorage.setItem(STORAGE_KEY, JSON.stringify({ taskId, savedAt: Date.now() }));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // The queue still works in memory when browser storage is unavailable.
  }
}

export function usePlanTask({ onDone, onFailed }: PlanTaskOptions) {
  const [state, setState] = useState(initialState);
  const taskIdRef = useRef<string | null>(null);
  const pollerRef = useRef<PlanTaskPoller | null>(null);
  const restoredRef = useRef(false);
  const onDoneRef = useRef(onDone);
  const onFailedRef = useRef(onFailed);

  useEffect(() => {
    onDoneRef.current = onDone;
    onFailedRef.current = onFailed;
  }, [onDone, onFailed]);

  const finish = useCallback((status: PlanTaskStatus, result: PublicPlanData | null, error: string | null) => {
    pollerRef.current?.dispose();
    pollerRef.current = null;
    taskIdRef.current = null;
    storeTaskId(null);
    setState({ ...initialState, status, result, error });
    if (status === "done" && result) onDoneRef.current(result);
    if (status === "failed" && error) onFailedRef.current(error);
  }, []);

  const startPolling = useCallback(async (taskId: string) => {
    const { startPlanTaskPoller } = await import("@/plan-task-poller");
    if (taskIdRef.current !== taskId) return;
    pollerRef.current?.dispose();
    pollerRef.current = startPlanTaskPoller(taskId, {
      onProgress: (progress) => setState((current) => ({ ...current, ...progress })),
      onDone: (result) => finish("done", result, null),
      onTerminal: (status, message) => finish(status, null, message),
      onStopped: (error) => setState((current) => ({
        ...current,
        pollStopped: true,
        ...(error ? { error } : {}),
      })),
    });
  }, [finish]);

  const begin = useCallback((taskId: string) => {
    pollerRef.current?.dispose();
    taskIdRef.current = taskId;
    storeTaskId(taskId);
    setState({
      ...initialState,
      taskId,
      status: "pending",
      queuePosition: 1,
      etaSeconds: 2,
    });
    void startPolling(taskId);
  }, [startPolling]);

  const resume = useCallback(() => {
    const taskId = taskIdRef.current;
    if (!taskId) return;
    setState((current) => ({ ...current, pollStopped: false, error: null }));
    if (pollerRef.current) pollerRef.current.resume();
    else void startPolling(taskId);
  }, [startPolling]);

  const cancel = useCallback(async () => {
    const taskId = taskIdRef.current;
    if (!taskId) return false;
    try {
      const { cancelPlanTaskRequest } = await import("@/plan-task-poller");
      const response = await cancelPlanTaskRequest(taskId);
      if (taskIdRef.current !== taskId) return false;
      if (!response.cancelled) {
        setState((current) => ({
          ...current,
          error: response.reason === "running"
            ? "任务已经开始计算，暂时无法取消；将继续查询结果。"
            : "任务当前无法取消，请刷新页面确认状态。",
        }));
        return false;
      }
      finish("cancelled", null, null);
      return true;
    } catch {
      setState((current) => ({ ...current, error: "取消任务失败，将继续查询结果。" }));
      return false;
    }
  }, [finish]);

  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;
    const taskId = storedTaskId();
    if (taskId) begin(taskId);
  }, [begin]);

  useEffect(() => () => pollerRef.current?.dispose(), []);

  return { ...state, begin, resume, cancel };
}
