"use client";

import { ChevronRight } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";

import { AnimatedNumber, AnimatedText } from "@/components/AnimatedText";
import { ShiftComparisonDetails } from "@/components/ShiftComparisonCard";
import { RecommendationCard } from "@/components/RecommendationCard";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { estimateDailyProduction, type DailyProductionUnavailableReason } from "@/daily-production";
import { dailyProductionGroups, type DailyProductionGroup, type ProductionDetailProduct } from "@/daily-production-presentation";
import { manufacturePoolReady } from "@/efficiency";
import { cn } from "@/lib/utils";
import { MOTION_DURATION, MOTION_EASE_OUT } from "@/motion";
import { formatPlanDuration, relativeMetricDelta, type RotationMetricKind } from "@/rotation-presentation";
import { countShiftPlacementAdjustments } from "@/skland";
import type { BaseBlueprint, MaaJson, RotationJson, ShiftComparison, UserProfile } from "@/types";

type DetailSection = "efficiency" | "comparison";

function compactNumber(value: number, digits = 1): string {
  if (!Number.isFinite(value)) return "—";
  return Number.isInteger(value) ? String(value) : value.toFixed(digits).replace(/\.?0+$/, "");
}

function severityClass(severity: "ok" | "warn" | "critical") {
  if (severity === "critical") return "bg-red-100 text-red-800";
  if (severity === "warn") return "bg-amber-100 text-amber-800";
  return "bg-emerald-100 text-emerald-800";
}

function improvementComparison(delta: number | undefined): {
  state: "positive" | "negative" | "neutral";
  description: string;
  badge: string;
} {
  if (delta === undefined || !Number.isFinite(delta)) {
    return { state: "neutral", description: "暂无可比方案", badge: "暂无对比" };
  }
  const rounded = Math.round(delta * 10) / 10;
  if (rounded > 0) {
    return { state: "positive", description: `领先推荐方案 ${compactNumber(rounded)}%`, badge: "领先" };
  }
  if (rounded < 0) {
    return { state: "negative", description: `距推荐方案 ${compactNumber(Math.abs(rounded))}%`, badge: "可提升" };
  }
  return { state: "neutral", description: "与推荐方案持平", badge: "持平" };
}

function domainComparison(gapRatio: number): string {
  if (!Number.isFinite(gapRatio)) return "暂无可比方案";
  const rounded = Math.round(gapRatio * 1000) / 10;
  if (rounded > 0) return `领先推荐组合 ${compactNumber(rounded)}%`;
  if (rounded < 0) return `距推荐组合 ${compactNumber(Math.abs(rounded))}%`;
  return "已达到推荐水平";
}

function domainStatus(severity: "ok" | "warn" | "critical"): string {
  if (severity === "critical") return "优先调整";
  if (severity === "warn") return "可继续优化";
  return "状态良好";
}

function dailyNumber(value: number | null): string {
  return value === null ? "—" : Math.round(value).toLocaleString("zh-CN");
}

function unavailableReason(reason: DailyProductionUnavailableReason | undefined): string {
  if (reason === "ambiguous-recipe") return "配方无法归类";
  if (reason === "missing-drone-data") return "无人机数据不足";
  return "逐房数据不足";
}

