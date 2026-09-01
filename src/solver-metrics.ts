import type { AdminSolverMetricsData } from "./types";

export const ADMIN_SOLVER_ERROR_WINDOW_MINUTES = 15;
export const ADMIN_SOLVER_METRICS_REFRESH_INTERVAL_SECONDS = 10;

type AdminSolverMetricCounts = {
  generatedAt: Date;
  cacheEnabled: boolean;
  successCount: number;
  failureCount: number;
  cacheHitCount: number;
  readyCacheEntryCount: number;
  fillingCacheEntryCount: number;
};

function count(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;
}

function rate(numerator: number, denominator: number): number | null {
  return denominator > 0 ? numerator / denominator : null;
}

export function buildAdminSolverMetricsData(input: AdminSolverMetricCounts): AdminSolverMetricsData {
  const successCount = count(input.successCount);
  const failureCount = count(input.failureCount);
  const completedCount = successCount + failureCount;
  const hitCount = count(input.cacheHitCount);
  const readyEntryCount = count(input.readyCacheEntryCount);
  const fillingEntryCount = count(input.fillingCacheEntryCount);
  const missCount = readyEntryCount;
  const lookupCount = hitCount + missCount;

  return {
    generatedAt: input.generatedAt.toISOString(),
    solver: {
      windowMinutes: ADMIN_SOLVER_ERROR_WINDOW_MINUTES,
      successCount,
      failureCount,
      completedCount,
      errorRate: rate(failureCount, completedCount),
    },
    cache: {
      enabled: input.cacheEnabled,
      hitCount,
      missCount,
      lookupCount,
      hitRate: rate(hitCount, lookupCount),
      readyEntryCount,
      fillingEntryCount,
    },
  };
}
