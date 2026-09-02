"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  ApiClientError,
  cancelPlanTask,
  pollPlanTask,
  type PlanTaskStatus,
  type PlanTaskSubmitData,
} from "@/api";
import {
  planTaskCancellationDecision,
  runPlanTaskPollAttempt,
} from "@/plan-task-cancellation";
import type { PublicPlanData } from "@/types";

const STORAGE_KEY = "aic-plan-task-v1";
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
  const schedulePoll = useCallback((taskId: string, attempt: number, delayMs: number) => {
    clearTimer();
    timerRef.current = setTimeout(() => void pollOnceRef.current(taskId, attempt), delayMs);
  }, [clearTimer]);
  const pollOnce = useCallback(async (taskId: string, attempt: number) => {
    await runPlanTaskPollAttempt(taskId, attempt, {
      poll: pollPlanTask,
      isCurrent: (candidate) => taskIdRef.current === candidate,
      errorCode: (error) => error instanceof ApiClientError ? error.code : null,
      finishDone: (result) => {
        finish({ status: "done", result, error: null });
        if (result) onDoneRef.current(result);
      },
      finishTerminal: (status, message, notifyFailure) => {
        finish({ status, error: message });
        if (notifyFailure) onFailedRef.current(message);
      },
      continueActive: (decision) => setState((current) => ({
        ...current,
        status: decision.status,
        queuePosition: decision.queuePosition ?? current.queuePosition,
        etaSeconds: decision.etaSeconds ?? current.etaSeconds,
        pollStopped: false,
      })),
      schedule: schedulePoll,
      pause: (message) => {
        clearTimer();
        setState((current) => ({ ...current, error: message }));
      },
      stop: (message) => {
        setState((current) => ({ ...current, pollStopped: true, error: message }));
        startResumeCooldown();
      },
    });
  }, [clearTimer, finish, schedulePoll, startResumeCooldown]);
  useEffect(() => {
    pollOnceRef.current = pollOnce;
  }, [pollOnce]);

  const begin = useCallback((submitted: string | Exclude<PlanTaskSubmitData, { status: "done" }>) => {
    const initial = typeof submitted === "string"
      ? { taskId: submitted, status: "pending" as const, queuePosition: 1, etaSeconds: 3 }
      : submitted;
    const { taskId } = initial;
    clearTimer();
    stopResumeCooldown();
    taskIdRef.current = taskId;
    writeStoredTaskId(taskId);
    setState({
      taskId,
      status: initial.status,
      queuePosition: initial.queuePosition ?? null,
      etaSeconds: initial.etaSeconds ?? null,
      pollStopped: false,
      result: null,
      error: null,
    });
    void pollOnce(taskId, 0);
  }, [clearTimer, pollOnce, stopResumeCooldown]);

  const complete = useCallback((result: PublicPlanData) => {
    finish({ status: "done", result, error: null });
    onDoneRef.current(result);
  }, [finish]);

  const resume = useCallback(() => {
    const taskId = taskIdRef.current;
    if (!taskId) return;
    stopResumeCooldown();
    clearTimer();
    setState((current) => ({ ...current, pollStopped: false, error: null }));
    void pollOnce(taskId, 0);
  }, [clearTimer, pollOnce, stopResumeCooldown]);

  const cancel = useCallback(async (): Promise<boolean> => {
    const taskId = taskIdRef.current;
    if (!taskId) return false;
    clearTimer();
    stopResumeCooldown();
    try {
      const response = await cancelPlanTask(taskId);
      if (taskIdRef.current !== taskId) return false;
      const decision = planTaskCancellationDecision(response);
      if (decision.clearTask) {
        finish({ status: "cancelled", error: null });
        return true;
      }
      setState((current) => ({
        ...current,
        pollStopped: false,
        error: decision.message,
      }));
    } catch {
      if (taskIdRef.current !== taskId) return false;
      setState((current) => ({
        ...current,
        pollStopped: false,
        error: "取消请求未确认，任务仍会继续查询。",
      }));
    }
    void pollOnceRef.current(taskId, 0);
    return false;
  }, [clearTimer, finish, stopResumeCooldown]);

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
    complete,
    resume,
    cancel,
  };
}
