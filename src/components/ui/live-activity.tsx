"use client";
import { localize as localize_components_ui_live_activity } from "../../i18n/helpers/components_ui_live_activity.ts";
import { useTranslations, useLocale } from "next-intl";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { StatusMark, type StatusMarkStatus } from "@/components/ui/status-mark";
import { cn } from "@/lib/utils";
import { MOTION_DURATION, MOTION_EASE_OUT } from "@/motion";
import type { DisplayError } from "@/types";
import { solverDiagnosticFor } from "@/solver-diagnostic";

const SUCCESS_SWEEP_COLOR = "var(--schedule-success)";
// Surface and face springs follow interior.dev/docs/live-activity.
const SURFACE = { type: "spring", stiffness: 420, damping: 36, mass: 0.9 } as const;
const FACE = { type: "spring", stiffness: 260, damping: 34, mass: 0.8 } as const;

export type ActivityPhase = "running" | "queued" | "success" | "error";
export type ActivityKind = "schedule" | "progression-adjustment";

export interface Activity {
  id: number;
  kind: ActivityKind;
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
  kind = "schedule",
}: {
  loading: boolean;
  error: DisplayError | null;
  /** 当前任务是否真正完成（由任务状态驱动，避免取消/旧结果误判成功）。 */
  completed?: boolean;
  queued?: boolean;
  queuePosition?: number | null;
  etaSeconds?: number | null;
  buffered?: boolean;
  kind?: ActivityKind;
}) {
  const [activity, setActivity] = useState<Activity | null>(null);
  const wasLoading = useRef(false);
  const sequence = useRef(0);

  useEffect(() => {
    if (loading && !wasLoading.current) {
      sequence.current += 1;
      setActivity({
        id: sequence.current,
        kind,
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
        ? { id, kind, phase: "error", error }
        : completed
          ? { id, kind, phase: "success", error: null, queuePosition: null, etaSeconds: null }
          : null);
    }
    wasLoading.current = loading;
  }, [buffered, completed, error, etaSeconds, kind, loading, queued, queuePosition]);

  return activity;
}

export function LiveActivity({ activity, onRetry, onCopyDiagnostic, retryCountdownSeconds = 0 }: LiveActivityProps) {
  const intl = useTranslations();
  const reduceMotion = useReducedMotion();
  const locale = useLocale();
  const en = locale === "en";
  const [copied, setCopied] = useState(false);
  const [dismissed, setDismissed] = useState<{ id: number; phase: ActivityPhase } | null>(null);
  const [solverWarningOpen, setSolverWarningOpen] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [peek, setPeek] = useState(false);
  const compactRef = useRef<HTMLDivElement>(null);
  const expandedRef = useRef<HTMLDivElement>(null);
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const activityId = activity?.id;
  const phase = activity?.phase;
  const expanded = peek || hovered || focused || phase === "error" || phase === "success";
  const markStatus: StatusMarkStatus = phase === "queued" ? "pending" : phase === "running" ? "running" : phase === "success" ? "done" : "failed";

  // Queue position updates should not restart the initial expanded preview.
  useEffect(() => {
    setPeek(activityId !== undefined);
    setHovered(false);
    setFocused(false);
    const timer = window.setTimeout(() => setPeek(false), 2_600);
    return () => window.clearTimeout(timer);
  }, [activityId, phase]);

  useEffect(() => () => {
    if (leaveTimer.current) clearTimeout(leaveTimer.current);
  }, []);

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

  useEffect(() => {
    if (activity?.phase === "success" && activity.kind === "schedule") setSolverWarningOpen(true);
  }, [activity]);

  const diagnostic = activity?.error ? solverDiagnosticFor(activity.error, en) : null;
  const progressionAdjustment = activity?.kind === "progression-adjustment";
  const label = activity?.phase === "running"
    ? progressionAdjustment
      ? (intl("components_ui_live_activity.adjustingProgression"))
      : (intl("components_ui_live_activity.generatingSchedule"))
    : activity?.phase === "queued"
      ? (intl("components_ui_live_activity.queued"))
    : activity?.phase === "success"
      ? progressionAdjustment
        ? (intl("components_ui_live_activity.progressionAdjustmentComplete"))
        : (intl("components_ui_live_activity.scheduleGenerated"))
      : diagnostic?.title ?? activity?.error?.message ?? (intl("components_ui_live_activity.scheduleGenerationFailed"));
  const hidden = Boolean(
    activity && dismissed && dismissed.id === activity.id && dismissed.phase === activity.phase,
  );

  useLayoutEffect(() => {
    if (!activity || hidden) return;
    const measure = () => {
      const face = expanded ? expandedRef.current : compactRef.current;
      if (!face) return;
      const width = face.offsetWidth + 2;
      const height = face.offsetHeight + 2;
      setSize(current => current?.width === width && current?.height === height ? current : { width, height });
    };
    measure();
    const observer = new ResizeObserver(measure);
    if (compactRef.current) observer.observe(compactRef.current);
    if (expandedRef.current) observer.observe(expandedRef.current);
    return () => observer.disconnect();
  }, [activity, expanded, hidden]);

  return (
    <>
      <AnimatePresence initial={false}>
      {activity && !hidden ? (
        <motion.aside
          key={activity.id}
          data-slot="live-activity"
          data-activity-kind={activity.kind}
          data-activity-phase={activity.phase}
          data-activity-view={expanded ? "expanded" : "compact"}
          className={cn(
            "fixed top-[max(0.75rem,env(safe-area-inset-top))] left-1/2 z-[80] -translate-x-1/2 overflow-hidden rounded-[11px] border text-sm outline-none",
            "shadow-[inset_0_1.5px_0_rgba(255,255,255,0.95),0_1px_2px_rgba(28,25,23,0.07),0_16px_36px_-18px_rgba(28,25,23,0.5)] focus-visible:ring-2 focus-visible:ring-[#FFD800] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.07),0_2px_12px_rgba(0,0,0,0.4)]",
            activity.phase === "error" ? "border-red-200 bg-red-50 text-red-950 dark:border-red-900 dark:bg-red-950 dark:text-red-100" : "border-zinc-200 bg-[#FAFAF8] text-[#313131] dark:border-white/16 dark:bg-[#252522] dark:text-stone-100"
          )}
          role={activity.phase === "error" ? "alert" : "status"}
          aria-live={activity.phase === "error" ? "assertive" : "polite"}
          aria-label={label}
          tabIndex={0}
          onPointerEnter={(event) => {
            if (event.pointerType === "touch") return;
            if (leaveTimer.current) clearTimeout(leaveTimer.current);
            setHovered(true);
          }}
          onPointerLeave={() => {
            if (leaveTimer.current) clearTimeout(leaveTimer.current);
            leaveTimer.current = setTimeout(() => setHovered(false), 160);
          }}
          onFocusCapture={() => setFocused(true)}
          onBlurCapture={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false);
          }}
          onClick={() => { if (!expanded) setFocused(true); }}
          onKeyDown={(event) => {
            if (event.key !== "Escape") return;
            event.preventDefault();
            event.stopPropagation();
            if (activity.phase === "success" || activity.phase === "error") {
              setDismissed({ id: activity.id, phase: activity.phase });
            } else {
              setPeek(false);
              setHovered(false);
              setFocused(false);
              (document.activeElement as HTMLElement | null)?.blur();
            }
          }}
          style={{ width: "min(400px, calc(100vw - 24px))", height: 88, transformOrigin: "50% 0%" }}
          initial={reduceMotion ? false : { opacity: 0, y: -10, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1, width: size?.width, height: size?.height }}
          exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -6, scale: 0.98 }}
          transition={reduceMotion ? { duration: 0 } : { ...SURFACE, opacity: { duration: 0.2 } }}
        >
          {activity.phase === "success" && !reduceMotion ? (
            <motion.span
              className="pointer-events-none absolute inset-0"
              initial={{ x: "-100%" }}
              animate={{ x: "100%" }}
              transition={{ duration: 1.6, ease: MOTION_EASE_OUT }}
              style={{ backgroundColor: SUCCESS_SWEEP_COLOR }}
              aria-hidden="true"
              data-slot="activity-success-sweep"
            />
          ) : null}
          <motion.div
            ref={compactRef}
            className="absolute top-0 left-0 flex h-9 w-max max-w-[calc(100vw-26px)] items-center gap-2.5 px-3.5"
            aria-hidden="true"
            inert={expanded}
            initial={false}
            animate={{ opacity: expanded ? 0 : 1, filter: !reduceMotion && expanded ? "blur(3px)" : "blur(0px)" }}
            transition={reduceMotion ? { duration: 0 } : FACE}
          >
            <span className="shrink-0 text-amber-600 dark:text-[#FFD800]" data-slot="status-mark-compact">
              <StatusMark status={markStatus} size={16} active={!expanded} />
            </span>
            <span className="truncate text-xs font-medium">{label}</span>
          </motion.div>
          <motion.div
            ref={expandedRef}
            className={cn("absolute top-0 left-0 w-[min(398px,calc(100vw-26px))]", activity.phase === "success" ? "pb-4" : "pb-3")}
            inert={!expanded}
            aria-hidden={!expanded || undefined}
            initial={false}
            animate={{ opacity: expanded ? 1 : 0, filter: !reduceMotion && !expanded ? "blur(3px)" : "blur(0px)" }}
            transition={reduceMotion ? { duration: 0 } : FACE}
            style={{ pointerEvents: expanded ? undefined : "none" }}
          >
          <div className="relative flex min-h-[4.5rem] items-stretch overflow-hidden" data-slot="live-activity-body">
            <span
              className="relative z-10 grid w-12 shrink-0 self-stretch place-items-center text-amber-600 dark:text-[#FFD800]"
              aria-hidden="true"
              data-slot="status-mark-rail"
            >
              <StatusMark status={markStatus} size={28} active={expanded} />
            </span>
            <div className={cn(
              "relative z-10 flex min-w-0 flex-1 flex-wrap items-center gap-3 py-3 pr-3 pl-1 max-sm:gap-y-1.5",
            )}>
              <div className="min-w-0 flex-1 max-sm:basis-full">
              <strong className={cn("block truncate font-medium", activity.phase === "running" && "live-activity-shimmer")} data-text={activity.phase === "running" ? label : undefined}>{label}</strong>
              <span className="mt-0.5 block">
                {activity.phase === "queued" ? (
                  <span className="text-sm text-[#313131]/75 dark:text-stone-300">
                    {activity.buffered ? (
                      <>{intl("components_ui_live_activity.youAreInTheCandidateRingACandidateWill")}</>
                    ) : (
                      <>{intl("components_ui_live_activity.ahead")}<strong className="font-semibold">{activity.queuePosition ?? "—"}</strong>{intl("components_ui_live_activity.estimatedWait")}<strong className="font-semibold">{formatDuration(activity.etaSeconds, en)}</strong></>
                    )}
                  </span>
                ) : activity.phase === "running" ? (
                  <span className="text-sm text-[#313131]/70 dark:text-stone-300">
                    {progressionAdjustment
                      ? (intl("components_ui_live_activity.reSolvingWithTheAdjustedOperatorRosterPleaseWait"))
                      : (intl("components_ui_live_activity.callingTheSchedulingServicePleaseWait"))}
                    {activity.queuePosition != null ? (
                      <>
                        {intl("components_ui_live_activity.queuePosition")}<strong className="font-semibold">{activity.queuePosition}</strong>{intl("components_ui_live_activity.estimatedWait2")}<strong className="font-semibold">{formatDuration(activity.etaSeconds, en)}</strong>
                      </>
                    ) : null}
                  </span>
                ) : (
                  <span className={cn("text-xs", activity.phase === "error" ? "text-red-800/70 dark:text-red-200" : "text-[#313131]/58 dark:text-stone-400")}>
                    {activity.phase === "success"
                      ? progressionAdjustment
                        ? (intl("components_ui_live_activity.theAdjustedScheduleIsReadyForComparison"))
                        : (intl("components_ui_live_activity.theThreeShiftResultIsReadyToViewOr"))
                      : `${activity.error?.code ?? "AIC-PLAN"}${activity.error?.requestId ? ` · ${activity.error.requestId}` : ""}`}
                  </span>
                )}
              </span>
              {activity.phase === "queued" ? (
                <span className="mt-1 block text-sm text-[#313131]/58 dark:text-stone-400">
                  {intl("components_ui_live_activity.thisPageUpdatesAutomaticallyDoNotSubmitAgain")}
                </span>
              ) : null}
              {diagnostic ? <span className="mt-1 block text-xs text-red-900 dark:text-red-200">{diagnostic.suggestion}</span> : null}
              </div>
              {activity.phase === "error" ? (
                <span className="flex shrink-0 items-center gap-1 max-sm:basis-full max-sm:justify-end">
                {activity.error?.retryable ? (
                  <Button type="button" size="sm" variant="ghost" className="h-9 text-red-900 hover:bg-red-100 hover:text-red-950 dark:text-red-200 dark:hover:bg-red-900 dark:hover:text-red-50" onClick={onRetry} disabled={retryCountdownSeconds > 0}>
                    {retryCountdownSeconds > 0 ? `${intl("components_ui_live_activity.retryIn")} ${retryCountdownSeconds} ${intl("components_ui_live_activity.s")}`.trim() : (intl("components_ui_live_activity.retry"))}
                  </Button>
                ) : null}
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-9 text-red-900 hover:bg-red-100 hover:text-red-950 dark:text-red-200 dark:hover:bg-red-900 dark:hover:text-red-50"
                  onClick={() => {
                    onCopyDiagnostic();
                    setCopied(true);
                  }}
                >
                  {copied ? (intl("components_ui_live_activity.copied")) : (intl("components_ui_live_activity.copyDiagnostics"))}
                </Button>
                </span>
              ) : null}
              <button
                type="button"
                onClick={() => setDismissed({ id: activity.id, phase: activity.phase })}
                aria-label={intl("components_ui_live_activity.dismissNotification")}
                className="h-8 shrink-0 rounded-md px-2 text-xs text-[#313131]/48 outline-none transition-colors hover:bg-black/5 hover:text-[#313131] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#FFD800] dark:text-stone-400 dark:hover:bg-white/10 dark:hover:text-stone-100 max-sm:ml-auto"
              >
                {intl("components_ui_live_activity.dismiss")}
              </button>
            </div>
          </div>
          {activity.phase !== "success" ? <div className="mx-3 h-1 overflow-hidden rounded-full bg-black/8 dark:bg-white/10" aria-hidden="true" data-slot="activity-progress-track">
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
                className="block h-full w-full bg-red-400"
                initial={reduceMotion ? false : { scaleX: 0.72 }}
                animate={{ scaleX: 1 }}
                transition={{ duration: reduceMotion ? 0 : MOTION_DURATION.state, ease: MOTION_EASE_OUT }}
                style={{ transformOrigin: "left center" }}
                data-slot="activity-progress-indicator"
              />
            )}
          </div> : null}
          </motion.div>
        </motion.aside>
      ) : null}
      </AnimatePresence>

      <Dialog open={solverWarningOpen} onOpenChange={setSolverWarningOpen}>
        <DialogContent className="grid max-h-[min(680px,calc(100dvh-2rem))] grid-rows-[auto_minmax(0,1fr)_auto] gap-0 sm:max-w-[min(540px,calc(100vw-2rem))]">
          <DialogHeader>
            <DialogTitle className="text-xl">{intl("components_ui_live_activity.scheduleGenerated")}</DialogTitle>
            <DialogDescription className="text-base leading-7">{intl("components_ui_live_activity.theThreeShiftResultIsReadyToViewOr")}</DialogDescription>
          </DialogHeader>
          <div className="px-5 pb-2 text-lg font-medium leading-8 text-amber-700 sm:px-7">
            {intl("components_ui_live_activity.solverIterationWarning")}
          </div>
          <DialogFooter>
            <DialogClose render={<Button type="button" />}>{intl("components_ui_live_activity.dismiss")}</DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function formatDuration(seconds: number | null | undefined, en = false): string {
  const total = Math.max(0, Math.round(seconds ?? 0));
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  if (minutes <= 0) return `${rest} ${localize_components_ui_live_activity.text(en, "s2")}`;
  return `${minutes} ${localize_components_ui_live_activity.text(en, "min")} ${rest} ${localize_components_ui_live_activity.text(en, "s2")}`;
}
