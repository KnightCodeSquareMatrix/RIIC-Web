import type { ManualScheduleDraft } from "./manual-schedule.ts";
import type { ManualScheduleEvaluation } from "./manual-schedule-evaluator.ts";
import type { BaseBlueprint, OperBoxEntry } from "./types.ts";

export const MANUAL_EVALUATION_CACHE_STORAGE_KEY = "arknights-infra-manual-evaluation-v1";
const CACHE_VERSION = 1;
const EVALUATOR_VERSION = 1;
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

type CachedEvaluation = {
  version: number;
  evaluatorVersion: number;
  fingerprint: string;
  evaluation: ManualScheduleEvaluation;
  savedAt: string;
  expiresAt: string;
};

export function createManualEvaluationFingerprint(input: {
  draft: ManualScheduleDraft;
  layout: BaseBlueprint;
  operbox: readonly OperBoxEntry[];
}): string {
  const operators = input.operbox
    .filter((entry) => entry.own)
    .map(({ id, name, elite, level, own }) => ({ id, name, elite, level, own }))
    .sort((left, right) => left.id.localeCompare(right.id));
  const evaluationDraft = { ...input.draft };
  delete evaluationDraft.activeShift;
  return JSON.stringify({ evaluatorVersion: EVALUATOR_VERSION, draft: evaluationDraft, layout: input.layout, operators });
}

function validEvaluation(value: unknown): value is ManualScheduleEvaluation {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<ManualScheduleEvaluation>;
  return typeof candidate.elapsedMs === "number"
    && Number.isFinite(candidate.elapsedMs)
    && Array.isArray(candidate.roomsByShift)
    && Array.isArray(candidate.warnings)
    && candidate.rotation !== undefined
    && Array.isArray(candidate.rotation.shifts);
}

export function loadManualEvaluationCache(storage: StorageLike, fingerprint: string): ManualScheduleEvaluation | null {
  try {
    const raw = storage.getItem(MANUAL_EVALUATION_CACHE_STORAGE_KEY);
    if (!raw) return null;
    const cache = JSON.parse(raw) as CachedEvaluation;
    const structurallyValid = cache.version === CACHE_VERSION
      && cache.evaluatorVersion === EVALUATOR_VERSION
      && Number.isFinite(Date.parse(cache.savedAt))
      && Number.isFinite(Date.parse(cache.expiresAt))
      && Date.parse(cache.expiresAt) > Date.now()
      && validEvaluation(cache.evaluation);
    if (!structurallyValid) {
      storage.removeItem(MANUAL_EVALUATION_CACHE_STORAGE_KEY);
      return null;
    }
    if (cache.fingerprint !== fingerprint) return null;
    return structuredClone(cache.evaluation);
  } catch {
    storage.removeItem(MANUAL_EVALUATION_CACHE_STORAGE_KEY);
    return null;
  }
}

export function persistManualEvaluationCache(storage: StorageLike, fingerprint: string, evaluation: ManualScheduleEvaluation): void {
  const savedAt = Date.now();
  const cache: CachedEvaluation = {
    version: CACHE_VERSION,
    evaluatorVersion: EVALUATOR_VERSION,
    fingerprint,
    evaluation: structuredClone(evaluation),
    savedAt: new Date(savedAt).toISOString(),
    expiresAt: new Date(savedAt + CACHE_TTL_MS).toISOString(),
  };
  storage.setItem(MANUAL_EVALUATION_CACHE_STORAGE_KEY, JSON.stringify(cache));
}

export function clearManualEvaluationCache(storage: Pick<Storage, "removeItem">): void {
  storage.removeItem(MANUAL_EVALUATION_CACHE_STORAGE_KEY);
}
