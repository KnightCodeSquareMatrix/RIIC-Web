"use client";

import { AlertTriangle, Check, Copy, RotateCcw } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { ThinkingOrb } from "thinking-orbs";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { MOTION_DURATION, MOTION_EASE_OUT } from "@/motion";
import type { DisplayError, PublicPlanData } from "@/types";
import { solverDiagnosticFor } from "@/solver-diagnostic";

export type ActivityPhase = "running" | "success" | "error";

export interface Activity {
  id: number;
  phase: ActivityPhase;
  error: DisplayError | null;
}

export interface LiveActivityProps {
  activity: Activity | null;
  onRetry: () => void;
  onCopyDiagnostic: () => void;
}

export function usePlanActivity({
  loading,
  result,
  error,
}: {
  loading: boolean;
  result: PublicPlanData | null;
  error: DisplayError | null;
}) {
  const [activity, setActivity] = useState<Activity | null>(null);
  const wasLoading = useRef(false);
  const sequence = useRef(0);

  useEffect(() => {
    if (loading && !wasLoading.current) {
      sequence.current += 1;
      setActivity({ id: sequence.current, phase: "running", error: null });
    } else if (!loading && wasLoading.current) {
      const id = sequence.current;
      setActivity(error
        ? { id, phase: "error", error }
        : result
          ? { id, phase: "success", error: null }
          : null);
    }
    wasLoading.current = loading;
  }, [error, loading, result]);

  useEffect(() => {
    if (activity?.phase !== "success") return;
    const id = activity.id;
    const timer = window.setTimeout(() => {
      setActivity((current) => current?.id === id ? null : current);
    }, 2000);
    return () => window.clearTimeout(timer);
  }, [activity]);

  return activity;
}

export function LiveActivity({ activity, onRetry, onCopyDiagnostic }: LiveActivityProps) {
  const reduceMotion = useReducedMotion();
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!activity) return;
    setCopied(false);
  }, [activity]);

  const label = activity?.phase === "running"
    ? "正在生成排班"
    : activity?.phase === "success"
      ? "排班已生成"
      : activity?.error?.message ?? "排班生成失败";
  const diagnostic = activity?.error ? solverDiagnosticFor(activity.error) : null;

  return (
    <AnimatePresence initial={false}>
      {activity ? (
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
              ) : activity.phase === "success" ? (
                <Check className="size-4 text-emerald-600" />
              ) : (
                <AlertTriangle className="size-4 text-red-300" />
              )}
            </span>
            <div className="min-w-0 flex-1">
              <strong className={cn("block truncate font-medium", activity.phase === "running" && "live-activity-shimmer")} data-text={activity.phase === "running" ? label : undefined}>{label}</strong>
              <span className={cn("mt-0.5 block text-xs", activity.phase === "error" ? "text-red-800/70" : "text-[#313131]/58")}>
                {activity.phase === "running" ? "正在调用排班服务，请稍候。" : activity.phase === "success" ? "三班结果已更新，可以查看或导出。" : `${activity.error?.code ?? "AIC-PLAN"}${activity.error?.requestId ? ` · ${activity.error.requestId}` : ""}`}
              </span>
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
          </div>
          <div className="h-1 overflow-hidden bg-black/8" aria-hidden="true" data-slot="activity-progress-track">
            {activity.phase === "running" ? (
              <motion.span
                className="block h-full w-[38%] bg-[#FFD800]"
                animate={reduceMotion ? { x: "82%" } : { x: ["-110%", "285%"] }}
                transition={reduceMotion ? { duration: 0 } : { duration: 1.35, ease: "linear", repeat: Number.POSITIVE_INFINITY }}
                data-slot="activity-progress-indicator"
              />
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
  );
}