export function PlanResultSummary({
  profile,
  rotation,
  maa,
  layout,
  activeShift,
  comparison,
  durationMs,
  planRevision,
  animateEntrance = true,
  onEntranceConsumed,
  onPerformanceIssue,
}: {
  profile?: UserProfile;
  rotation?: RotationJson;
  maa: MaaJson;
  layout: BaseBlueprint;
  activeShift: number;
  comparison: ShiftComparison | null;
  durationMs: number;
  planRevision?: string;
  animateEntrance?: boolean;
  onEntranceConsumed?: (revision: string) => void;
  onPerformanceIssue: () => void;
}) {
  const shouldReduceMotion = useReducedMotion();
  const [animateOnMount] = useState(animateEntrance);
  const [detailSection, setDetailSection] = useState<DetailSection>("efficiency");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const performanceFeedbackPendingRef = useRef(false);
  useEffect(() => {
    if (animateOnMount && planRevision) onEntranceConsumed?.(planRevision);
  }, [animateOnMount, onEntranceConsumed, planRevision]);
  if (!profile && !rotation) return null;

  const currentRotation = profile?.rotation;
  const baselineRotation = profile?.baseline_rotation;
  const efficiencyMetrics = [
    { kind: "trade" as const, label: "贸易产线", value: rotation?.daily.trade ?? currentRotation?.daily_trade_efficiency ?? currentRotation?.daily_trade, baseline: baselineRotation?.daily_trade_efficiency ?? baselineRotation?.daily_trade },
    { kind: "manu" as const, label: "制造产线", value: rotation?.daily.manufacture ?? currentRotation?.daily_manufacture_efficiency ?? currentRotation?.daily_manu, baseline: baselineRotation?.daily_manufacture_efficiency ?? baselineRotation?.daily_manu },
    { kind: "power" as const, label: "发电产线", value: rotation?.daily.power ?? currentRotation?.daily_power_efficiency ?? currentRotation?.daily_power, baseline: baselineRotation?.daily_power_efficiency ?? baselineRotation?.daily_power },
  ].filter((metric): metric is { kind: RotationMetricKind; label: string; value: number; baseline: number | undefined } => typeof metric.value === "number");
  const solverDaily = rotation?.daily?.production ?? null;
  const production = rotation && !solverDaily ? estimateDailyProduction({ layout, maa, rotation }) : null;
  const productGroups = dailyProductionGroups(production, solverDaily);
  const adjustmentCount = countShiftPlacementAdjustments(comparison);
  const activeDetailSection = detailSection === "comparison" && comparison ? "comparison" : "efficiency";
  const openDetails = (section: DetailSection) => {
    setDetailSection(section);
    setDrawerOpen(true);
  };
  const requestPerformanceFeedback = () => {
    performanceFeedbackPendingRef.current = true;
    setDrawerOpen(false);
  };
  const handleDrawerCloseComplete = () => {
    if (!performanceFeedbackPendingRef.current) return;
    performanceFeedbackPendingRef.current = false;
    onPerformanceIssue();
  };

  return (
    <>
      <motion.section
        className="relative mb-5 overflow-hidden border border-[#313131]/18 bg-[#F3F1EA] text-[#313131] shadow-[0_12px_30px_rgba(35,38,39,0.10)]"
        aria-label="排班结果摘要"
        data-plan-summary
        data-plan-result-summary
        data-plan-revision={planRevision}
        data-plan-entrance={animateOnMount ? "animated" : "steady"}
        data-active-shift={activeShift}
        initial={animateOnMount
          ? { opacity: 0, y: shouldReduceMotion ? 0 : 14, scale: shouldReduceMotion ? 1 : 0.992 }
          : false}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: shouldReduceMotion ? 0 : -4 }}
        transition={{ duration: shouldReduceMotion ? MOTION_DURATION.feedback : 0.46, delay: shouldReduceMotion ? 0 : 0.04, ease: MOTION_EASE_OUT }}
      >
        {animateOnMount ? (
          <motion.span key={`accent-${planRevision}`} className="pointer-events-none absolute inset-x-0 top-0 z-20 h-0.5 origin-left bg-[#FFD501]" aria-hidden="true" initial={{ scaleX: 0, opacity: 0 }} animate={{ scaleX: 1, opacity: [0, 1, 1, 0] }} transition={{ duration: shouldReduceMotion ? 0 : 0.62, delay: shouldReduceMotion ? 0 : 0.08, times: [0, 0.15, 0.82, 1], ease: MOTION_EASE_OUT }} />
        ) : null}
        <div key={planRevision} className="grid min-h-[84px] grid-cols-[minmax(10rem,1.05fr)_minmax(0,5fr)] items-stretch max-[820px]:grid-cols-1">
          <motion.button type="button" className={cn("group relative flex min-w-0 items-center justify-between gap-3 overflow-hidden bg-[#272A2B] px-5 py-3 text-left text-white focus-visible:outline-2 focus-visible:outline-offset-[-3px] focus-visible:outline-[#FFD800] max-[820px]:row-span-1 max-sm:min-h-16", comparison && "row-span-2")} data-plan-details-trigger="efficiency" data-plan-primary-details-trigger whileHover={shouldReduceMotion ? undefined : { x: 2 }} whileTap={shouldReduceMotion ? undefined : { scale: 0.985 }} onClick={() => openDetails("efficiency")}>
            <motion.span className="min-w-0" data-plan-metric initial={animateOnMount ? { opacity: 0, x: shouldReduceMotion ? 0 : -10 } : false} animate={{ opacity: 1, x: 0 }} transition={{ duration: shouldReduceMotion ? MOTION_DURATION.feedback : 0.36, delay: shouldReduceMotion ? 0 : 0.1, ease: MOTION_EASE_OUT }}>
              <strong className="block truncate text-lg font-medium"><span className="font-number">{layout.template}</span> 基建方案</strong>
              <span className="mt-1 block text-[10px] text-white/45">用时 <span className="font-number">{formatPlanDuration(durationMs)}</span> · 点击查看详情</span>
            </motion.span>
            <ChevronRight className="size-4 shrink-0 text-white/55 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
          </motion.button>

          <div className="grid min-w-0 grid-cols-3 max-sm:grid-cols-2" aria-label="预计日产物" data-daily-production-summary data-production-source={productGroups[0]?.source}>
            {productGroups.map((productGroup, index) => (
              <motion.button
                key={productGroup.id}
                type="button"
                className={cn("group relative flex min-h-[84px] min-w-0 flex-col items-stretch justify-start overflow-hidden border-r border-[#313131]/10 px-3 py-3 text-left transition-colors hover:bg-white/55 focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-primary max-sm:min-h-[78px] max-sm:border-t", productGroup.id === "orundum" && "max-sm:col-span-2")}
                data-plan-details-trigger="efficiency"
                data-daily-product-group={productGroup.id}
                whileTap={shouldReduceMotion ? undefined : { scale: 0.98 }}
                onClick={() => openDetails("efficiency")}
              >
                <motion.span
                  className="relative z-10 block w-full min-w-0 self-start"
                  data-plan-metric
                  initial={animateOnMount ? { opacity: 0, y: shouldReduceMotion ? 0 : 10 } : false}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: shouldReduceMotion ? MOTION_DURATION.feedback : 0.36, delay: shouldReduceMotion ? 0 : 0.15 + index * 0.065, ease: MOTION_EASE_OUT }}
                >
                  <span className="block min-w-0" data-daily-product={productGroup.primary.id}>
                    <span className="font-number block truncate pr-6 text-[10px] font-medium tracking-[0.06em] text-[#313131]/58">{productGroup.primary.label}</span>
                    <strong className="font-technical mt-1 flex min-w-0 items-baseline gap-1 leading-none tabular-nums">
                      <span className="truncate text-[clamp(1rem,1.5vw,1.35rem)] font-semibold"><AnimatedNumber value={dailyNumber(productGroup.primary.amount.value)} drift={{ x: 0, y: shouldReduceMotion ? 0 : 8 }} /></span>
                      {productGroup.primary.amount.value === null ? null : <span className="shrink-0 text-[9px] font-medium text-[#313131]/45">{productGroup.primary.unit}</span>}
                    </strong>
                    {productGroup.primary.amount.value === null ? <span className="mt-1 block truncate text-[10px] font-semibold text-amber-800">{unavailableReason(productGroup.primary.amount.unavailableReason)}</span> : null}
                  </span>
                  {productGroup.supporting ? (
                    <span className="mt-2 flex min-w-0 items-center gap-1.5 bg-[#313131]/[0.045] px-1.5 py-1" data-daily-product={productGroup.supporting.id} data-product-role="supporting">
                      <Image src={productGroup.supporting.icon} alt="" width={16} height={16} unoptimized loading="eager" className="size-4 shrink-0 object-contain" aria-hidden="true" />
                      <span className="min-w-0 flex-1 truncate text-[9px] font-medium text-[#313131]/55">{productGroup.supporting.label}</span>
                      <strong className="font-number flex shrink-0 items-baseline gap-0.5 text-[11px] leading-none tabular-nums">
                        <AnimatedNumber value={dailyNumber(productGroup.supporting.amount.value)} drift={{ x: 0, y: shouldReduceMotion ? 0 : 5 }} />
                        {productGroup.supporting.amount.value === null ? null : <span className="text-[8px] font-medium text-[#313131]/45">{productGroup.supporting.unit}</span>}
                      </strong>
                    </span>
                  ) : null}
                </motion.span>
                <Image src={productGroup.primary.icon} alt="" width={32} height={32} unoptimized loading="eager" className="pointer-events-none absolute right-1.5 top-1.5 size-8 object-contain opacity-75 transition-transform duration-200 group-hover:scale-105" aria-hidden="true" />
                <motion.span className="absolute inset-x-0 bottom-0 h-0.5 origin-left bg-[#313131]/18" aria-hidden="true" initial={animateOnMount ? { scaleX: 0 } : false} animate={{ scaleX: 1 }} transition={{ duration: shouldReduceMotion ? 0 : 0.42, delay: shouldReduceMotion ? 0 : 0.2 + index * 0.065, ease: MOTION_EASE_OUT }} />
              </motion.button>
            ))}
          </div>

          {comparison ? (
            <motion.button type="button" className="col-start-2 min-w-0 border-t border-[#313131]/10 bg-[#E7E3D8] px-4 py-2.5 text-left transition-colors hover:bg-[#DDD8CA] focus-visible:outline-2 focus-visible:outline-primary max-[820px]:col-start-1 max-sm:min-h-14" data-shift-comparison data-plan-details-trigger="comparison" whileTap={shouldReduceMotion ? undefined : { scale: 0.99 }} onClick={() => openDetails("comparison")}>
              <span className="flex items-center justify-between gap-3 text-xs">
                <span className="min-w-0 truncate">最接近第 <strong className="font-number"><AnimatedText value={comparison.planIndex + 1} /></strong> 班 · 匹配率 <strong className="font-number"><AnimatedText value={`${comparison.score}%`} /></strong></span>
                <span className="shrink-0 text-[#313131]/60">
                  {adjustmentCount === 0
                    ? "无需调整"
                    : <>需调整 <strong className="font-number text-[#313131]"><AnimatedText value={adjustmentCount} /></strong> 处</>}
                </span>
              </span>
              <span className="mt-1 block h-1 overflow-hidden bg-[#313131]/10" role="progressbar" aria-label="非宿舍设施匹配百分比" aria-valuemin={0} aria-valuemax={100} aria-valuenow={comparison.score}>
                <motion.span
                  className="block h-full bg-primary"
                  initial={animateOnMount
                    ? { scaleX: shouldReduceMotion ? Math.max(0, Math.min(100, comparison.score)) / 100 : 0 }
                    : false}
                  animate={{ scaleX: Math.max(0, Math.min(100, comparison.score)) / 100 }}
                  transition={{ duration: shouldReduceMotion ? 0 : MOTION_DURATION.content, ease: MOTION_EASE_OUT }}
                  style={{ transformOrigin: "left center" }}
                />
              </span>
            </motion.button>
          ) : null}
        </div>
      </motion.section>

      <Drawer open={drawerOpen} onOpenChange={setDrawerOpen} onCloseComplete={handleDrawerCloseComplete} title="排班结果详情" description="查看日产物、产线提升空间和当前进驻匹配。" width={560}>
        <div className="flex h-full min-h-0 flex-col">
          <Tabs value={activeDetailSection} onValueChange={(value) => setDetailSection(value as DetailSection)} className="min-h-0 flex-1 gap-0">
            <TabsList variant="line" className="w-full justify-start gap-1 border-b border-border/70 px-4 py-0" aria-label="结果详情分类">
              <TabsTrigger value="efficiency" className="min-h-11 flex-none px-3">产出与提升</TabsTrigger>
              {comparison ? <TabsTrigger value="comparison" className="min-h-11 flex-none px-3">当前状态匹配</TabsTrigger> : null}
            </TabsList>
            <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto px-4 pb-6" data-plan-details-section={activeDetailSection}>
              <TabsContent value="efficiency" className="m-0">
                <motion.div initial={{ opacity: 0, x: shouldReduceMotion ? 0 : -12 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: shouldReduceMotion ? 0 : MOTION_DURATION.state, ease: MOTION_EASE_OUT }}>
                  <EfficiencyDetails profile={profile} rotation={rotation} layout={layout} metrics={efficiencyMetrics} productGroups={productGroups} />
                </motion.div>
              </TabsContent>
              {comparison ? (
                <TabsContent value="comparison" className="m-0">
                  <motion.div initial={{ opacity: 0, x: shouldReduceMotion ? 0 : 12 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: shouldReduceMotion ? 0 : MOTION_DURATION.state, ease: MOTION_EASE_OUT }}>
                    <ShiftComparisonDetails comparison={comparison} />
                  </motion.div>
                </TabsContent>
              ) : null}
            </div>
          </Tabs>
          <div className="shrink-0 border-t border-[#313131]/12 px-5 py-2.5">
            <Button
              type="button"
              variant="link"
              className="h-11 justify-start px-0 text-xs font-medium text-[#313131]/58 hover:text-[#313131]"
              data-plan-performance-feedback
              onClick={requestPerformanceFeedback}
            >
              反馈本次求解速度
            </Button>
          </div>
        </div>
      </Drawer>
    </>
  );
}

