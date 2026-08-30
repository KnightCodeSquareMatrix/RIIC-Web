"use client";

import { Download, Ellipsis, FlaskConical, HeartPulse, Keyboard, Loader2, Play, Search, Settings2, X } from "lucide-react";
import { lazy, Suspense, useEffect, useRef, useState, type ReactNode } from "react";

import { ScheduleBoard, ShiftTabs } from "@/components";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PlanResultSummarySkeleton } from "@/components/PlanResultSummarySkeleton";

import type { FactoryRecipe, TradeOrder } from "@/blueprint";
import { loadClientFeature } from "@/client-lazy-loader";
import { cn } from "@/lib/utils";
import type { ShiftDirection } from "@/motion";
import { onboardingStepStatuses } from "@/onboarding";
import type { RoomRow } from "@/schedule";
import type {
  BaseBlueprint,
  FeedbackData,
  MaaPlan,
  PublicPlanData,
  ShiftComparison,
} from "@/types";

const PlanResultSummary = lazy(() => loadClientFeature("planResultSummary").then((module) => ({ default: module.PlanResultSummary })));
const ShortcutGuideDialog = lazy(() => loadClientFeature("sharedComponents").then((module) => ({ default: module.ShortcutGuideDialog })));

function DeferredResultLoading() {
  return <PlanResultSummarySkeleton />;
}

function Panel({ children, className = "", action, title, icon }: {
  children: ReactNode;
  className?: string;
  action?: ReactNode;
  title?: string;
  icon?: ReactNode;
}) {
  return (
    <section className={cn("min-w-0 py-5", className)}>
      {title || icon || action ? (
        <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
          {title || icon ? <div className="flex min-w-0 items-start gap-2">{icon}<h2 className="text-sm font-semibold tracking-tight">{title}</h2></div> : null}
          {action ? <div className={cn("ms-auto min-w-0 max-sm:w-full", !title && !icon && "w-full")}>{action}</div> : null}
        </header>
      ) : null}
      <div>{children}</div>
    </section>
  );
}

function RunButton({
  canRun,
  hasBox,
  plannerReady,
  requiresAccount,
  onRun,
}: {
  canRun: boolean;
  hasBox: boolean;
  plannerReady: boolean;
  requiresAccount: boolean;
  onRun: () => void;
}) {
  const unavailableLabel = requiresAccount
    ? "请先登录网站账号"
    : plannerReady
      ? "请先导入干员数据"
      : "排班服务尚未就绪";
  return (
    <Button
      size="sm"
      className="h-9 min-w-0 max-sm:h-11 max-sm:px-3 max-sm:text-xs"
      aria-label={canRun || hasBox ? "生成排班" : unavailableLabel}
      title={!canRun && !(requiresAccount && hasBox && plannerReady) ? unavailableLabel : undefined}
      onClick={onRun}
      disabled={!canRun && !(requiresAccount && hasBox && plannerReady)}
    >
      <Play />
      <span>{requiresAccount && hasBox ? "登录后生成" : !plannerReady ? "排班服务未就绪" : canRun ? "生成排班" : "导入后生成"}</span>
    </Button>
  );
}

