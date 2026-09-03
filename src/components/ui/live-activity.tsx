"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { ThinkingOrb } from "thinking-orbs";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { MOTION_DURATION, MOTION_EASE_OUT } from "@/motion";
import { roomVisualFor } from "@/room-visuals";
import type { DisplayError } from "@/types";
import { solverDiagnosticFor } from "@/solver-diagnostic";
import { useLanguageDemo } from "@/language-demo";

const SUCCESS_SWEEP_COLOR = roomVisualFor("power").accent;

export type ActivityPhase = "running" | "queued" | "success" | "error";

export interface Activity {
  id: number;
  phase: ActivityPhase;
  error: DisplayError | null;
  queuePosition?: number | null;
  etaSeconds?: number | null;
  buffered?: boolean;
}

export interface LiveActivityProps {
  activity: Activity | null;
  onRetry: () => void;
  onCopyDiagnostic: () => void;
  retryCountdownSeconds?: number;
}

export function usePlanActivity({
  loading,
  error,
  completed = false,
  queued = false,
  queuePosition = null,
  etaSeconds = null,
  buffered = false,
}: {
  loading: boolean;
  error: DisplayError | null;
  /** 当前任务是否真正完成（由任务状态驱动，避免取消/旧结果误判成功）。 */
  completed?: boolean;
  queued?: boolean;
  queuePosition?: number | null;
  etaSeconds?: number | null;
  buffered?: boolean;
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
        buffered,
      });
    } else if (loading && wasLoading.current) {
      // loading 期间 running ↔ queued 互相切换（轮询停止/恢复）。
      setActivity((current) =>
        current && current.id === sequence.current && (current.phase === "running" || current.phase === "queued")
          ? { ...current, phase: queued ? "queued" : "running", queuePosition, etaSeconds, buffered }
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
  }, [buffered, completed, error, etaSeconds, loading, queued, queuePosition]);

  return activity;
}

