import "server-only";

import { hkdfSync, randomUUID } from "node:crypto";

import { and, eq, gt, inArray, lt, sql } from "drizzle-orm";

import { validateLayoutJson } from "@/layout-validation";
import { assertOperbox } from "@/operbox";
import { isRotationProfile } from "@/rotation-settings";
import type { BaseBlueprint, OperBoxEntry, RotationProfile } from "@/types";

import { workspaceMasterKeys } from "./business-config";
import { getDatabase } from "./db";
import { planTask } from "./db/schema";
import {
  decryptOperboxSnapshot,
  encryptOperboxSnapshot,
  type OperboxEnvelope,
} from "./workspace-crypto";

export type PlanTaskStatus = "pending" | "running" | "done" | "failed" | "cancelled";

export type PlanTaskPayload = {
  layout: BaseBlueprint;
  operbox: OperBoxEntry[];
  sourceName: string | null;
  sourceType: "sample" | "maa" | "skland";
  rotation: RotationProfile;
  fiammettaEnable: boolean;
  layoutTemplate: string;
  roomCount: number;
  operatorCount: number;
  dataOwnerTag?: string | null;
  operboxContentHmac?: string | null;
  operboxHmacKeyVersion?: string | null;
};

type StoredPlanTaskPayload =
  | { kind: "encrypted-v1"; envelope: OperboxEnvelope }
  | { kind: "public-sample-v1"; payload: PlanTaskPayload };

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
const PLAN_TASK_STALE_GRACE_MS = 60_000;
const PLAN_TASK_DEFAULT_SOLVER_TIMEOUT_MS = 180_000;
const PLAN_TASK_AUTH_KEY_VERSION = "auth-secret-v1";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function planTaskMasterKeys(): { activeVersion: string; keys: Map<string, Buffer> } {
  const keys = new Map<string, Buffer>();
  let activeVersion: string | null = null;
  const workspaceVersion = process.env.WORKSPACE_ACTIVE_KEY_VERSION?.trim();
  const workspaceKeys = process.env.WORKSPACE_MASTER_KEYS?.trim();
  if (workspaceVersion || workspaceKeys) {
    if (!workspaceVersion || !workspaceKeys) {
      throw new Error("Workspace encryption configuration is incomplete.");
    }
    const workspace = workspaceMasterKeys();
    activeVersion = workspace.activeVersion;
    for (const [version, key] of workspace.keys) keys.set(version, key);
  }

  const authSecret = process.env.BETTER_AUTH_SECRET?.trim();
  if (authSecret && Buffer.byteLength(authSecret, "utf8") >= 32) {
    keys.set(PLAN_TASK_AUTH_KEY_VERSION, Buffer.from(hkdfSync(
      "sha256",
      Buffer.from(authSecret, "utf8"),
      Buffer.alloc(0),
      Buffer.from("aic-plan-task-encryption-v1", "utf8"),
      32,
    )));
    activeVersion ??= PLAN_TASK_AUTH_KEY_VERSION;
  }
  if (!activeVersion) {
    throw new Error("Plan task encryption requires workspace keys or BETTER_AUTH_SECRET.");
  }
  return { activeVersion, keys };
}

function validatedPayload(value: unknown): PlanTaskPayload {
  if (!isRecord(value)) throw new Error("Stored plan task payload is invalid.");
  if (validateLayoutJson(value.layout).length > 0) throw new Error("Stored plan task layout is invalid.");
  if (!Array.isArray(value.operbox)) throw new Error("Stored plan task operbox is invalid.");
  const operbox = assertOperbox(value.operbox);
  if (!isRotationProfile(value.rotation)) throw new Error("Stored plan task rotation is invalid.");
  if (!isRecord(value.layout)) throw new Error("Stored plan task layout is invalid.");
  if (value.sourceType !== "sample" && value.sourceType !== "maa" && value.sourceType !== "skland") {
    throw new Error("Stored plan task source is invalid.");
  }
  if (value.sourceName !== null && typeof value.sourceName !== "string") {
    throw new Error("Stored plan task source name is invalid.");
  }
  if (typeof value.fiammettaEnable !== "boolean") throw new Error("Stored plan task setting is invalid.");
  if (typeof value.layoutTemplate !== "string" || !value.layoutTemplate) {
    throw new Error("Stored plan task layout label is invalid.");
  }
  if (!Number.isInteger(value.roomCount) || value.roomCount !== (value.layout.rooms as unknown[]).length) {
    throw new Error("Stored plan task room count is invalid.");
  }
  if (!Number.isInteger(value.operatorCount) || value.operatorCount !== operbox.length) {
    throw new Error("Stored plan task operator count is invalid.");
  }
  if (value.dataOwnerTag !== undefined && value.dataOwnerTag !== null && typeof value.dataOwnerTag !== "string") {
    throw new Error("Stored plan task owner tag is invalid.");
  }
  if (
    value.operboxContentHmac !== undefined
    && value.operboxContentHmac !== null
    && (typeof value.operboxContentHmac !== "string" || !/^[a-f0-9]{64}$/.test(value.operboxContentHmac))
  ) {
    throw new Error("Stored plan task operbox HMAC is invalid.");
  }
  if (
    value.operboxHmacKeyVersion !== undefined
    && value.operboxHmacKeyVersion !== null
    && typeof value.operboxHmacKeyVersion !== "string"
  ) {
    throw new Error("Stored plan task key version is invalid.");
  }
  return {
    layout: value.layout as unknown as BaseBlueprint,
    operbox,
    sourceName: value.sourceName,
    sourceType: value.sourceType,
    rotation: value.rotation,
    fiammettaEnable: value.fiammettaEnable,
    layoutTemplate: value.layoutTemplate,
    roomCount: value.roomCount as number,
    operatorCount: value.operatorCount as number,
    dataOwnerTag: value.dataOwnerTag as string | null | undefined,
    operboxContentHmac: value.operboxContentHmac as string | null | undefined,
    operboxHmacKeyVersion: value.operboxHmacKeyVersion as string | null | undefined,
  };
}