function CalculatorStartPanel({
  websiteAuthenticated,
  hasPersonalBox,
  hasSampleBox,
  sampleLoading,
  loading,
  plannerReady,
  accountControl,
  onStartPersonalFlow,
  onLoadSample,
  onRun,
  onOpenSetup,
  onDismissOnboarding,
}: {
  websiteAuthenticated: boolean;
  hasPersonalBox: boolean;
  hasSampleBox: boolean;
  sampleLoading: boolean;
  loading: boolean;
  plannerReady: boolean;
  accountControl?: ReactNode;
  onStartPersonalFlow: () => void;
  onLoadSample: () => Promise<boolean>;
  onRun: () => void;
  onOpenSetup: () => void;
  onDismissOnboarding: () => void;
}) {
  const statuses = onboardingStepStatuses({
    authenticated: websiteAuthenticated,
    hasPersonalBox,
    hasSuccessfulPlan: false,
  });
  const steps = [
    {
      title: "登录网站账号",
      eyebrow: "网站账号",
      description: websiteAuthenticated ? "账号状态已确认，可以继续导入个人数据。" : "保护个人 BOX、排班记录与后续同步。",
      group: "control",
    },
    {
      title: "导入自己的 BOX",
      eyebrow: "干员数据",
      description: hasPersonalBox ? "个人 BOX 已就绪，可以配置布局并生成方案。" : "支持自主上传或第三方同步。",
      group: "trading",
    },
    {
      title: "生成第一份方案",
      eyebrow: "三班排班",
      description: "得到三班排班、关键房间提示与 MAA 文件。",
      group: "manufacture",
    },
  ] as const;
  const personalActionLabel = !websiteAuthenticated
    ? hasPersonalBox ? "登录并继续生成" : "登录并导入 BOX"
    : hasPersonalBox && !plannerReady ? "排班服务未就绪" : hasPersonalBox ? "生成第一份方案" : "导入自己的 BOX";
  const personalActionAriaLabel = hasPersonalBox ? "生成排班" : "配置Box与布局";
  const personalPlanUnavailable = websiteAuthenticated && hasPersonalBox && !plannerReady;
  const actionControls = (
    <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row sm:flex-wrap sm:items-center" data-calculator-controls>
      <Button
        type="button"
        size="lg"
        className="min-h-11 sm:min-w-44"
        aria-label={personalActionAriaLabel}
        title={personalPlanUnavailable ? "排班服务尚未就绪" : undefined}
        disabled={loading || personalPlanUnavailable}
        onClick={hasPersonalBox && websiteAuthenticated ? onRun : onStartPersonalFlow}
      >
        {loading && hasPersonalBox ? <Loader2 className="animate-spin" /> : <Play />}
        {loading && hasPersonalBox ? "正在生成第一份方案…" : personalActionLabel}
      </Button>
      <Button
        type="button"
        size="lg"
        variant="outline"
        className="min-h-11 bg-white/72 sm:min-w-44"
        aria-label={hasSampleBox ? "生成排班" : "全角色导入"}
        disabled={sampleLoading || loading || (hasSampleBox && !plannerReady)}
        onClick={hasSampleBox ? onRun : () => void onLoadSample()}
      >
        {sampleLoading || (loading && hasSampleBox) ? <Loader2 className="animate-spin" /> : <FlaskConical />}
        {sampleLoading ? "正在载入示例…" : loading && hasSampleBox ? "正在生成示例…" : hasSampleBox ? "生成示例排班" : "先看全角色示例"}
      </Button>
      {hasPersonalBox ? (
        <div className="inline-flex min-w-0 max-sm:[&_[data-skland-account-control]]:rounded-l-none" data-calculator-setup-group>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className={accountControl
              ? "h-9 rounded-r-none max-sm:h-11"
              : "h-9 max-sm:h-11"}
            aria-label="配置Box与布局"
            onClick={onOpenSetup}
          >
            <Settings2 />调整 BOX 与布局
          </Button>
          {accountControl}
        </div>
      ) : null}
      {!hasPersonalBox && accountControl ? <div className="self-center">{accountControl}</div> : null}
      <Button type="button" variant="ghost" className="min-h-11" onClick={onDismissOnboarding}>
        暂时跳过引导
      </Button>
    </div>
  );

  return (
    <section
      className="relative isolate flex min-h-[calc(100svh-3.5rem)] items-center overflow-hidden bg-[#f7f5ec] px-4 py-8 sm:px-6 md:min-h-svh lg:px-8"
      aria-label="生成排班起步区"
      data-calculator-start-panel
      data-onboarding-active="true"
    >
      <div className="pointer-events-none absolute inset-y-0 right-0 hidden w-[34%] bg-[linear-gradient(135deg,transparent_0_38%,rgb(49_49_49/0.035)_38%_62%,transparent_62%)] lg:block" aria-hidden="true" />
      <div className="relative mx-auto flex w-full max-w-5xl flex-col justify-center">
        <ol
          className="grid w-full gap-3 md:grid-cols-2 xl:grid-cols-3"
          aria-label="生成个人排班的步骤"
        >
            {steps.map((step, index) => {
              const status = statuses[index];
              const statusLabel = status === "complete" ? "已完成" : status === "current" ? "当前步骤" : "待开始";
              return (
                <li
                  key={step.title}
                  className={cn(
                    "min-w-0",
                    index === 2 && "md:col-span-2 xl:col-span-1",
                  )}
                  aria-current={status === "current" ? "step" : undefined}
                >
                  <article
                    className={cn(
                      "infra-room-surface onboarding-technical-card relative h-full min-h-40 overflow-hidden px-4 py-4 text-white",
                      status === "current" && "ring-1 ring-[var(--room-accent)]",
                    )}
                    data-room-group={step.group}
                  >
                    <div className="infra-room-emblem onboarding-technical-card-emblem pointer-events-none absolute inset-0 bg-left bg-no-repeat" aria-hidden="true" />
                    <div className="relative z-10 flex h-full flex-col">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex min-h-6 items-center gap-2">
                          <span className="h-5 w-1 shrink-0 bg-[var(--room-accent)]" aria-hidden="true" />
                          <p className="text-xs font-medium tracking-wide text-white/66">
                            <span className="font-number">0{index + 1}</span> · {step.eyebrow}
                          </p>
                        </div>
                        <span
                          className={cn(
                            "shrink-0 border border-white/14 bg-white/6 px-2 py-1 text-[0.68rem] font-medium tracking-wide text-white/58",
                            status === "current" && "border-[var(--room-accent)] text-[var(--room-accent)]",
                            status === "complete" && "text-white/78",
                          )}
                        >
                          {statusLabel}
                        </span>
                      </div>
                      <h2 className="mt-5 text-xl font-semibold tracking-[-0.025em] text-[var(--room-accent)]">
                        {step.title}
                      </h2>
                      <p className="mt-2 text-xs leading-5 text-white/58">{step.description}</p>
                    </div>
                  </article>
                </li>
              );
            })}
        </ol>

        {actionControls}
      </div>
    </section>
  );
}

