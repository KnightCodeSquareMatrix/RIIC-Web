import { estimateDailyProduction } from "./daily-production.ts";
import { droneProductionForSelectedMaaTargets, equivalentGoldForRotation } from "./drone-production-core.ts";
import { manualScheduleToMaa, type ManualScheduleDraft } from "./manual-schedule.ts";
import { evaluateManualSchedule, type ManualEvaluationWarning, type ManualRoomEvaluation } from "./manual-schedule-evaluator.ts";
import { evaluateManualScheduleWithNativeEngine } from "./manual-schedule-native-evaluator.ts";
import type { BaseBlueprint, MaaJson, OperBoxEntry, RotationJson } from "./types.ts";

export type ManualPlanResult = {
  kind: "manual";
  revision: 1;
  layout: BaseBlueprint;
  maa: MaaJson;
  rotation: RotationJson;
  roomsByShift: ManualRoomEvaluation[][];
  warnings: ManualEvaluationWarning[];
  elapsedMs: number;
};

export async function assembleNativeManualPlanResult(input: {
  draft: ManualScheduleDraft;
  layout: BaseBlueprint;
  operbox: readonly OperBoxEntry[] | null;
}): Promise<ManualPlanResult> {
  const layout = structuredClone(input.layout);
  const draft = structuredClone(input.draft);
  const maa = manualScheduleToMaa(draft, layout, draft.fiammettaEnabled);
  const evaluation = await evaluateManualScheduleWithNativeEngine({ draft, layout, operbox: input.operbox });
  const rotation = structuredClone(evaluation.rotation);
  const production = estimateDailyProduction({ layout, maa, rotation });
  rotation.daily.production = {
    lmd: production.lmdOrders.natural ?? 0,
    pure_gold: production.gold.natural ?? 0,
    battle_records: production.experience.natural ?? 0,
    originium_shards: production.shards.natural ?? 0,
    orundum: production.orundum.natural ?? 0,
    equivalent_gold: equivalentGoldForRotation(rotation),
  };
  rotation.daily.drone_production = droneProductionForSelectedMaaTargets({ layout, maa, rotation });
  return {
    kind: "manual",
    revision: 1,
    layout,
    maa,
    rotation,
    roomsByShift: evaluation.roomsByShift,
    warnings: evaluation.warnings,
    elapsedMs: evaluation.elapsedMs,
  };
}

export function assemblePaperManualPlanResult(input: {
  draft: ManualScheduleDraft;
  layout: BaseBlueprint;
  operbox: readonly OperBoxEntry[] | null;
}): ManualPlanResult {
  const layout = structuredClone(input.layout);
  const draft = structuredClone(input.draft);
  const maa = manualScheduleToMaa(draft, layout, draft.fiammettaEnabled);
  const evaluation = evaluateManualSchedule({ draft, layout, operbox: input.operbox });
  const rotation = structuredClone(evaluation.rotation);
  if (rotation.daily.production) {
    rotation.daily.production.equivalent_gold = equivalentGoldForRotation(rotation);
    rotation.daily.drone_production = droneProductionForSelectedMaaTargets({ layout, maa, rotation });
  }
  return {
    kind: "manual",
    revision: 1,
    layout,
    maa,
    rotation,
    roomsByShift: evaluation.roomsByShift,
    warnings: evaluation.warnings,
    elapsedMs: evaluation.elapsedMs,
  };
}
