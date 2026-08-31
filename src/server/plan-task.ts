import { randomUUID } from "node:crypto";

import { and, eq, lt, sql } from "drizzle-orm";

import type { BaseBlueprint, OperBoxEntry } from "@/types";

import { getDatabase } from "./db";
import { planTask } from "./db/schema";

export type PlanTaskStatus = "pending" | "running" | "done" | "failed" | "cancelled";

export type PlanTaskCacheLease = {
  keyHmac: string;
  leaseOwner: string;
};

export type PlanTaskPayload = {
  layout: BaseBlueprint;
  operbox: OperBoxEntry[];
  sourceName: string | null;
  sourceType: "sample" | "maa" | "skland";
  rotation: string;
  fiammettaEnable: boolean;
  layoutTemplate: string;
  roomCount: number;
  operatorCount: number;
  dataOwnerTag?: string | null;
};

export type PlanTaskRow = {
  id: string;
  userId: string | null;
  status: PlanTaskStatus;
  payload: PlanTaskPayload;
  result: unknown;
  error: string | null;
  attempts: number;
  createdAt: Date;
  startedAt: Date | null;
  finishedAt: Date | null;
  expiresAt: Date;
};

export const PLAN_TASK_TTL_MS = 24 * 60 * 60 * 1000;
export const PLAN_TASK_ETA_PER_TASK_SECONDS = 2;

function mapPlanTaskRow(row: typeof planTask.$inferSelect): PlanTaskRow {
  return {
    id: row.id,
    userId: row.userId,
    status: row.status as PlanTaskStatus,
    payload: row.payload as PlanTaskPayload,
    result: row.result,
    error: row.error,
    attempts: row.attempts,
    createdAt: row.createdAt,
    startedAt: row.startedAt,
    finishedAt: row.finishedAt,
    expiresAt: row.expiresAt,
  };
}

export async function createPlanTask(input: {
  userId: string | null;
  payload: PlanTaskPayload;
}): Promise<PlanTaskRow> {
  const now = new Date();
  const row = {
    id: randomUUID(),
    userId: input.userId,
    status: "pending" as const,
    payload: input.payload,
    attempts: 0,
    createdAt: now,
    expiresAt: new Date(now.getTime() + PLAN_TASK_TTL_MS),
  };
  const [inserted] = await getDatabase().insert(planTask).values(row).returning();
  return mapPlanTaskRow(inserted);
}

export async function getPlanTask(id: string): Promise<PlanTaskRow | null> {
  const [row] = await getDatabase().select().from(planTask).where(eq(planTask.id, id)).limit(1);
  return row ? mapPlanTaskRow(row) : null;
}

export async function userHasActivePlanTask(userId: string): Promise<boolean> {
  const [row] = await getDatabase()
    .select({ id: planTask.id })
    .from(planTask)
    .where(and(
      eq(planTask.userId, userId),
      sql`${planTask.status} in ('pending', 'running')`,
    ))
    .limit(1);
  return Boolean(row);
}

/**
 * 原子抢占下一条任务：Postgres 标准无锁做法（FOR UPDATE SKIP LOCKED），
 * 单 Worker 下同样安全，未来扩多 Worker 也直接可用。
 */
export async function claimNextPlanTask(): Promise<PlanTaskRow | null> {
  const result = await getDatabase().execute<{ id: string }>(sql`
    UPDATE ${planTask}
    SET status = 'running', started_at = now(), attempts = attempts + 1
    WHERE id = (
      SELECT id FROM ${planTask}
      WHERE status = 'pending' AND expires_at > now()
      ORDER BY created_at, id
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    )
    RETURNING id
  `);
  const claimed = result.rows[0]?.id;
  if (!claimed) return null;
  return getPlanTask(claimed);
}

export async function completePlanTask(
  id: string,
  input: { status: "done" | "failed"; result?: unknown; error?: string | null },
): Promise<void> {
  await getDatabase()
    .update(planTask)
    .set({
      status: input.status,
      result: input.result === undefined ? null : input.result,
      error: input.error ?? null,
      finishedAt: new Date(),
    })
    .where(eq(planTask.id, id));
}

export async function cancelPlanTask(id: string): Promise<"cancelled" | "running" | "unavailable"> {
  const updated = await getDatabase()
    .update(planTask)
    .set({ status: "cancelled", finishedAt: new Date() })
    .where(and(eq(planTask.id, id), eq(planTask.status, "pending")))
    .returning({ id: planTask.id });
  if (updated.length > 0) return "cancelled";
  const [row] = await getDatabase()
    .select({ status: planTask.status })
    .from(planTask)
    .where(eq(planTask.id, id))
    .limit(1);
  if (!row) return "unavailable";
  return row.status === "running" ? "running" : "unavailable";
}

/** 该任务前面还有多少条 pending（+1 即自身位置）。 */
export async function planQueuePosition(id: string): Promise<number> {
  const [task] = await getDatabase()
    .select({ createdAt: planTask.createdAt })
    .from(planTask)
    .where(eq(planTask.id, id))
    .limit(1);
  if (!task) return 1;
  const [row] = await getDatabase()
    .select({ n: sql<number>`count(*)::int` })
    .from(planTask)
    .where(and(
      eq(planTask.status, "pending"),
      lt(planTask.createdAt, task.createdAt),
      sql`${planTask.expiresAt} > now()`,
    ));
  return (row?.n ?? 0) + 1;
}

/** Worker 启动时回收遗留 running（进程被杀兜底），避免占用用户并发名额。 */
export async function recoverStaleRunningTasks(): Promise<number> {
  const result = await getDatabase().execute<{ id: string }>(sql`
    UPDATE ${planTask}
    SET status = 'pending', started_at = null
    WHERE status = 'running'
    RETURNING id
  `);
  return result.rows.length;
}
