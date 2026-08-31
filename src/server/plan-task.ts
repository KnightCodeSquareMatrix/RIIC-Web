import { createHmac, randomUUID } from "node:crypto";

import { and, count, eq, gt, gte, inArray, lt, ne, or, sql } from "drizzle-orm";

import type { BaseBlueprint, OperBoxEntry, PublicPlanData, SavedPlanCalculationContext } from "@/types";

import {
  MAX_CONCURRENT_AUTHENTICATED_PLAN_ADMISSIONS,
  MAX_CONCURRENT_NEW_ACCOUNT_PLAN_ADMISSIONS,
  MAX_CONCURRENT_PLAN_ACCOUNTS_PER_IP,
  MAX_PLAN_STARTS_PER_ACCOUNT,
  MAX_PLAN_STARTS_PER_IP,
  PLAN_START_WINDOW_MS,
  PublicApiError,
  type PlanAccountAdmissionClass,
} from "./api-contract.ts";
import { workspaceMasterKeys } from "./business-config.ts";
import { getDatabase } from "./db/index.ts";
import { planTask, planWorkerHeartbeat } from "./db/schema.ts";
import {
  decryptPlanTaskPayload,
  encryptPlanTaskPayload,
  type PlanTaskEnvelope,
} from "./workspace-crypto.ts";

export type PlanTaskStatus = "pending" | "running" | "done" | "failed" | "cancelled";

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
  dataOwnerTag: string | null;
  calculationContext: SavedPlanCalculationContext;
  operboxContentHmac: string | null;
  operboxHmacKeyVersion: string | null;
  cacheReferenceUserId: string | null;
};

export type PlanTaskRow = {
  id: string;
  userId: string;
  status: PlanTaskStatus;
  result: PublicPlanData | null;
  error: string | null;
  attempts: number;
  createdAt: Date;
  startedAt: Date | null;
  finishedAt: Date | null;
  expiresAt: Date;
};

export type ClaimedPlanTask = PlanTaskRow & { payload: PlanTaskPayload };

export const PLAN_TASK_TTL_MS = 24 * 60 * 60 * 1000;
export const PLAN_TASK_ETA_PER_TASK_SECONDS = 2;
export const PLAN_TASK_MAX_ATTEMPTS = 3;
export const PLAN_WORKER_HEARTBEAT_MAX_AGE_MS = 20_000;

const ACTIVE_STATUSES: PlanTaskStatus[] = ["pending", "running"];
const WORKER_HEARTBEAT_ID = "plan-worker";

function mapPlanTaskRow(row: typeof planTask.$inferSelect): PlanTaskRow {
  return {
    id: row.id,
    userId: row.userId,
    status: row.status as PlanTaskStatus,
    result: row.result as PublicPlanData | null,
    error: row.error,
    attempts: row.attempts,
    createdAt: row.createdAt,
    startedAt: row.startedAt,
    finishedAt: row.finishedAt,
    expiresAt: row.expiresAt,
  };
}

function encryptedEnvelope(row: typeof planTask.$inferSelect): PlanTaskEnvelope {
  if (
    !row.encryptedPayload
    || !row.payloadIv
    || !row.wrappedDataKey
    || !row.wrappedKeyIv
    || !row.keyVersion
    || row.schemaVersion === null
  ) {
    throw new Error("Active plan task is missing its encrypted payload envelope.");
  }
  return {
    encryptedPayload: row.encryptedPayload,
    payloadIv: row.payloadIv,
    wrappedDataKey: row.wrappedDataKey,
    wrappedKeyIv: row.wrappedKeyIv,
    keyVersion: row.keyVersion,
    schemaVersion: row.schemaVersion,
  };
}

function parsePlanTaskPayload(value: string): PlanTaskPayload {
  const parsed = JSON.parse(value) as Partial<PlanTaskPayload> | null;
  if (
    !parsed
    || typeof parsed !== "object"
    || !parsed.layout
    || typeof parsed.layout !== "object"
    || !Array.isArray(parsed.operbox)
    || !parsed.calculationContext
    || typeof parsed.calculationContext !== "object"
    || !["sample", "maa", "skland"].includes(parsed.sourceType ?? "")
    || typeof parsed.rotation !== "string"
    || typeof parsed.fiammettaEnable !== "boolean"
    || typeof parsed.layoutTemplate !== "string"
    || typeof parsed.roomCount !== "number"
    || typeof parsed.operatorCount !== "number"
  ) {
    throw new Error("Plan task payload does not match the supported schema.");
  }
  return parsed as PlanTaskPayload;
}

function clearedPayloadColumns() {
  return {
    encryptedPayload: null,
    payloadIv: null,
    wrappedDataKey: null,
    wrappedKeyIv: null,
    keyVersion: null,
    schemaVersion: null,
  };
}

function expiredAtOrBefore(now: Date) {
  return sql`${planTask.expiresAt} <= ${now}`;
}

