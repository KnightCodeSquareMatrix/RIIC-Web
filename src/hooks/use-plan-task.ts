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
  /** Disable persistence for secondary task flows that cannot be restored without their local context. */
  storageKey?: string | null;
};

function readStoredTaskId(storageKey: string | null): string | null {
  if (!storageKey) return null;
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { taskId?: unknown };
    return typeof parsed.taskId === "string" && parsed.taskId ? parsed.taskId : null;
  } catch {
    return null;
  }
}

function writeStoredTaskId(storageKey: string | null, taskId: string) {
  if (!storageKey) return;
  try {
    localStorage.setItem(storageKey, JSON.stringify({ taskId, savedAt: Date.now() }));
  } catch {
    // localStorage 不可用时降级为纯内存轮询。
  }
}

function clearStoredTaskId(storageKey: string | null) {
  if (!storageKey) return;
  try {
    localStorage.removeItem(storageKey);
  } catch {
    // ignore
  }
}

export function usePlanTask({ onDone, onFailed, storageKey }: PlanTaskOptions) {
  const taskStorageKey = storageKey === undefined ? STORAGE_KEY : storageKey;
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
  const waiterRef = useRef<{
    resolve: (result: PublicPlanData) => void;
    reject: (reason: Error) => void;
  } | null>(null);
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

  const resolveWaiter = useCallback((result: PublicPlanData) => {
    const waiter = waiterRef.current;
    waiterRef.current = null;
    waiter?.resolve(result);
  }, []);

  const rejectWaiter = useCallback((message: string) => {
    const waiter = waiterRef.current;
    waiterRef.current = null;
    waiter?.reject(new Error(message));
  }, []);

  const finish = useCallback((next: Partial<PlanTaskUiState> & { status: PlanTaskStatus }) => {
    clearTimer();
    stopResumeCooldown();
    clearStoredTaskId(taskStorageKey);
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
  }, [clearTimer, stopResumeCooldown, taskStorageKey]);

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
        if (!result) {
          const message = "排班任务已完成，但没有返回可用结果。";
          finish({ status: "failed", error: message });
          onFailedRef.current(message);
          rejectWaiter(message);
          return;
        }
        finish({ status: "done", result, error: null });
        onDoneRef.current(result);
        resolveWaiter(result);
      },
      finishTerminal: (status, message, notifyFailure) => {
        finish({ status, error: message });
        if (notifyFailure) onFailedRef.current(message);
        rejectWaiter(message);
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
  }, [clearTimer, finish, rejectWaiter, resolveWaiter, schedulePoll, startResumeCooldown]);
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
    writeStoredTaskId(taskStorageKey, taskId);
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
  }, [clearTimer, pollOnce, stopResumeCooldown, taskStorageKey]);

  const complete = useCallback((result: PublicPlanData) => {
    finish({ status: "done", result, error: null });
    onDoneRef.current(result);
  }, [finish]);

  const run = useCallback((submitted: PlanTaskSubmitData): Promise<PublicPlanData> => {
    if (submitted.status === "done") {
      complete(submitted.result);
      return Promise.resolve(submitted.result);
    }
    if (waiterRef.current || taskIdRef.current) {
      return Promise.reject(new Error("已有排班任务正在查询，请等待完成后再试。"));
    }
    return new Promise<PublicPlanData>((resolve, reject) => {
      waiterRef.current = { resolve, reject };
      begin(submitted);
    });
  }, [begin, complete]);

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
        rejectWaiter("任务已取消。");
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
  }, [clearTimer, finish, rejectWaiter, stopResumeCooldown]);

  // 只在真正挂载（刷新/重新打开）时从 localStorage 恢复轮询；
  // 切换侧边栏子页面不触发恢复。
  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;
    const stored = readStoredTaskId(taskStorageKey);
    if (stored) begin(stored);
  }, [begin, taskStorageKey]);

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
    run,
    complete,
    resume,
    cancel,
  };
}
