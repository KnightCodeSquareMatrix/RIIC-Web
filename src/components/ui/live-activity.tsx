"use client";

import { AlertTriangle, Check, Clock, Copy, RotateCcw, ScrollText, X } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ThinkingOrb } from "thinking-orbs";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { MOTION_DURATION, MOTION_EASE_OUT } from "@/motion";
import type { DisplayError } from "@/types";
import { solverDiagnosticFor } from "@/solver-diagnostic";

export type ActivityPhase = "running" | "queued" | "success" | "error";

export interface Activity {
  id: number;
  phase: ActivityPhase;
  error: DisplayError | null;
  queuePosition?: number | null;
  etaSeconds?: number | null;
}

export interface LiveActivityProps {
  activity: Activity | null;
  onRetry: () => void;
  onCopyDiagnostic: () => void;
}

type ActivityLogEntry = {
  id: string;
  time: string;
  text: string;
  tone: "default" | "success" | "error";
};

const ACTIVITY_LOG_STORAGE_KEY = "aic-plan-activity-logs-v1";
const MAX_STORED_ACTIVITY_LOGS = 24;

export function usePlanActivity({
  loading,
  error,
  completed = false,
  queued = false,
  queuePosition = null,
  etaSeconds = null,
}: {
  loading: boolean;
  error: DisplayError | null;
  /** 当前任务是否真正完成（由任务状态驱动，避免取消/旧结果误判成功）。 */
  completed?: boolean;
  queued?: boolean;
  queuePosition?: number | null;
  etaSeconds?: number | null;
}) {
  const [activity, setActivity] = useState<Activity | null>(null);
  const wasLoading = useRef(false);
  const sequence = useRef(0);

  useEffect(() => {
    if (loading && !wasLoading.current) {
      sequence.current += 1;
      setActivity({
        id: sequence.current,
        phase: queued ? "queued" : "running",
        error: null,
        queuePosition,
        etaSeconds,
      });
    } else if (loading && wasLoading.current) {
      // loading 期间 running ↔ queued 互相切换（轮询停止/恢复）。
      setActivity((current) =>
        current && current.id === sequence.current && (current.phase === "running" || current.phase === "queued")
          ? { ...current, phase: queued ? "queued" : "running", queuePosition, etaSeconds }
          : current,
      );
    } else if (!loading && wasLoading.current) {
      const id = sequence.current;
      setActivity(error
        ? { id, phase: "error", error }
        : completed
          ? { id, phase: "success", error: null, queuePosition: null, etaSeconds: null }
          : null);
    }
    wasLoading.current = loading;
  }, [completed, error, loading, queued, queuePosition, etaSeconds]);

  return activity;
}