export interface InfraCalculatorProps {
  layout: BaseBlueprint;
  result: PublicPlanData | null;
  scheduleResult: PublicPlanData | null;
  activeShift: number;
  rows: RoomRow[];
  currentMoraleByOperator: Map<string, number> | undefined;
  activePlan: MaaPlan | undefined;
  closestComparison: ShiftComparison | null;
  resultClearNotice: string | null;
  feedbackResult: FeedbackData | null;
  sampleLoading: boolean;
  loading: boolean;
  canRun: boolean;
  hasBox: boolean;
  hasPersonalBox: boolean;
  hasSampleBox: boolean;
  plannerReady: boolean;
  websiteAuthenticated: boolean;
  showOnboarding: boolean;
  animatePlanEntrance: boolean;
  animateEmptyScheduleEntrance: boolean;
  onPlanEntranceConsumed: (revision: string) => void;
  requiresAccount?: boolean;
  accountControl?: ReactNode;
  onLoadSample: () => Promise<boolean>;
  onStartPersonalFlow: () => void;
  onDismissOnboarding: () => void;
  onOpenSetup: () => void;
  onRun: () => void;
  onCancelRun: () => void;
  onSetActiveShift: (shift: number) => void;
  onMarkIssue: (row: RoomRow) => void;
  onPerformanceIssue: () => void;
  onFactoryRecipeChange: (roomId: string, recipe: FactoryRecipe) => void;
  onTradeOrderChange: (roomId: string, order: TradeOrder) => void;
  onDownloadMaa: () => void;
  onClearResultNotice: () => void;
  onDismissResultClearWarning: () => void;
}