function storedPayload(id: string, userId: string | null, payload: PlanTaskPayload): StoredPlanTaskPayload {
  if (!userId) return { kind: "public-sample-v1", payload };
  const { activeVersion, keys } = planTaskMasterKeys();
  const masterKey = keys.get(activeVersion);
  if (!masterKey) throw new Error("Active workspace key is unavailable.");
  return {
    kind: "encrypted-v1",
    envelope: encryptOperboxSnapshot({
      userId,
      snapshotId: id,
      plaintext: JSON.stringify(payload),
      activeVersion,
      masterKey,
    }),
  };
}

function restoredPayload(id: string, userId: string | null, value: unknown): PlanTaskPayload {
  if (!isRecord(value)) throw new Error("Stored plan task envelope is invalid.");
  if (value.kind === "public-sample-v1") {
    if (userId) throw new Error("Authenticated plan task payload must be encrypted.");
    return validatedPayload(value.payload);
  }
  if (value.kind !== "encrypted-v1" || !userId || !isRecord(value.envelope)) {
    throw new Error("Stored plan task envelope is invalid.");
  }
  const plaintext = decryptOperboxSnapshot({
    userId,
    snapshotId: id,
    envelope: value.envelope as OperboxEnvelope,
    keys: planTaskMasterKeys().keys,
  });
  return validatedPayload(JSON.parse(plaintext) as unknown);
}

function mapPlanTaskRow(row: typeof planTask.$inferSelect): PlanTaskRow {
  return {
    id: row.id,
    userId: row.userId,
    status: row.status as PlanTaskStatus,
    payload: restoredPayload(row.id, row.userId, row.payload),
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
  const id = randomUUID();
  const row = {
    id,
    userId: input.userId,
    status: "pending" as const,
    payload: storedPayload(id, input.userId, input.payload),
    attempts: 0,
    createdAt: now,
    expiresAt: new Date(now.getTime() + PLAN_TASK_TTL_MS),
  };
  const inserted = await getDatabase().transaction(async (tx) => {
    if (input.userId) {
      await tx.delete(planTask).where(and(
        eq(planTask.userId, input.userId),
        lt(planTask.expiresAt, now),
      ));
    }
    return tx.insert(planTask).values(row).returning();
  });
  return mapPlanTaskRow(inserted[0]);
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
      inArray(planTask.status, ["pending", "running"]),
      gt(planTask.expiresAt, new Date()),
    ))
    .limit(1);
  return Boolean(row);
}

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
  try {
    return await getPlanTask(claimed);
  } catch {
    await completePlanTask(claimed, {
      status: "failed",
      error: "排班任务数据无效，请重新提交。",
    });
    return null;
  }
}

export async function completePlanTask(
  id: string,
  input: { status: "done" | "failed"; result?: unknown; error?: string | null },
  expectedAttempt?: number,
): Promise<boolean> {
  const updated = await getDatabase()
    .update(planTask)
    .set({
      status: input.status,
      result: input.result === undefined ? null : input.result,
      error: input.error ?? null,
      finishedAt: new Date(),
    })
    .where(and(
      eq(planTask.id, id),
      eq(planTask.status, "running"),
      ...(expectedAttempt === undefined ? [] : [eq(planTask.attempts, expectedAttempt)]),
    ))
    .returning({ id: planTask.id });
  return updated.length > 0;
}

export async function isCurrentPlanTaskAttempt(id: string, attempt: number): Promise<boolean> {
  const [row] = await getDatabase()
    .select({ id: planTask.id })
    .from(planTask)
    .where(and(
      eq(planTask.id, id),
      eq(planTask.status, "running"),
      eq(planTask.attempts, attempt),
    ))
    .limit(1);
  return Boolean(row);
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
      gt(planTask.expiresAt, new Date()),
    ));
  return (row?.n ?? 0) + 1;
}

function staleTaskCutoff(now: Date): Date {
  const configured = Number(process.env.BETA_CLI_TIMEOUT_MS || PLAN_TASK_DEFAULT_SOLVER_TIMEOUT_MS);
  const timeoutMs = Number.isFinite(configured) && configured > 0
    ? configured
    : PLAN_TASK_DEFAULT_SOLVER_TIMEOUT_MS;
  return new Date(now.getTime() - timeoutMs - PLAN_TASK_STALE_GRACE_MS);
}

export async function recoverStaleRunningTasks(now = new Date()): Promise<number> {
  const result = await getDatabase().execute<{ id: string }>(sql`
    UPDATE ${planTask}
    SET status = 'pending', started_at = null
    WHERE status = 'running' AND started_at < ${staleTaskCutoff(now)}
    RETURNING id
  `);
  return result.rows.length;
}

export async function deleteExpiredPlanTasks(now = new Date()): Promise<number> {
  const deleted = await getDatabase()
    .delete(planTask)
    .where(lt(planTask.expiresAt, now))
    .returning({ id: planTask.id });
  return deleted.length;
}
