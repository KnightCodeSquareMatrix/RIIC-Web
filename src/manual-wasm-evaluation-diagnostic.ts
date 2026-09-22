import type { NativeEvalRequestV1, NativeEvalResponseV1 } from "./lib/infra-eval/client.ts";
import { INFRA_EVAL_MANIFEST } from "./lib/infra-eval/manifest.ts";
import type { ManualScheduleDraft } from "./manual-schedule.ts";
import type { ManualPlanResult } from "./manual-plan-result.ts";
import type { ManualRoomEvaluation, ManualScheduleEvaluation } from "./manual-schedule-evaluator.ts";
import type { BaseBlueprint, MaaJson, OperBoxEntry, RotationJson } from "./types.ts";

export type ManualWasmEvaluationArtifact = {
  format: "riic-manual-wasm-evaluation";
  version: 1;
  createdAt: string;
  privacy: {
    localOnly: true;
    includesOperatorAssignments: true;
    excludesCredentials: true;
    excludesAccountIdentifiers: true;
  };
  evaluator: {
    api: string;
    ruleset: string;
    wasmUrl: string;
    glueUrl: string;
  };
  source: {
    draft: ManualScheduleDraft;
    layout: BaseBlueprint;
    operbox: OperBoxEntry[];
  };
  conversion: {
    request: NativeEvalRequestV1;
    durationConversions: Array<{ shiftIndex: number; draftHours: number; wasmHours: number }>;
    ignoredDraftFeatures: string[];
  };
  wasm: {
    response: NativeEvalResponseV1;
    elapsedMs: number;
  };
  projection: {
    roomsByShift: ManualRoomEvaluation[][];
    rotation: RotationJson;
  };
  postProcessing?: {
    maa: MaaJson;
    rotationBeforeProduction: RotationJson;
    naturalProduction: unknown;
    naturalTrace: unknown;
    droneProduction: unknown;
    droneTrace: unknown;
    result: ManualPlanResult;
  };
};

export function createWasmEvaluationArtifact(input: {
  draft: ManualScheduleDraft;
  layout: BaseBlueprint;
  operbox: readonly OperBoxEntry[] | null;
  request: NativeEvalRequestV1;
  response: NativeEvalResponseV1;
  evaluation: ManualScheduleEvaluation;
  elapsedMs: number;
}): ManualWasmEvaluationArtifact {
  return {
    format: "riic-manual-wasm-evaluation",
    version: 1,
    createdAt: new Date().toISOString(),
    privacy: {
      localOnly: true,
      includesOperatorAssignments: true,
      excludesCredentials: true,
      excludesAccountIdentifiers: true,
    },
    evaluator: {
      api: INFRA_EVAL_MANIFEST.api,
      ruleset: INFRA_EVAL_MANIFEST.ruleset,
      wasmUrl: INFRA_EVAL_MANIFEST.wasmUrl,
      glueUrl: "/wasm/infra_eval_wasm.js",
    },
    source: {
      draft: structuredClone(input.draft),
      layout: structuredClone(input.layout),
      operbox: Array.from(structuredClone(input.operbox ?? [])),
    },
    conversion: {
      request: structuredClone(input.request),
      durationConversions: input.draft.shifts.map((shift, shiftIndex) => ({
        shiftIndex,
        draftHours: shift.durationHours,
        wasmHours: input.request.shifts[shiftIndex]?.duration_hours ?? 0,
      })),
      ignoredDraftFeatures: [
        "manual-skill-efficiency",
        "drone-runtime",
        "fiammetta-runtime",
        "cross-shift-mood",
        "inventory",
      ],
    },
    wasm: {
      response: structuredClone(input.response),
      elapsedMs: input.elapsedMs,
    },
    projection: {
      roomsByShift: structuredClone(input.evaluation.roomsByShift),
      rotation: structuredClone(input.evaluation.rotation),
    },
  };
}

export function completeWasmEvaluationArtifact(
  artifact: ManualWasmEvaluationArtifact,
  postProcessing: NonNullable<ManualWasmEvaluationArtifact["postProcessing"]>,
): ManualWasmEvaluationArtifact {
  return { ...artifact, postProcessing: structuredClone(postProcessing) };
}

export function wasmEvaluationLogFilename(now = new Date()): string {
  const stamp = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "").replace("T", "-");
  return `riic-manual-wasm-evaluation-${stamp}.json`;
}
