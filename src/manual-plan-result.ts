import { estimateDailyProductionWithTrace } from "./daily-production.ts";
import { droneProductionForSelectedMaaTargets, droneProductionForSelectedMaaTargetsWithTrace, equivalentGoldForRotation } from "./drone-production-core.ts";
import { manualScheduleToMaa, type ManualScheduleDraft } from "./manual-schedule.ts";
import { evaluateManualSchedule, type ManualEvaluationWarning, type ManualRoomEvaluation } from "./manual-schedule-evaluator.ts";
import { completeWasmEvaluationArtifact, type ManualWasmEvaluationArtifact } from "./manual-wasm-evaluation-diagnostic.ts";
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
}): Promise<{ result: ManualPlanResult; artifact: ManualWasmEvaluationArtifact }> {
  const layout = structuredClone(input.layout);
  const draft = structuredClone(input.draft);
  const maa = manualScheduleToMaa(draft, layout, draft.fiammettaEnabled);
  const { evaluation, artifact } = await evaluateManualScheduleWithNativeEngine({ draft, layout, operbox: input.operbox });
  const rotation = structuredClone(evaluation.rotation);
  const natural = estimateDailyProductionWithTrace({ layout, maa, rotation });
  const drones = droneProductionForSelectedMaaTargetsWithTrace({ layout, maa, rotation });
  rotation.daily.production = {
    lmd: natural.estimate.lmdOrders.natural ?? 0,
    pure_gold: natural.estimate.gold.natural ?? 0,
    battle_records: natural.estimate.experience.natural ?? 0,
    originium_shards: natural.estimate.shards.natural ?? 0,
    orundum: natural.estimate.orundum.value ?? 0,
    equivalent_gold: equivalentGoldForRotation(rotation),
  };
  rotation.daily.drone_production = drones.production;
  const result = {
    kind: "manual" as const,
    revision: 1 as const,
    layout,
    maa,
    rotation,
    roomsByShift: evaluation.roomsByShift,
    warnings: evaluation.warnings,
    elapsedMs: evaluation.elapsedMs,
  };
  return {
    result,
    artifact: completeWasmEvaluationArtifact(artifact, {
      maa,
      rotationBeforeProduction: evaluation.rotation,
      naturalProduction: natural.estimate,
      naturalTrace: natural.trace,
      droneProduction: drones.production,
      droneTrace: drones.trace,
      result,
    }),
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
  }
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