export function LiveActivity({ activity, onRetry, onCopyDiagnostic, retryCountdownSeconds = 0 }: LiveActivityProps) {
  const reduceMotion = useReducedMotion();
  const { locale } = useLanguageDemo();
  const en = locale === "en";
  const [copied, setCopied] = useState(false);
  const [dismissed, setDismissed] = useState<{ id: number; phase: ActivityPhase } | null>(null);

  // 阶段切换（running ↔ queued、进入 success/error）时取消之前的关闭状态。
  useEffect(() => {
    if (!activity) return;
    setDismissed((current) =>
      current && current.id === activity.id && current.phase === activity.phase ? current : null,
    );
  }, [activity]);

  // 仅 success 自动消失；为扫带完成后保留 1.2s 白底确认时间。
  useEffect(() => {
    if (!activity || activity.phase !== "success") return;
    const id = activity.id;
    const phase = activity.phase;
    const timer = window.setTimeout(() => setDismissed({ id, phase }), 2_800);
    return () => window.clearTimeout(timer);
  }, [activity]);

  useEffect(() => {
    if (!activity) return;
    setCopied(false);
  }, [activity]);

  const diagnostic = activity?.error ? solverDiagnosticFor(activity.error, en) : null;
  const label = activity?.phase === "running"
    ? (en ? "Generating schedule" : "正在生成排班")
    : activity?.phase === "queued"
      ? (en ? "Queued" : "正在排队")
    : activity?.phase === "success"
      ? (en ? "Schedule generated" : "排班已生成")
      : diagnostic?.title ?? activity?.error?.message ?? (en ? "Schedule generation failed" : "排班生成失败");
  const hidden = Boolean(
    activity && dismissed && dismissed.id === activity.id && dismissed.phase === activity.phase,
  );

  return (
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
          <div className="relative flex min-h-[4.5rem] items-stretch overflow-hidden" data-slot="live-activity-body">
            {activity.phase === "success" && !reduceMotion ? (
              <motion.span
                className="pointer-events-none absolute inset-y-0 left-0 overflow-hidden"
                initial={{ x: -360 }}
                animate={{ x: 640 }}
                transition={{ duration: 1.6, ease: MOTION_EASE_OUT }}
                style={{
                  width: 360,
                  zIndex: 0,
                  backgroundColor: SUCCESS_SWEEP_COLOR,
                }}
                aria-hidden="true"
                data-slot="activity-success-sweep"
              />
            ) : null}
            {activity.phase === "running" ? (
              <span
                className="relative z-10 grid w-[4.5rem] shrink-0 self-stretch place-items-center bg-transparent"
                aria-hidden="true"
                data-slot="solving-orb-rail"
              >
                <ThinkingOrb
                  state="solving"
                  size={64}
                  theme="light"
                  className="shrink-0"
                  data-live-activity-icon
                  data-slot="solving-orb"
                />
              </span>
            ) : null}
            <div className={cn(
              "relative z-10 flex min-w-0 flex-1 flex-wrap items-center gap-3 py-3 pr-3 pl-5 max-sm:gap-y-1.5",
            )}>
              <div className="min-w-0 flex-1 max-sm:basis-full">
              <strong className={cn("block truncate font-medium", activity.phase === "running" && "live-activity-shimmer")} data-text={activity.phase === "running" ? label : undefined}>{label}</strong>
              <span className="mt-0.5 block">
                {activity.phase === "queued" ? (
                  <span className="text-sm text-[#313131]/75">
                    {activity.buffered ? (
                      <>{en ? "You are in the candidate ring. A candidate will be selected randomly when a slot opens." : "当前进入候选环，名额释放后随机抽取。"}</>
                    ) : (
                      <>{en ? "Ahead: " : "前面还有 "}<strong className="font-semibold">{activity.queuePosition ?? "—"}</strong>{en ? ". Estimated wait: " : " 人，预计 "}<strong className="font-semibold">{formatDuration(activity.etaSeconds, en)}</strong></>
                    )}
                  </span>
                ) : activity.phase === "running" ? (
                  <span className="text-sm text-[#313131]/70">
                    {en ? "Calling the scheduling service. Please wait." : "正在调用排班服务，请稍候。"}
                    {activity.queuePosition != null ? (
                      <>
                        {en ? " Queue position: " : " 当前排队第 "}<strong className="font-semibold">{activity.queuePosition}</strong>{en ? ". Estimated wait: " : " 位，预计 "}<strong className="font-semibold">{formatDuration(activity.etaSeconds, en)}</strong>
                      </>
                    ) : null}
                  </span>
                ) : (
                  <span className={cn("text-xs", activity.phase === "error" ? "text-red-800/70" : "text-[#313131]/58")}>
                    {activity.phase === "success" ? (en ? "The three-shift result is ready to view or export." : "三班结果已更新，可以查看或导出。") : `${activity.error?.code ?? "AIC-PLAN"}${activity.error?.requestId ? ` · ${activity.error.requestId}` : ""}`}
                  </span>
                )}
              </span>
              {activity.phase === "queued" ? (
                <span className="mt-1 block text-sm text-[#313131]/58">
                  {en ? "This page updates automatically. Do not submit again." : "页面会自动更新，无需重复提交。"}
                </span>
              ) : null}
              {diagnostic ? <span className="mt-1 block text-xs text-red-900">{diagnostic.suggestion}</span> : null}
              </div>
              {activity.phase === "error" ? (
                <span className="flex shrink-0 items-center gap-1 max-sm:basis-full max-sm:justify-end">
                {activity.error?.retryable ? (
                  <Button type="button" size="sm" variant="ghost" className="h-9 text-red-900 hover:bg-red-100 hover:text-red-950" onClick={onRetry} disabled={retryCountdownSeconds > 0}>
                    {retryCountdownSeconds > 0 ? `${en ? "Retry in" : ""} ${retryCountdownSeconds} ${en ? "s" : "秒后重试"}`.trim() : (en ? "Retry" : "重试")}
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
                  {copied ? (en ? "Copied" : "已复制") : (en ? "Copy diagnostics" : "复制诊断")}
                </Button>
                </span>
              ) : null}
              <button
                type="button"
                onClick={() => setDismissed({ id: activity.id, phase: activity.phase })}
                aria-label={en ? "Dismiss notification" : "关闭提示"}
                className="h-8 shrink-0 px-2 text-xs text-[#313131]/48 outline-none transition-colors hover:bg-black/5 hover:text-[#313131] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#FFD800] max-sm:ml-auto"
              >
                {en ? "Dismiss" : "关闭"}
              </button>
            </div>
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
                className={cn("block h-full w-full", activity.phase === "success" ? "bg-emerald-500" : "bg-red-400")}
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
  );
}

function formatDuration(seconds: number | null | undefined, en = false): string {
  const total = Math.max(0, Math.round(seconds ?? 0));
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  if (minutes <= 0) return `${rest} ${en ? "s" : "秒"}`;
  return `${minutes} ${en ? "min" : "分"} ${rest} ${en ? "s" : "秒"}`;
}