export function planTaskIpHmac(ip: string, key: Buffer): string {
  return createHmac("sha256", key)
    .update("arknights-infra-plan-task-ip-v1\0", "utf8")
    .update(ip, "utf8")
    .digest("hex");
}

export async function createPlanTask(input: {
  userId: string;
  accountClass: PlanAccountAdmissionClass;
  requestIpHmac: string;
  payload: PlanTaskPayload;
}): Promise<PlanTaskRow> {
  const now = new Date();
  const taskId = randomUUID();
  const { activeVersion, keys } = workspaceMasterKeys();
  const activeKey = keys.get(activeVersion);
  if (!activeKey) throw new Error("Active workspace key is unavailable.");
  const envelope = encryptPlanTaskPayload({
    userId: input.userId,
    taskId,
    plaintext: JSON.stringify(input.payload),
    activeVersion,
    masterKey: activeKey,
  });
  const expiresAt = new Date(now.getTime() + PLAN_TASK_TTL_MS);
  const startsSince = new Date(now.getTime() - PLAN_START_WINDOW_MS);

  return getDatabase().transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('plan-task-admission-v1'))`);
    await tx.delete(planTask).where(and(expiredAtOrBefore(now), ne(planTask.status, "running")));

    const active = and(inArray(planTask.status, ACTIVE_STATUSES), gt(planTask.expiresAt, now));
    const [globalCount] = await tx.select({ value: count() }).from(planTask).where(active);
    const [newAccountCount] = await tx.select({ value: count() }).from(planTask)
      .where(and(active, eq(planTask.accountClass, "new")));
    const [ipCount] = await tx.select({ value: count() }).from(planTask)
      .where(and(active, eq(planTask.requestIpHmac, input.requestIpHmac)));
    const [accountStarts] = await tx.select({ value: count() }).from(planTask).where(and(
      eq(planTask.userId, input.userId),
      gte(planTask.createdAt, startsSince),
    ));
    const [ipStarts] = await tx.select({ value: count() }).from(planTask).where(and(
      eq(planTask.requestIpHmac, input.requestIpHmac),
      gte(planTask.createdAt, startsSince),
    ));

    if (
      (globalCount?.value ?? 0) >= MAX_CONCURRENT_AUTHENTICATED_PLAN_ADMISSIONS
      || (input.accountClass === "new" && (newAccountCount?.value ?? 0) >= MAX_CONCURRENT_NEW_ACCOUNT_PLAN_ADMISSIONS)
      || (ipCount?.value ?? 0) >= MAX_CONCURRENT_PLAN_ACCOUNTS_PER_IP
      || (accountStarts?.value ?? 0) >= MAX_PLAN_STARTS_PER_ACCOUNT
      || (ipStarts?.value ?? 0) >= MAX_PLAN_STARTS_PER_IP
    ) {
      throw new PublicApiError("AIC-PLAN-3002", { retryAfter: 5 });
    }

    const [inserted] = await tx.insert(planTask).values({
      id: taskId,
      userId: input.userId,
      accountClass: input.accountClass,
      requestIpHmac: input.requestIpHmac,
      status: "pending",
      ...envelope,
      attempts: 0,
      createdAt: now,
      expiresAt,
    }).returning();
    if (!inserted) throw new Error("Plan task insert did not return a row.");
    return mapPlanTaskRow(inserted);
  });
}

export async function getPlanTask(id: string): Promise<PlanTaskRow | null> {
  const [row] = await getDatabase().select().from(planTask).where(and(
    eq(planTask.id, id),
    gt(planTask.expiresAt, new Date()),
  )).limit(1);
  return row ? mapPlanTaskRow(row) : null;
}

export async function userHasActivePlanTask(userId: string): Promise<boolean> {
  const [row] = await getDatabase()
    .select({ id: planTask.id })
    .from(planTask)
    .where(and(
      eq(planTask.userId, userId),
      inArray(planTask.status, ACTIVE_STATUSES),
      gt(planTask.expiresAt, new Date()),
    ))
    .limit(1);
  return Boolean(row);
}

export async function claimNextPlanTask(): Promise<ClaimedPlanTask | null> {
  const result = await getDatabase().execute<{ id: string }>(sql`
    UPDATE ${planTask}
    SET status = 'running', started_at = now(), attempts = attempts + 1
    WHERE id = (
      SELECT id FROM ${planTask}
      WHERE status = 'pending' AND expires_at > now() AND attempts < ${PLAN_TASK_MAX_ATTEMPTS}
      ORDER BY created_at, id
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    )
    RETURNING id
  `);
  const claimedId = result.rows[0]?.id;
  if (!claimedId) return null;
  const [row] = await getDatabase().select().from(planTask).where(eq(planTask.id, claimedId)).limit(1);
  if (!row) return null;
  try {
    const { keys } = workspaceMasterKeys();
    const plaintext = decryptPlanTaskPayload({
      userId: row.userId,
      taskId: row.id,
      envelope: encryptedEnvelope(row),
      keys,
    });
    return { ...mapPlanTaskRow(row), payload: parsePlanTaskPayload(plaintext) };
  } catch (error) {
    await completePlanTask(row.id, { status: "failed", error: "任务数据无法读取，请重新提交。" });
    console.error(JSON.stringify({
      level: "error",
      event: "plan_task_payload_decrypt_failed",
      taskId: row.id,
      message: error instanceof Error ? error.message : String(error),
    }));
    return null;
  }
}

export async function completePlanTask(
  id: string,
  input: { status: "done" | "failed"; result?: PublicPlanData; error?: string | null },
): Promise<void> {
  await getDatabase()
    .update(planTask)
    .set({
      status: input.status,
      result: input.result ?? null,
      error: input.error?.slice(0, 500) ?? null,
      finishedAt: new Date(),
      ...clearedPayloadColumns(),
    })
    .where(eq(planTask.id, id));
}

export async function cancelPlanTask(id: string): Promise<"cancelled" | "running" | "unavailable"> {
  const updated = await getDatabase()
    .update(planTask)
    .set({ status: "cancelled", finishedAt: new Date(), ...clearedPayloadColumns() })
    .where(and(eq(planTask.id, id), eq(planTask.status, "pending")))
    .returning({ id: planTask.id });
  if (updated.length > 0) return "cancelled";
  const [row] = await getDatabase()
    .select({ status: planTask.status })
    .from(planTask)
    .where(and(eq(planTask.id, id), gt(planTask.expiresAt, new Date())))
    .limit(1);
  if (!row) return "unavailable";
  return row.status === "running" ? "running" : "unavailable";
}

export async function planQueuePosition(id: string): Promise<number> {
  const [task] = await getDatabase()
    .select({ createdAt: planTask.createdAt })
    .from(planTask)
    .where(and(eq(planTask.id, id), gt(planTask.expiresAt, new Date())))
    .limit(1);
  if (!task) return 1;
  const [row] = await getDatabase()
    .select({ value: count() })
    .from(planTask)
    .where(and(
      eq(planTask.status, "pending"),
      lt(planTask.createdAt, task.createdAt),
      gt(planTask.expiresAt, new Date()),
    ));
  return (row?.value ?? 0) + 1;
}

export async function cleanupExpiredPlanTasks(now = new Date()): Promise<number> {
  const deleted = await getDatabase().delete(planTask).where(and(
    expiredAtOrBefore(now),
    ne(planTask.status, "running"),
  )).returning({ id: planTask.id });
  return deleted.length;
}

export async function recoverStaleRunningTasks(now = new Date()): Promise<{ recovered: number; failed: number }> {
  return getDatabase().transaction(async (tx) => {
    const failed = await tx.update(planTask).set({
      status: "failed",
      error: "任务执行中断，请重新提交。",
      finishedAt: now,
      ...clearedPayloadColumns(),
    }).where(and(
      eq(planTask.status, "running"),
      or(expiredAtOrBefore(now), gte(planTask.attempts, PLAN_TASK_MAX_ATTEMPTS)),
    )).returning({ id: planTask.id });
    const recovered = await tx.update(planTask).set({
      status: "pending",
      startedAt: null,
    }).where(and(
      eq(planTask.status, "running"),
      gt(planTask.expiresAt, now),
      lt(planTask.attempts, PLAN_TASK_MAX_ATTEMPTS),
    )).returning({ id: planTask.id });
    return { recovered: recovered.length, failed: failed.length };
  });
}

export async function recordPlanWorkerHeartbeat(input: {
  releaseSha: string;
  startedAt: Date;
  heartbeatAt?: Date;
}): Promise<void> {
  const heartbeatAt = input.heartbeatAt ?? new Date();
  await getDatabase().insert(planWorkerHeartbeat).values({
    id: WORKER_HEARTBEAT_ID,
    releaseSha: input.releaseSha,
    startedAt: input.startedAt,
    heartbeatAt,
  }).onConflictDoUpdate({
    target: planWorkerHeartbeat.id,
    set: { releaseSha: input.releaseSha, startedAt: input.startedAt, heartbeatAt },
  });
}

export async function getPlanWorkerHealth(input: {
  expectedReleaseSha: string;
  now?: Date;
}): Promise<{ ready: boolean; releaseSha: string | null; heartbeatAt: Date | null }> {
  const [row] = await getDatabase().select().from(planWorkerHeartbeat)
    .where(eq(planWorkerHeartbeat.id, WORKER_HEARTBEAT_ID))
    .limit(1);
  const now = input.now ?? new Date();
  const ready = Boolean(
    row
    && /^[0-9a-f]{40}$/.test(input.expectedReleaseSha)
    && row.releaseSha === input.expectedReleaseSha
    && now.getTime() - row.heartbeatAt.getTime() <= PLAN_WORKER_HEARTBEAT_MAX_AGE_MS,
  );
  return { ready, releaseSha: row?.releaseSha ?? null, heartbeatAt: row?.heartbeatAt ?? null };
}
