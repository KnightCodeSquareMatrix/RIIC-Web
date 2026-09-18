"use client";

import type { ReactNode } from "react";

import { PlanResultSummary } from "@/components/PlanResultSummary";
import { createManualProductionPresentation } from "@/production-summary-adapters";
import type { ManualPlanResult } from "@/manual-plan-result";

type ManualProductionSummaryProps = {
  result: ManualPlanResult | null;
  activeShift: number;
  controlsSlot?: ReactNode;
};

export function ManualProductionSummary({ result, activeShift, controlsSlot }: ManualProductionSummaryProps) {
  const presentation = createManualProductionPresentation(result);
  return <PlanResultSummary
    layout={result?.layout ?? { template: "—", drone_cap: 0, scenario: {}, rooms: [] }}
    maa={result?.maa ?? { title: "手动排班", description: "", plans: [] }}
    activeShift={activeShift}
    comparison={null}
    durationMs={result?.elapsedMs ?? 0}
    productionPresentation={presentation}
    presentationTitle={<><span className="font-number">{result?.layout.template ?? "—"}</span> 手动基建方案</>}
    presentationSubtitle={result
      ? <>本地评估耗时 <span className="font-number">{result.elapsedMs.toFixed(1)} ms</span> · 点击查看详情</>
      : "点击“根据效率计算”后显示日产量"}
    mode="manual"
    animateEntrance={false}
    controlsSlot={controlsSlot}
  />;
}