export function InfraCalculator(props: InfraCalculatorProps) {
  const {
    layout,
    result, scheduleResult, activeShift, rows, currentMoraleByOperator,
    activePlan, closestComparison,
    resultClearNotice,
    feedbackResult,
    sampleLoading, loading, canRun, hasBox, hasPersonalBox, hasSampleBox, plannerReady, websiteAuthenticated, showOnboarding, animatePlanEntrance, animateEmptyScheduleEntrance, onPlanEntranceConsumed, requiresAccount = false, accountControl,
    onLoadSample, onStartPersonalFlow, onDismissOnboarding, onOpenSetup, onRun, onCancelRun,
    onSetActiveShift, onMarkIssue, onPerformanceIssue,
    onFactoryRecipeChange, onTradeOrderChange,
    onDownloadMaa,
    onClearResultNotice, onDismissResultClearWarning,
  } = props;
  const [shortcutGuideOpen, setShortcutGuideOpen] = useState(false);
  const [operatorQuery, setOperatorQuery] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [shiftDirection, setShiftDirection] = useState<ShiftDirection>(0);
  const [fiammettaPortrait, setFiammettaPortrait] = useState<string | null>(null);
  const fiammettaTarget = activePlan?.Fiammetta?.enable
    ? (Array.isArray(activePlan.Fiammetta.target) ? activePlan.Fiammetta.target[0] : activePlan.Fiammetta.target)
    : undefined;
  useEffect(() => {
    let cancelled = false;
    if (!fiammettaTarget) {
      setFiammettaPortrait(null);
      return;
    }
    void loadClientFeature("operatorPortraits").then(({ operatorPortraitFor }) => {
      if (!cancelled) setFiammettaPortrait(operatorPortraitFor(fiammettaTarget) ?? null);
    });
    return () => { cancelled = true; };
  }, [fiammettaTarget]);
  const handleSetActiveShift = (nextShift: number) => {
    setShiftDirection(nextShift === activeShift ? 0 : nextShift > activeShift ? 1 : -1);
    onSetActiveShift(nextShift);
  };
  const renderExportActions = (placement: "desktop" | "mobile") => (
    <div
      className={placement === "desktop"
        ? "hidden items-center gap-2 md:flex"
        : "flex min-w-0 items-center justify-end gap-2"}
      data-calculator-export-actions={placement}
    >
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={sampleLoading}
        aria-label="全角色导入"
        onClick={() => void onLoadSample()}
        data-full-e2
      >
        {sampleLoading ? <Loader2 className="animate-spin" /> : <FlaskConical />}
        {sampleLoading ? "正在载入" : "全角色导入"}
      </Button>
      <Button type="button" size="sm" variant="outline" disabled={!result?.maa} onClick={onDownloadMaa}>
        <Download />导出到 MAA
      </Button>
    </div>
  );

  const renderSearch = () => (
    <div className="flex min-w-0 items-center gap-2 max-sm:col-span-3">
      <label className="relative block min-w-0 flex-1">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <Input
          ref={searchInputRef}
          value={operatorQuery}
          onChange={(event) => setOperatorQuery(event.target.value)}
          placeholder="搜索排班中的干员或房间"
          aria-label="搜索排班中的干员或房间"
          className="h-9 pr-10 pl-9 max-sm:h-11"
        />
        {operatorQuery ? (
          <button
            type="button"
            onClick={() => { setOperatorQuery(""); searchInputRef.current?.focus(); }}
            className="absolute top-1/2 right-0 grid size-9 -translate-y-1/2 place-items-center text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#FFD800] max-sm:size-11"
            aria-label="清空排班搜索"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        ) : null}
      </label>
      <Button
        type="button"
        size="icon-lg"
        variant="outline"
        className="hidden size-9 sm:inline-flex"
        aria-label="查看快捷键"
        title="查看快捷键"
        onClick={() => setShortcutGuideOpen(true)}
      >
        <Keyboard />
      </Button>
    </div>
  );

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLocaleLowerCase() === "k") {
        event.preventDefault();
        searchInputRef.current?.focus();
      } else if (event.key === "Escape" && document.activeElement === searchInputRef.current) {
        setOperatorQuery("");
        searchInputRef.current?.blur();
      }
    };
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, []);

  return (
    <>
      <section
        className="infra-technical-canvas block"
        data-infra-canvas
      >
        <section className="min-w-0">
          <Panel
            className={cn(
              "min-h-[calc(100vh-112px)]",
              !scheduleResult && showOnboarding && "py-0",
            )}
            action={!showOnboarding ? (
              <div
                className="grid w-full grid-cols-[minmax(14rem,1fr)_auto_auto] items-center gap-2 max-sm:grid-cols-[auto_auto_minmax(0,1fr)]"
                data-calculator-controls
              >
                {renderSearch()}
                <details className="relative min-w-0 sm:hidden" data-calculator-more-tools>
                  <summary className="flex h-11 cursor-pointer list-none items-center justify-center gap-2 border border-border bg-background px-3 text-sm font-medium marker:content-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FFD800]">
                    <Ellipsis className="size-4" aria-hidden="true" />更多工具
                  </summary>
                  <div className="absolute left-0 top-[calc(100%+0.35rem)] z-30 grid w-[min(18rem,calc(100vw-1.5rem))] gap-2 border border-border bg-background p-2 shadow-lg">
                    <Button type="button" variant="ghost" className="h-11 justify-start" onClick={onOpenSetup}>
                      <Settings2 />配置Box与布局
                    </Button>
                    <Button type="button" variant="ghost" className="h-11 justify-start" onClick={() => setShortcutGuideOpen(true)}>
                      <Keyboard />查看快捷键
                    </Button>
                  </div>
                </details>
                <div className="contents sm:inline-flex sm:min-w-0" data-calculator-setup-group>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className={accountControl
                      ? "h-9 min-w-0 rounded-r-none max-sm:hidden"
                      : "h-9 min-w-0 max-sm:hidden"}
                    aria-label="配置Box与布局"
                    onClick={onOpenSetup}
                  >
                    <Settings2 />
                    配置Box与布局
                  </Button>
                  {accountControl}
                </div>
                {loading ? (
                  <Button type="button" variant="destructive" className="h-9 max-sm:h-11" onClick={onCancelRun} aria-label="取消计算">
                    <Loader2 className="animate-spin" />
                    取消计算
                  </Button>
                ) : <RunButton canRun={canRun} hasBox={hasBox} plannerReady={plannerReady} requiresAccount={requiresAccount} onRun={onRun} />}
              </div>
            ) : null}
          >
            {scheduleResult ? (
              <>
                <Suspense fallback={<DeferredResultLoading />}>
                  <PlanResultSummary
                    profile={scheduleResult.profile}
                    rotation={scheduleResult.rotation}
                    maa={scheduleResult.maa}
                    layout={layout}
                    activeShift={activeShift}
                    comparison={closestComparison}
                    durationMs={scheduleResult.durationMs}
                    planRevision={scheduleResult.diagnosticId}
                    animateEntrance={animatePlanEntrance}
                    onEntranceConsumed={onPlanEntranceConsumed}
                    onPerformanceIssue={onPerformanceIssue}
                  />
                </Suspense>
              </>
            ) : null}
            {!scheduleResult && showOnboarding ? (
              <CalculatorStartPanel
                websiteAuthenticated={websiteAuthenticated}
                hasPersonalBox={hasPersonalBox}
                hasSampleBox={hasSampleBox}
                sampleLoading={sampleLoading}
                loading={loading}
                plannerReady={plannerReady}
                accountControl={accountControl}
                onStartPersonalFlow={onStartPersonalFlow}
                onLoadSample={onLoadSample}
                onRun={onRun}
                onOpenSetup={onOpenSetup}
                onDismissOnboarding={onDismissOnboarding}
              />
            ) : rows.length > 0 ? <ScheduleBoard
              rows={rows}
              layout={layout}
              planRevision={result?.diagnosticId}
              currentMoraleByOperator={currentMoraleByOperator}
              activeShift={activeShift}
              shiftDirection={shiftDirection}
              activePlan={activePlan}
              searchQuery={operatorQuery}
              animateInitialView={!scheduleResult && animateEmptyScheduleEntrance}
              mobileActionsSlot={renderExportActions("mobile")}
              shiftInfoSlot={(
                <div className="flex flex-wrap items-center justify-end gap-2 max-sm:w-full max-sm:justify-between" data-shift-actions>
                  {fiammettaTarget ? (
                    <span className="flex h-7 items-center gap-1 rounded-[min(var(--radius-md),12px)] border border-[#016E65]/30 bg-[#016E65]/10 px-2.5 text-[0.8rem] text-[#016E65] shadow-xs max-sm:h-11" title={`菲亚梅塔恢复 ${fiammettaTarget}`}>
                      <span className="size-5 shrink-0 overflow-hidden rounded-full border border-[#016E65]/25 bg-[#272A2B]">
                        {fiammettaPortrait ? <img src={fiammettaPortrait} alt="" className="size-full object-cover" /> : <HeartPulse className="m-1 size-3 text-[#016E65]" />}
                      </span>
                      <span className="whitespace-nowrap"><span className="text-[#016E65]/70">换心情</span> {fiammettaTarget}</span>
                    </span>
                  ) : null}
                  <ShiftTabs
                    maaJson={result?.maa}
                    rotation={result?.rotation}
                    active={activeShift}
                    closest={closestComparison?.planIndex}
                    onChange={handleSetActiveShift}
                  />
                  {renderExportActions("desktop")}
                </div>
              )}
              onIssue={onMarkIssue}
              onFactoryRecipeChange={onFactoryRecipeChange}
              onTradeOrderChange={onTradeOrderChange}
            /> : (
              <div className="flex min-h-[420px] items-center justify-center border-y border-dashed border-border/70 py-6 text-center text-sm text-muted-foreground">
                没有可展示的布局房间。
              </div>
            )}
          </Panel>
          {feedbackResult ? (
            <div className="mt-3 border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700" role="status">
              反馈已提交，编号：{feedbackResult.feedbackId}
            </div>
          ) : null}
        </section>
      </section>

      {resultClearNotice ? (
        <aside className="fixed left-1/2 top-[max(5rem,calc(env(safe-area-inset-top)+5rem))] z-[70] w-[min(720px,calc(100vw-2rem))] -translate-x-1/2 border border-[#FFD800]/70 bg-[#313131] px-4 py-3 text-white shadow-[0_16px_44px_rgba(0,0,0,0.35)]" aria-live="polite">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <strong className="block text-sm font-semibold text-[#FFD800]">已清空旧求解结果</strong>
              <span className="mt-0.5 block text-xs text-white/68">{resultClearNotice}，需要重新运行求解。</span>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Button type="button" size="sm" variant="ghost" className="text-white hover:bg-white/10 hover:text-white" onClick={onClearResultNotice}>知道了</Button>
              <Button type="button" size="sm" variant="outline" className="border-white/25 bg-transparent text-white hover:bg-white/10 hover:text-white" onClick={onDismissResultClearWarning}>不再提示</Button>
            </div>
          </div>
        </aside>
      ) : null}
      <Suspense fallback={null}>
        <ShortcutGuideDialog open={shortcutGuideOpen} onOpenChange={setShortcutGuideOpen} />
      </Suspense>
    </>
  );
}