export function LiveActivity({ activity, onRetry, onCopyDiagnostic }: LiveActivityProps) {
  const reduceMotion = useReducedMotion();
  const [copied, setCopied] = useState(false);
  const [dismissed, setDismissed] = useState<{ id: number; phase: ActivityPhase } | null>(null);
  const [logOpen, setLogOpen] = useState(false);
  const [logs, setLogs] = useState<ActivityLogEntry[]>([]);
  const [logsLoaded, setLogsLoaded] = useState(false);
  const [logTarget, setLogTarget] = useState<HTMLElement | null>(null);
  const loggedActivityKey = useRef<string | null>(null);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(ACTIVITY_LOG_STORAGE_KEY);
      if (stored) {
        const parsed: unknown = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          setLogs(parsed.filter((entry): entry is ActivityLogEntry => (
            Boolean(entry)
            && typeof entry === "object"
            && typeof entry.id === "string"
            && typeof entry.time === "string"
            && typeof entry.text === "string"
            && (entry.tone === "default" || entry.tone === "success" || entry.tone === "error")
          )).slice(-MAX_STORED_ACTIVITY_LOGS));
        }
      }
    } catch {
      window.localStorage.removeItem(ACTIVITY_LOG_STORAGE_KEY);
    } finally {
      setLogsLoaded(true);
    }
  }, []);

  useEffect(() => {
    setLogTarget(document.getElementById("activity-log-root"));
  }, []);

  useEffect(() => {
    if (!logsLoaded) return;
    window.localStorage.setItem(ACTIVITY_LOG_STORAGE_KEY, JSON.stringify(logs));
  }, [logs, logsLoaded]);

  // 阶段切换（running ↔ queued、进入 success/error）时取消之前的关闭状态。
  useEffect(() => {
    if (!activity) return;
    setDismissed((current) =>
      current && current.id === activity.id && current.phase === activity.phase ? current : null,
    );
  }, [activity]);

  // 仅 success 自动消失（2s）；queued / error 保持显示，靠关闭按钮收起。
  useEffect(() => {
    if (!activity || activity.phase !== "success") return;
    const id = activity.id;
    const phase = activity.phase;
    const timer = window.setTimeout(() => setDismissed({ id, phase }), 2_000);
    return () => window.clearTimeout(timer);
  }, [activity]);

  useEffect(() => {
    if (!activity) return;
    setCopied(false);
  }, [activity]);

  useEffect(() => {
    if (!activity || !logsLoaded) return;
    const key = `${activity.id}:${activity.phase}`;
    if (loggedActivityKey.current === key) return;
    loggedActivityKey.current = key;
    const text = activity.phase === "queued"
      ? `排班任务排队中，前面还有 ${activity.queuePosition ?? "—"} 人。`
      : activity.phase === "running"
        ? "开始生成排班。"
        : activity.phase === "success"
          ? "排班已生成。"
          : `${activity.error?.code ?? "AIC-PLAN"}：${activity.error?.message ?? "排班生成失败"}`;
    setLogs((current) => [
      ...current.slice(-(MAX_STORED_ACTIVITY_LOGS - 1)),
      {
        id: `${Date.now()}-${key}`,
        time: new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).format(new Date()),
        text,
        tone: activity.phase === "error" ? "error" : activity.phase === "success" ? "success" : "default",
      },
    ]);
  }, [activity, logsLoaded]);

  const label = activity?.phase === "running"
    ? "正在生成排班"
    : activity?.phase === "queued"
      ? "正在排队"
    : activity?.phase === "success"
      ? "排班已生成"
      : activity?.error?.message ?? "排班生成失败";
  const diagnostic = activity?.error ? solverDiagnosticFor(activity.error) : null;
  const hidden = Boolean(
    activity && dismissed && dismissed.id === activity.id && dismissed.phase === activity.phase,
  );

  return (
    <>
    <AnimatePresence initial={false}>
      {activity && !hidden ? (
        <motion.aside
          key={activity.id}
          data-slot="live-activity"
          data-activity-phase={activity.phase}
          data-activity-view="expanded"
          className={cn(
            "fixed top-[max(0.75rem,env(safe-area-inset-top))] left-1/2 z-[80] -translate-x-1/2 overflow-hidden border text-sm outline-none",
            "w-[min(34rem,calc(100vw-7.5rem))] max-sm:w-[min(22rem,calc(100vw-7rem))]",
            activity.phase === "error" ? "border-red-200 bg-red-50 text-red-950" : "border-zinc-200 bg-[#FAFAF8] text-[#313131]"
          )}
          role={activity.phase === "error" ? "alert" : "status"}
          aria-live={activity.phase === "error" ? "assertive" : "polite"}
          initial={reduceMotion ? false : { opacity: 0, y: -10, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -6, scale: 0.98 }}
          transition={{ duration: reduceMotion ? 0 : MOTION_DURATION.state, ease: MOTION_EASE_OUT }}
        >
          <div className="flex min-h-11 items-center gap-3 px-3 py-3">
            <span className="grid size-7 shrink-0 place-items-center bg-black/5" aria-hidden="true">
              {activity.phase === "running" ? (
                <ThinkingOrb state="solving" size={20} theme="light" className="shrink-0" data-slot="solving-orb" />
              ) : activity.phase === "queued" ? (
                <Clock className="size-4 text-[#313131]/60" />
              ) : activity.phase === "success" ? (
                <Check className="size-4 text-emerald-600" />
              ) : (
                <AlertTriangle className="size-4 text-red-300" />
              )}
            </span>
            <div className="min-w-0 flex-1">
              <strong className={cn("block truncate font-medium", activity.phase === "running" && "live-activity-shimmer")} data-text={activity.phase === "running" ? label : undefined}>{label}</strong>
              <span className="mt-0.5 block">
                {activity.phase === "queued" ? (
                  <span className="text-sm text-[#313131]/75">
                    前面还有 <strong className="font-semibold">{activity.queuePosition ?? "—"}</strong> 人，预计 <strong className="font-semibold">{formatDuration(activity.etaSeconds)}</strong>
                  </span>
                ) : activity.phase === "running" ? (
                  <span className="text-sm text-[#313131]/70">
                    正在调用排班服务，请稍候。
                    {activity.queuePosition != null ? (
                      <>
                        {" "}当前排队第 <strong className="font-semibold">{activity.queuePosition}</strong> 位，预计 <strong className="font-semibold">{formatDuration(activity.etaSeconds)}</strong>
                      </>
                    ) : null}
                  </span>
                ) : (
                  <span className={cn("text-xs", activity.phase === "error" ? "text-red-800/70" : "text-[#313131]/58")}>
                    {activity.phase === "success" ? "三班结果已更新，可以查看或导出。" : `${activity.error?.code ?? "AIC-PLAN"}${activity.error?.requestId ? ` · ${activity.error.requestId}` : ""}`}
                  </span>
                )}
              </span>
              {activity.phase === "queued" ? (
                <span className="mt-1 block text-sm text-[#313131]/58">
                  排队中，请耐心等待，可以通过点击<strong className="font-semibold">“查询进度”</strong>按钮进行查询。
                </span>
              ) : null}
              {diagnostic ? <span className="mt-1 block text-xs text-red-900">{diagnostic.suggestion}</span> : null}
            </div>
            {activity.phase === "error" ? (
              <span className="flex shrink-0 items-center gap-1">
                {activity.error?.retryable ? (
                  <Button type="button" size="sm" variant="ghost" className="h-9 text-red-900 hover:bg-red-100 hover:text-red-950" onClick={onRetry}>
                    <RotateCcw />重试
                  </Button>
                ) : null}
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-9 text-red-900 hover:bg-red-100 hover:text-red-950"
                  onClick={() => {
                    onCopyDiagnostic();
                    setCopied(true);
                  }}
                >
                  <Copy />{copied ? "已复制" : "复制诊断"}
                </Button>
              </span>
            ) : null}
            <button
              type="button"
              onClick={() => setDismissed({ id: activity.id, phase: activity.phase })}
              aria-label="关闭提示"
              className="grid size-8 shrink-0 place-items-center rounded-md text-[#313131]/45 outline-none transition-colors hover:bg-black/5 hover:text-[#313131] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#FFD800]"
            >
              <X className="size-4" aria-hidden="true" />
            </button>
          </div>
          <div className="h-1 overflow-hidden bg-black/8" aria-hidden="true" data-slot="activity-progress-track">
            {activity.phase === "running" ? (
              <motion.span
                className="block h-full w-[38%] bg-[#FFD800]"
                animate={reduceMotion ? { x: "82%" } : { x: ["-110%", "285%"] }}
                transition={reduceMotion ? { duration: 0 } : { duration: 1.35, ease: "linear", repeat: Number.POSITIVE_INFINITY }}
                data-slot="activity-progress-indicator"
              />
            ) : activity.phase === "queued" ? (
              <span className="block h-full w-full bg-[#FFD800]/55" aria-hidden="true" />
            ) : (
              <motion.span
                className={cn("block h-full w-full", activity.phase === "success" ? "bg-[#FFD800]" : "bg-red-400")}
                initial={reduceMotion ? false : { scaleX: 0.72 }}
                animate={{ scaleX: 1 }}
                transition={{ duration: reduceMotion ? 0 : MOTION_DURATION.state, ease: MOTION_EASE_OUT }}
                style={{ transformOrigin: "left center" }}
                data-slot="activity-progress-indicator"
              />
            )}
          </div>
        </motion.aside>
      ) : null}
    </AnimatePresence>
      {logTarget && logs.length > 0 ? createPortal(<aside className="relative border border-[#313131]/18 bg-[#FAFAF8] text-[#313131] shadow-sm" aria-label="运行日志">
        <div className="flex min-h-11 items-center justify-between gap-2 px-3">
          <button type="button" className="flex min-h-11 min-w-0 flex-1 items-center gap-2 text-left text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-expanded={logOpen} onClick={() => setLogOpen((open) => !open)}>
            <ScrollText className="size-4 shrink-0" aria-hidden="true" />
            运行日志
            <span className="font-number text-xs text-muted-foreground">{logs.length}</span>
          </button>
          <Button type="button" size="sm" variant="ghost" className="h-9 text-xs" onClick={() => setLogs([])}>清空</Button>
        </div>
        {logOpen ? (
          <div className="absolute bottom-full right-0 z-20 mb-2 max-h-52 w-[min(30rem,calc(100vw-2rem))] overflow-y-auto border border-[#313131]/18 bg-[#FAFAF8] px-3 py-2 font-mono text-xs leading-5 shadow-[0_12px_30px_rgba(35,38,39,0.14)]" aria-live="polite">
            {logs.slice().reverse().map((entry) => (
              <div key={entry.id} className={cn("flex gap-2 py-1", entry.tone === "error" ? "text-red-700" : entry.tone === "success" ? "text-emerald-700" : "text-[#313131]/75")}>
                <span className="shrink-0 text-[#313131]/45">{entry.time}</span>
                <span>{entry.text}</span>
              </div>
            ))}
          </div>
        ) : null}
      </aside>, logTarget) : null}
    </>
  );
}

function formatDuration(seconds: number | null | undefined): string {
  const total = Math.max(0, Math.round(seconds ?? 0));
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  if (minutes <= 0) return `${rest} 秒`;
  return `${minutes} 分 ${rest} 秒`;
}
