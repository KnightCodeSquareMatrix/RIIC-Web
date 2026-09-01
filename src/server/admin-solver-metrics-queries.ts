import { and, gt, gte, inArray, lte, or, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import * as schema from "./db/schema.ts";

export function buildAdminSolverAggregateQueries(
  database: NodePgDatabase<typeof schema>,
  windowStartedAt: Date,
  now: Date,
) {
  return {
    solver: database.select({
      successCount: sql<number>`count(*) filter (where ${schema.planRun.status} = 'success')::int`,
      failureCount: sql<number>`count(*) filter (where ${schema.planRun.status} = 'failed')::int`,
      averageDurationMs: sql<number | null>`round(avg(${schema.planRun.durationMs}) filter (where ${schema.planRun.status} = 'success' and ${schema.planRun.durationMs} is not null))::int`,
      p95DurationMs: sql<number | null>`round(percentile_cont(0.95) within group (order by ${schema.planRun.durationMs}) filter (where ${schema.planRun.status} = 'success' and ${schema.planRun.durationMs} is not null))::int`,
      maaCount: sql<number>`count(*) filter (where ${schema.planRun.sourceType} = 'maa')::int`,
      sklandCount: sql<number>`count(*) filter (where ${schema.planRun.sourceType} = 'skland')::int`,
      sampleCount: sql<number>`count(*) filter (where ${schema.planRun.sourceType} = 'sample')::int`,
    }).from(schema.planRun).where(and(
      gte(schema.planRun.createdAt, windowStartedAt),
      lte(schema.planRun.createdAt, now),
    )),
    task: database.select({
      pendingCount: sql<number>`count(*) filter (where ${schema.planTask.status} = 'pending')::int`,
      runningCount: sql<number>`count(*) filter (where ${schema.planTask.status} = 'running')::int`,
      averageWaitMs: sql<number | null>`round(avg(extract(epoch from (${schema.planTask.startedAt} - ${schema.planTask.createdAt})) * 1000) filter (where ${schema.planTask.startedAt} is not null and ${schema.planTask.createdAt} >= ${windowStartedAt}))::int`,
      p95WaitMs: sql<number | null>`round(percentile_cont(0.95) within group (order by extract(epoch from (${schema.planTask.startedAt} - ${schema.planTask.createdAt})) * 1000) filter (where ${schema.planTask.startedAt} is not null and ${schema.planTask.createdAt} >= ${windowStartedAt}))::int`,
    }).from(schema.planTask).where(or(
      inArray(schema.planTask.status, ["pending", "running"]),
      and(gte(schema.planTask.createdAt, windowStartedAt), lte(schema.planTask.createdAt, now)),
    )),
    cache: database.select({
      hitCount: sql<number>`coalesce(sum(${schema.planCache.hitCount}) filter (where ${schema.planCache.publicResult} is not null), 0)::int`,
      readyEntryCount: sql<number>`count(*) filter (where ${schema.planCache.publicResult} is not null)::int`,
      fillingEntryCount: sql<number>`count(*) filter (where ${schema.planCache.publicResult} is null and ${schema.planCache.leaseExpiresAt} > ${now})::int`,
    }).from(schema.planCache).where(gt(schema.planCache.expiresAt, now)),
  };
}
