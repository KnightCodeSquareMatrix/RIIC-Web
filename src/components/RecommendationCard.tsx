"use client";

import { motion, useReducedMotion } from "motion/react";

import { OperatorSlot } from "@/components";
import { InfraTechnicalCard } from "@/components/InfraTechnicalCard";
import { cn } from "@/lib/utils";
import { MOTION_DURATION, MOTION_EASE_OUT } from "@/motion";
import { operatorPortraitFor, operatorProfessionFor } from "@/operatorPortraits";
import type { OperBoxEntry, UserProfileAction } from "@/types";

const DOMAIN_LABELS: Record<string, string> = { trade: "贸易站", trading: "贸易站", manufacture: "制造站", manu: "制造站", power: "发电站", control: "控制中枢", general: "综合" };
const DOMAIN_GROUPS: Record<string, string> = { trade: "trading", trading: "trading", manufacture: "manufacture", manu: "manufacture", power: "power", control: "control", general: "training" };
const KIND_LABELS: Record<string, string> = { promote: "培养优先级", promote_tier_up: "练度提升", acquire: "获取建议", replace: "阵容调整", advice: "培养建议" };

export function recommendationDomainLabel(value: string) { return DOMAIN_LABELS[value.toLowerCase()] ?? "综合"; }
export function recommendationKindLabel(value: string) { return KIND_LABELS[value.toLowerCase()] ?? "培养建议"; }

function currentState(action: UserProfileAction, entry?: OperBoxEntry) {
  const currentElite = action.current_elite ?? entry?.elite;
  if (entry && !entry.own) return "未拥有";
  if (action.tier_up_requirement && currentElite !== undefined) return `当前 精${currentElite} → 目标 ${action.tier_up_requirement}`;
  if (entry?.own && entry.elite >= 2) return "已精二";
  if (entry?.own) return "待培养";
  return "练度未知";
}

export function RecommendationCard({ action, entry, variant = "full", index = 0, showSkillTooltip = true }: { action: UserProfileAction; entry?: OperBoxEntry; variant?: "full" | "compact"; index?: number; showSkillTooltip?: boolean }) {
  const reduceMotion = useReducedMotion();
  const priority = action.priority || "未分级";
  const isHighPriority = /高|urgent|critical|p0|p1/i.test(priority);
  const content = variant === "compact" ? (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-3 border-b border-border/60 py-3 last:border-0" data-recommendation-card="compact">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
          <strong className="text-foreground">{action.operator || "未知干员"}</strong><span aria-hidden="true">·</span><span>{recommendationDomainLabel(action.domain_id)}</span><span aria-hidden="true">·</span><span>{recommendationKindLabel(action.kind)}</span>
        </div>
        <p className="mt-1 text-sm leading-5 text-foreground/80">{action.message || "暂无具体说明"}</p>
        <span className="mt-1 block text-[11px] text-muted-foreground">{currentState(action, entry)}</span>
      </div>
      <span className={cn("h-fit border px-2 py-1 text-[11px] font-semibold", isHighPriority ? "border-amber-500/60 bg-amber-50 text-amber-800" : "border-border bg-muted/60 text-muted-foreground")}>{priority}</span>
    </div>
  ) : (
    <InfraTechnicalCard group={DOMAIN_GROUPS[action.domain_id.toLowerCase()] ?? "training"} className={cn("min-w-0", isHighPriority && "ring-1 ring-inset ring-[var(--room-accent)]/50")} dataSlot="training-advice-card" showEmblem={false}>
      <div className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-center gap-4" data-recommendation-card="full">
        <OperatorSlot
          slot={{
            name: action.operator || "未知干员",
            label: action.operator || "未知干员",
            portrait: operatorPortraitFor(action.operator, entry?.id),
            profession: operatorProfessionFor(action.operator),
          }}
          portraitSize={80}
          showSkillTooltip={showSkillTooltip}
        />
        <div className="grid min-w-0 gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
          <div className="min-w-0"><div className="flex flex-wrap items-center gap-2 text-xs text-white/55"><span className="font-medium text-[var(--room-accent)]">{recommendationDomainLabel(action.domain_id)}</span><span aria-hidden="true">·</span><span>{recommendationKindLabel(action.kind)}</span></div><p className="font-number mt-2 max-w-[72ch] text-pretty text-sm leading-6 text-white/82">{action.message || "暂无具体说明"}</p></div>
          <div className="flex flex-wrap items-center gap-2 sm:flex-col sm:items-end"><span className={cn("font-number border px-2.5 py-1 text-xs font-semibold", isHighPriority ? "border-[var(--room-accent)] bg-[var(--room-accent)] text-[#202223]" : "border-[var(--room-accent)]/45 bg-black/18 text-[var(--room-accent)]")}>{priority}</span><span className="border border-white/15 bg-white/7 px-2.5 py-1 text-xs text-white/70">{currentState(action, entry)}</span></div>
        </div>
      </div>
    </InfraTechnicalCard>
  );
  return <motion.div initial={{ opacity: 0, y: reduceMotion ? 0 : 5 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: reduceMotion ? 0 : MOTION_DURATION.content, delay: reduceMotion ? 0 : Math.min(index, 5) * 0.035, ease: MOTION_EASE_OUT }}>{content}</motion.div>;
}
