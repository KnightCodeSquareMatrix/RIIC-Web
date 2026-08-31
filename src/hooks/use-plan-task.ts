"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { cancelPlanTask, pollPlanTask, type PlanTaskStatus } from "@/api";
import type { PublicPlanData } from "@/types";

const STORAGE_KEY = "aic-plan-task-v1";
const BACKOFF_MS = [2_000, 4_000, 8_000, 16_000, 32_000];
const RESUME_COOLDOWN_SECONDS = 30;

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

function readStoredTaskId(): string | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { taskId?: unknown };
    return typeof parsed.taskId === "string" && parsed.taskId ? parsed.taskId : null;
  } catch {
    return null;
  }
}

function writeStoredTaskId(taskId: string) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ taskId, savedAt: Date.now() }));
  } catch {
    // localStorage 不可用时降级为纯内存轮询。
  }
}

function clearStoredTaskId() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

export function usePlanTask({ onDone, onFailed }: PlanTaskOptions) {
  const [state, setState] = useState<PlanTaskUiState>({
    taskId: null,
    status: null,
    queuePosition: null,
    etaSeconds: null,
    pollStopped: false,
    result: null,
    error: null,
  });
  const [resumeDisabled, setResumeDisabled] = useState(false);
  const [resumeCountdown, setResumeCountdown] = useState(0);

  const taskIdRef = useRef<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cooldownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const onDoneRef = useRef(onDone);
  const onFailedRef = useRef(onFailed);
  const restoredRef = useRef(false);

  useEffect(() => {
    onDoneRef.current = onDone;
  }, [onDone]);
  useEffect(() => {
    onFailedRef.current = onFailed;
  }, [onFailed]);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const stopResumeCooldown = useCallback(() => {
    if (cooldownRef.current) {
      clearInterval(cooldownRef.current);
      cooldownRef.current = null;
    }
    setResumeDisabled(false);
    setResumeCountdown(0);
  }, []);

  const startResumeCooldown = useCallback(() => {
    if (cooldownRef.current) clearInterval(cooldownRef.current);
    setResumeDisabled(true);
    setResumeCountdown(RESUME_COOLDOWN_SECONDS);
    cooldownRef.current = setInterval(() => {
      setResumeCountdown((previous) => {
        if (previous <= 1) {
          if (cooldownRef.current) clearInterval(cooldownRef.current);
          cooldownRef.current = null;
          setResumeDisabled(false);
          return 0;
        }
        return previous - 1;
      });
    }, 1_000);
  }, []);

  const finish = useCallback((next: Partial<PlanTaskUiState> & { status: PlanTaskStatus }) => {
    clearTimer();
    stopResumeCooldown();
    clearStoredTaskId();
    taskIdRef.current = null;
    setState((current) => ({
      ...current,
      taskId: null,
      queuePosition: null,
      etaSeconds: null,
      pollStopped: false,
      result: null,
      error: null,
      ...next,
    }));
  }, [clearTimer, stopResumeCooldown]);

  const pollOnceRef = useRef<(taskId: string, attempt: number) => Promise<void>>(async () => undefined);
  const pollOnce = useCallback(async (taskId: string, attempt: number) => {
    if (taskIdRef.current !== taskId) return;
    try {
      const data = await pollPlanTask(taskId);
      if (taskIdRef.current !== taskId) return;
      if (data.status === "done") {
        const result = data.result ?? null;
        finish({ status: "done", result, error: null });
        if (result) onDoneRef.current(result);
        return;
      }
      if (data.status === "failed" || data.status === "cancelled") {
        const message = data.error ?? (data.status === "cancelled" ? "任务已取消。" : "排班失败，请重试。");
        finish({ status: data.status, error: message });
        if (data.status === "failed") onFailedRef.current(message);
        return;
      }
      setState((current) => ({
        ...current,
        status: data.status,
        queuePosition: data.queuePosition ?? current.queuePosition,
        etaSeconds: data.etaSeconds ?? current.etaSeconds,
        pollStopped: false,
      }));
      if (attempt < BACKOFF_MS.length) {
        timerRef.current = setTimeout(() => void pollOnceRef.current(taskId, attempt + 1), BACKOFF_MS[attempt]);
      } else {
        setState((current) => ({ ...current, pollStopped: true }));
        startResumeCooldown();
      }
    } catch {
      if (taskIdRef.current !== taskId) return;
      // 网络异常：按同一退避节奏继续，最后停住交给"查询进度"。
      if (attempt < BACKOFF_MS.length) {
        timerRef.current = setTimeout(() => void pollOnceRef.current(taskId, attempt + 1), BACKOFF_MS[attempt]);
      } else {
        setState((current) => ({ ...current, pollStopped: true, error: "网络异常，请点击查询进度。" }));
        startResumeCooldown();
      }
    }
  }, [finish, startResumeCooldown]);
  useEffect(() => {
    pollOnceRef.current = pollOnce;
  }, [pollOnce]);

  const begin = useCallback((taskId: string) => {
    clearTimer();
    stopResumeCooldown();
    taskIdRef.current = taskId;
    writeStoredTaskId(taskId);
    setState({
      taskId,
      status: "pending",
      queuePosition: 1,
      etaSeconds: 2,
      pollStopped: false,
      result: null,
      error: null,
    });
    void pollOnce(taskId, 0);
  }, [clearTimer, pollOnce, stopResumeCooldown]);

  const resume = useCallback(() => {
    const taskId = taskIdRef.current;
    if (!taskId) return;
    stopResumeCooldown();
    clearTimer();
    setState((current) => ({ ...current, pollStopped: false, error: null }));
    void pollOnce(taskId, 0);
  }, [clearTimer, pollOnce, stopResumeCooldown]);

  const cancel = useCallback(() => {
    const taskId = taskIdRef.current;
    clearTimer();
    stopResumeCooldown();
    taskIdRef.current = null;
    clearStoredTaskId();
    setState({
      taskId: null,
      status: "cancelled",
      queuePosition: null,
      etaSeconds: null,
      pollStopped: false,
      result: null,
      error: null,
    });
    if (taskId) void cancelPlanTask(taskId).catch(() => undefined);
  }, [clearTimer, stopResumeCooldown]);

  // 只在真正挂载（刷新/重新打开）时从 localStorage 恢复轮询；
  // 切换侧边栏子页面不触发恢复。
  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;
    const stored = readStoredTaskId();
    if (stored) begin(stored);
  }, [begin]);

  // 卸载清理。
  useEffect(() => () => {
    clearTimer();
    if (cooldownRef.current) clearInterval(cooldownRef.current);
  }, [clearTimer]);

  return {
    ...state,
    resumeDisabled,
    resumeCountdown,
    begin,
    resume,
    cancel,
  };
}