function ProductionDetailItem({ product, supporting = false }: { product: ProductionDetailProduct; supporting?: boolean }) {
  return (
    <article
      className={cn(
        "grid gap-3 sm:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]",
        supporting && "ml-6 bg-muted/40 px-3 py-2 sm:ml-12",
      )}
      data-production-detail={product.id}
      data-product-role={supporting ? "supporting" : "primary"}
    >
      <div className="flex min-w-0 items-center gap-3">
        <Image src={product.icon} alt="" width={32} height={32} unoptimized loading="eager" className="size-8 shrink-0 object-contain" aria-hidden="true" />
        <div className="min-w-0">
          <span className="flex min-w-0 items-center gap-2">
            <span className="truncate text-[11px] font-semibold text-muted-foreground">{product.label}</span>
            {product.relation ? <span className="shrink-0 bg-background/80 px-1.5 py-0.5 text-[9px] text-muted-foreground">{product.relation}</span> : null}
          </span>
          <strong className={cn("font-technical mt-0.5 flex items-baseline gap-1 leading-none tabular-nums", supporting ? "text-lg" : "text-xl")}>
            <span>{dailyNumber(product.amount.value)}</span>
            {product.amount.value === null ? null : <span className="text-[10px] font-medium text-muted-foreground">{product.unit} / 日</span>}
          </strong>
          {product.amount.value === null ? <span className="mt-1 block text-[10px] font-semibold text-amber-800">{unavailableReason(product.amount.unavailableReason)}</span> : null}
        </div>
      </div>
      <div className="min-w-0 text-[11px]">
        <dl className="grid grid-cols-2 gap-x-3 gap-y-1">
          {product.rows.map(([label, value, unit]) => (
            <div key={label} className="flex min-w-0 justify-between gap-2">
              <dt className="truncate text-muted-foreground">{label}</dt>
              <dd className="font-number shrink-0 font-semibold">{dailyNumber(value)}{value === null ? "" : ` ${unit}`}</dd>
            </div>
          ))}
        </dl>
        {product.note ? <p className="mt-1.5 text-muted-foreground">{product.note}</p> : null}
      </div>
    </article>
  );
}

