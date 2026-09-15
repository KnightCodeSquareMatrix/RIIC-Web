"use client";

import type { ReactNode } from "react";

import { PlanResultSummary } from "@/components/PlanResultSummary";
import { createManualProductionPresentation } from "@/production-summary-adapters";
import type { ManualScheduleEvaluation } from "@/manual-schedule-evaluator";
import type { BaseBlueprint, MaaJson } from "@/types";

type ManualProductionSummaryProps = {
  layout: BaseBlueprint;
  maa: MaaJson;
  computed: boolean;
  evaluation: ManualScheduleEvaluation | null;
  activeShift: number;
  controlsSlot?: ReactNode;
};

export function ManualProductionSummary({ layout, maa, computed, evaluation, activeShift, controlsSlot }: ManualProductionSummaryProps) {
  const presentation = createManualProductionPresentation({ computed, layout, maa, evaluation });
  return <PlanResultSummary
    layout={layout}
    maa={maa}
    activeShift={activeShift}
    comparison={null}
    durationMs={evaluation?.elapsedMs ?? 0}
    productionPresentation={presentation}
    presentationTitle={<><span className="font-number">{layout.template}</span> 手动基建方案</>}
    presentationSubtitle={computed ? <>本地评估耗时 <span className="font-number">{evaluation?.elapsedMs.toFixed(1) ?? "0.0"} ms</span> · 点击查看详情</> : "点击“计算效率”后显示日产量"}
    mode="manual"
    animateEntrance={false}
    controlsSlot={controlsSlot}
  />;
}