function ProductionDetails({ productGroups }: { productGroups: DailyProductionGroup[] }) {
  if (!productGroups.length) return null;
  return (
    <section aria-label="预计日产物详情" data-production-details data-production-source={productGroups[0].source}>
      <h3 className="text-sm font-semibold">预计日产物</h3>
      <div className="mt-2 divide-y divide-border/70 border-y border-border/70">
        {productGroups.map((productGroup) => (
          <section key={productGroup.id} className="space-y-2 py-3" data-production-group={productGroup.id}>
            <ProductionDetailItem product={productGroup.primary} />
            {productGroup.supporting ? <ProductionDetailItem product={productGroup.supporting} supporting /> : null}
          </section>
        ))}
      </div>
    </section>
  );
}

function EfficiencyDetails({ profile, rotation, layout, metrics, productGroups }: { profile?: UserProfile; rotation?: RotationJson; layout: BaseBlueprint; metrics: Array<{ kind: RotationMetricKind; label: string; value: number; baseline: number | undefined }>; productGroups: DailyProductionGroup[] }) {
  const shouldReduceMotion = useReducedMotion();
  const summary = profile?.summary;
  const domains = profile?.domains ?? [];
  return (
    <section className="pt-4" aria-label="产出与提升详情" data-efficiency-details>
      <ProductionDetails productGroups={productGroups} />
      <div className="mt-5 border-t border-border/70 pt-4">
        <h3 className="text-sm font-semibold">产线提升空间</h3>
      </div>
      <div className="mt-2 grid gap-2 sm:grid-cols-3" data-efficiency-insights>
        {metrics.map((metric, index) => {
          const delta = typeof metric.baseline === "number" ? relativeMetricDelta(metric.value, metric.baseline) : undefined;
          const comparison = improvementComparison(delta);
          return <motion.article key={metric.kind} className={cn("relative overflow-hidden border px-3 py-3", comparison.state === "neutral" ? "border-border/70 bg-muted/25" : comparison.state === "positive" ? "border-emerald-800/20 bg-emerald-50/55" : "border-red-800/20 bg-red-50/60")} data-insight-state={comparison.state} initial={{ opacity: 0, y: shouldReduceMotion ? 0 : 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: shouldReduceMotion ? 0 : 0.34, delay: shouldReduceMotion ? 0 : index * 0.055, ease: MOTION_EASE_OUT }}><span className={cn("absolute inset-y-0 left-0 w-0.5", comparison.state === "neutral" ? "bg-[#313131]/25" : comparison.state === "positive" ? "bg-emerald-500" : "bg-red-500")} aria-hidden="true" /><span className="block text-[11px] font-semibold tracking-[0.08em] text-muted-foreground">{metric.label}</span><strong className="mt-2 block text-sm leading-5">{comparison.description}</strong><span className={cn("mt-3 inline-flex px-1.5 py-0.5 text-[11px] font-semibold", comparison.state === "neutral" ? "bg-muted text-muted-foreground" : comparison.state === "positive" ? "bg-emerald-700 text-emerald-50" : "bg-red-700 text-red-50")}>{comparison.badge}</span></motion.article>;
        })}
      </div>
      {summary ? <dl className="mt-4 flex flex-wrap gap-x-4 gap-y-1 border-y border-border/70 py-2 text-xs" aria-label="账号准备度"><div className="flex gap-1"><dt className="text-muted-foreground">候选干员</dt><dd className="font-number font-semibold">贸易 {summary.trade_pool_ready} · 制造 {manufacturePoolReady(summary) ?? "—"}</dd></div><div className="flex gap-1"><dt className="text-muted-foreground">中枢</dt><dd className="font-number font-semibold">Lv.{layout.rooms.find((room) => room.kind === "control_center")?.level ?? "—"}</dd></div><div className="flex gap-1"><dt className="text-muted-foreground">班次</dt><dd className="font-number font-semibold">{rotation?.shifts.length ?? 0}</dd></div><div className="flex gap-1"><dt className="text-muted-foreground">可用干员</dt><dd className="font-number font-semibold">{summary.owned} / 进阶 {summary.tier_up_owned}</dd></div></dl> : null}
      {domains.length ? <div className="mt-5 border-t border-border/70 pt-4"><h3 className="text-sm font-semibold">设施组合提升空间</h3><div className="mt-2 grid gap-1">{[...domains].sort((a, b) => ({ critical: 0, warn: 1, ok: 2 })[a.severity] - ({ critical: 0, warn: 1, ok: 2 })[b.severity]).map((domain) => <div key={domain.id} className="grid gap-2 border-b border-border/60 py-3 text-xs sm:grid-cols-[minmax(0,1fr)_auto]" data-domain-state={domain.severity}><div className="min-w-0"><strong className="block truncate">{domain.label}</strong><span className="mt-0.5 block text-muted-foreground">当前干员：{domain.current.operators.length ? domain.current.operators.join(" / ") : "暂无可用组合"}</span></div><div className="flex items-center justify-between gap-2 sm:block sm:text-right"><span className="tabular-nums">{domainComparison(domain.gap_ratio)}</span><span className={cn("ml-2 px-1.5 py-0.5 font-semibold", severityClass(domain.severity))}>{domainStatus(domain.severity)}</span></div></div>)}</div></div> : null}
      {profile?.actions.length ? <div className="mt-5 border-t border-border/70 pt-4"><h3 className="text-sm font-semibold">下一步建议</h3><div className="mt-1">{profile.actions.map((action, index) => <RecommendationCard key={`${action.domain_id}-${action.operator}-${index}`} action={action} variant="compact" index={index} />)}</div></div> : null}
      {profile?.flags.length || profile?.narration_hints.length ? <div className="mt-5 flex flex-wrap gap-1.5 border-t border-border/70 pt-4">{[...(profile?.flags ?? []), ...(profile?.narration_hints ?? [])].map((flag) => <span key={flag} className="bg-muted px-2 py-1 text-xs text-muted-foreground">{flag}</span>)}</div> : null}
    </section>
  );
}
