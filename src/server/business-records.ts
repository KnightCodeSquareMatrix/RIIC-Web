import "server-only";

import { randomUUID } from "node:crypto";

import { and, desc, eq, gte, lte, lt, sql, type SQL } from "drizzle-orm";

import { PRIVACY_VERSION, TERMS_VERSION } from "@/legal-policy";
import type { AppErrorCode, FeedbackRequest, SavedPlanCalculationContext, SolverObservation } from "@/types";
import { BUSINESS_DATA_TTL_MS, isBusinessDatabaseEnabled } from "./business-config";
import { getDatabase } from "./db";
import {
  feedback,
  feedbackEvent,
  operboxSnapshot,
  planCache,
  planRun,
  policyConsent,
  savedPlan,
  telemetryEvent,
  userWorkspace,
  workspaceRevision,
} from "./db/schema";
import { toStoredFeedbackIssue } from "./feedback-record";

export type PrivateArtifactDescriptor = {
  key: string;
  bytes: number;
  sha256: string;
};

export type PlanRunSummaryInput = {
  diagnosticId: string;
  userId?: string | null;
  dataOwnerTag?: string | null;
  sourceType: "sample" | "maa" | "skland";
  status: "success" | "failed";
  layoutTemplate: string;
  roomCount: number;
  operatorCount: number;
  rotation: string;
  fiammettaEnable: boolean;
  durationMs?: number | null;
  errorCode?: AppErrorCode | null;
  solver?: SolverObservation | null;
  artifact?: PrivateArtifactDescriptor | null;
  calculationContext?: SavedPlanCalculationContext | null;
  publicResultSha256?: string | null;
  operboxContentHmac?: string | null;
  operboxHmacKeyVersion?: string | null;
  createdAt?: Date;
};

function expiresAt(createdAt: Date): Date {
  return new Date(createdAt.getTime() + BUSINESS_DATA_TTL_MS);
}

function hasSavedPlanBinding(input: PlanRunSummaryInput): boolean {
  return input.status === "success"
    && Boolean(input.userId)
    && Boolean(input.calculationContext)
    && /^[a-f0-9]{64}$/.test(input.publicResultSha256 ?? "")
    && /^[a-f0-9]{64}$/.test(input.operboxContentHmac ?? "")
    && Boolean(input.operboxHmacKeyVersion);
}

function planRunValues(input: PlanRunSummaryInput, allowSavedPlanBinding = true) {
  const createdAt = input.createdAt ?? new Date();
  const includeSavedPlanBinding = allowSavedPlanBinding && hasSavedPlanBinding(input);
  return {
    diagnosticId: input.diagnosticId,
    userId: input.userId ?? null,
    dataOwnerTag: input.dataOwnerTag ?? null,
    sourceType: input.sourceType,
    status: input.status,
    layoutTemplate: input.layoutTemplate.slice(0, 120),
    roomCount: input.roomCount,
    operatorCount: input.operatorCount,
    rotation: input.rotation.slice(0, 80),
    fiammettaEnable: input.fiammettaEnable,
    durationMs: input.durationMs == null ? null : Math.max(0, Math.round(input.durationMs)),
    errorCode: input.errorCode ?? null,
    solverExecutableSha256: input.solver?.solver_executable_sha256 ?? null,
    protocolVersion: input.solver?.protocol_version ?? null,
    planSchemaVersion: input.solver?.plan_schema_version ?? null,
    artifactKey: input.artifact?.key ?? null,
    artifactBytes: input.artifact?.bytes ?? null,
    artifactSha256: input.artifact?.sha256 ?? null,
    calculationContext: includeSavedPlanBinding ? input.calculationContext ?? null : null,
    publicResultSha256: includeSavedPlanBinding ? input.publicResultSha256 ?? null : null,
    operboxContentHmac: includeSavedPlanBinding ? input.operboxContentHmac ?? null : null,
    operboxHmacKeyVersion: includeSavedPlanBinding ? input.operboxHmacKeyVersion ?? null : null,
    createdAt,
    expiresAt: expiresAt(createdAt),
  };
}

export async function recordPlanRunStrict(input: PlanRunSummaryInput): Promise<boolean> {
  const database = getDatabase();
  if (!hasSavedPlanBinding(input) || !input.userId) {
    const inserted = await database
      .insert(planRun)
      .values(planRunValues(input))
      .onConflictDoNothing({ target: planRun.diagnosticId })
      .returning({ diagnosticId: planRun.diagnosticId });
    return inserted.length > 0;
  }
  const userId = input.userId;

  return database.transaction(async (tx) => {
    // Consent revocation takes this same account lock. A solve that finishes after
    // revocation may retain its minimal run summary, but cannot recreate cloud data.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${userId}))`);
    const [consent] = await tx.select({ revokedAt: policyConsent.revokedAt })
      .from(policyConsent)
      .where(and(
        eq(policyConsent.userId, userId),
        eq(policyConsent.termsVersion, TERMS_VERSION),
        eq(policyConsent.privacyVersion, PRIVACY_VERSION),
      ))
      .limit(1);
    const inserted = await tx
      .insert(planRun)
      .values(planRunValues(input, Boolean(consent && !consent.revokedAt)))
      .onConflictDoNothing({ target: planRun.diagnosticId })
      .returning({ diagnosticId: planRun.diagnosticId });
    return inserted.length > 0;
  });
}

export async function recordPlanRunBestEffort(input: PlanRunSummaryInput): Promise<boolean> {
  if (!isBusinessDatabaseEnabled()) return false;
  try {
    await recordPlanRunStrict(input);
    return true;
  } catch {
    console.error(JSON.stringify({
      level: "error",
      event: "plan_run_database_write_failed",
      diagnosticId: input.diagnosticId,
    }));
    return false;
  }
}

export type FeedbackSummaryInput = {
  feedbackId: string;
  savedAt: Date;
  body: FeedbackRequest;
  artifact?: PrivateArtifactDescriptor | null;
};

export async function recordFeedbackStrict(input: FeedbackSummaryInput): Promise<boolean> {
  const issue = toStoredFeedbackIssue(input.body);
  return getDatabase().transaction(async (tx) => {
    const linked = await tx
      .select({ diagnosticId: planRun.diagnosticId, userId: planRun.userId })
      .from(planRun)
      .where(eq(planRun.diagnosticId, input.body.diagnosticId))
      .limit(1);
    const inserted = await tx.insert(feedback).values({
      id: input.feedbackId,
      diagnosticId: input.body.diagnosticId,
      planRunDiagnosticId: linked[0]?.diagnosticId ?? null,
      userId: linked[0]?.userId ?? null,
      kind: input.body.kind ?? "room_issue",
      room: "room" in issue ? issue.room : null,
      note: issue.note,
      consentAt: input.savedAt,
      status: "pending",
      artifactKey: input.artifact?.key ?? null,
      artifactBytes: input.artifact?.bytes ?? null,
      artifactSha256: input.artifact?.sha256 ?? null,
      createdAt: input.savedAt,
      updatedAt: input.savedAt,
      expiresAt: expiresAt(input.savedAt),
    }).onConflictDoNothing({ target: feedback.id }).returning({ id: feedback.id });
    if (inserted.length === 0) return false;
    await tx.insert(feedbackEvent).values({
      id: randomUUID(),
      feedbackId: input.feedbackId,
      status: "pending",
      note: null,
      createdAt: input.savedAt,
    });
    return true;
  });
}

export async function recordFeedbackIfEnabled(input: FeedbackSummaryInput): Promise<void> {
  if (!isBusinessDatabaseEnabled()) return;
  await recordFeedbackStrict(input);
}

export type BusinessRecordQuery = {
  kind: "runs" | "feedback";
  limit?: number;
  offset?: number;
  from?: Date;
  to?: Date;
  status?: string;
  errorCode?: string;
  solverExecutableSha256?: string;
};

export async function queryBusinessRecords(query: BusinessRecordQuery) {
  const requestedLimit = Number(query.limit ?? 50);
  const requestedOffset = Number(query.offset ?? 0);
  const limit = Number.isFinite(requestedLimit) ? Math.max(1, Math.min(100, Math.trunc(requestedLimit))) : 50;
  const offset = Number.isFinite(requestedOffset) ? Math.max(0, Math.trunc(requestedOffset)) : 0;
  if (query.kind === "runs") {
    const conditions: SQL[] = [];
    if (query.from) conditions.push(gte(planRun.createdAt, query.from));
    if (query.to) conditions.push(lte(planRun.createdAt, query.to));
    if (query.status) conditions.push(eq(planRun.status, query.status));
    if (query.errorCode) conditions.push(eq(planRun.errorCode, query.errorCode));
    if (query.solverExecutableSha256) conditions.push(eq(planRun.solverExecutableSha256, query.solverExecutableSha256));
    const where = conditions.length ? and(...conditions) : undefined;
    const [items, total] = await Promise.all([
      getDatabase().select({
        diagnosticId: planRun.diagnosticId,
        sourceType: planRun.sourceType,
        status: planRun.status,
        layoutTemplate: planRun.layoutTemplate,
        roomCount: planRun.roomCount,
        operatorCount: planRun.operatorCount,
        rotation: planRun.rotation,
        fiammettaEnable: planRun.fiammettaEnable,
        durationMs: planRun.durationMs,
        errorCode: planRun.errorCode,
        solverExecutableSha256: planRun.solverExecutableSha256,
        protocolVersion: planRun.protocolVersion,
        planSchemaVersion: planRun.planSchemaVersion,
        artifactKey: planRun.artifactKey,
        artifactBytes: planRun.artifactBytes,
        artifactSha256: planRun.artifactSha256,
        createdAt: planRun.createdAt,
        expiresAt: planRun.expiresAt,
      }).from(planRun).where(where).orderBy(desc(planRun.createdAt)).limit(limit).offset(offset),
      getDatabase().select({ count: sql<number>`count(*)::int` }).from(planRun).where(where),
    ]);
    return { items, total: total[0]?.count ?? 0, limit, offset };
  }

  const conditions: SQL[] = [];
  if (query.from) conditions.push(gte(feedback.createdAt, query.from));
  if (query.to) conditions.push(lte(feedback.createdAt, query.to));
  if (query.status) conditions.push(eq(feedback.status, query.status));
  const where = conditions.length ? and(...conditions) : undefined;
  const [items, total] = await Promise.all([
    getDatabase().select({
      id: feedback.id,
      diagnosticId: feedback.diagnosticId,
      kind: feedback.kind,
      room: feedback.room,
      note: feedback.note,
      consentAt: feedback.consentAt,
      status: feedback.status,
      adminNote: feedback.adminNote,
      artifactKey: feedback.artifactKey,
      artifactBytes: feedback.artifactBytes,
      artifactSha256: feedback.artifactSha256,
      createdAt: feedback.createdAt,
      updatedAt: feedback.updatedAt,
      expiresAt: feedback.expiresAt,
    }).from(feedback).where(where).orderBy(desc(feedback.createdAt)).limit(limit).offset(offset),
    getDatabase().select({ count: sql<number>`count(*)::int` }).from(feedback).where(where),
  ]);
  return { items, total: total[0]?.count ?? 0, limit, offset };
}

export async function updateFeedbackRecord(input: {
  feedbackId: string;
  status: "pending" | "working" | "resolved";
  note: string;
  actorUserId?: string | null;
}) {
  const now = new Date();
  const note = input.note.trim().slice(0, 2000);
  return getDatabase().transaction(async (tx) => {
    const updated = await tx.update(feedback).set({
      status: input.status,
      adminNote: note || null,
      updatedAt: now,
    }).where(eq(feedback.id, input.feedbackId)).returning({ id: feedback.id });
    if (!updated.length) return null;
    await tx.insert(feedbackEvent).values({
      id: randomUUID(),
      feedbackId: input.feedbackId,
      actorUserId: input.actorUserId ?? null,
      status: input.status,
      note: note || null,
      createdAt: now,
    });
    return { status: input.status, note, updatedAt: now.toISOString() };
  });
}

export async function deleteExpiredBusinessRecords(now = new Date()): Promise<void> {
  if (!isBusinessDatabaseEnabled()) return;
  const workspaceCutoff = new Date(now.getTime() - BUSINESS_DATA_TTL_MS);
  await getDatabase().transaction(async (tx) => {
    await tx.delete(feedback).where(lt(feedback.expiresAt, now));
    await tx.delete(planRun).where(lt(planRun.expiresAt, now));
    await tx.delete(planCache).where(lt(planCache.expiresAt, now));
    await tx.delete(workspaceRevision).where(lt(workspaceRevision.expiresAt, now));
    await tx.delete(userWorkspace).where(lt(userWorkspace.syncedAt, workspaceCutoff));
    await tx.delete(savedPlan).where(and(
      eq(savedPlan.pinned, false),
      lt(savedPlan.expiresAt, now),
    ));
    await tx.delete(operboxSnapshot).where(lt(operboxSnapshot.expiresAt, now));
    await tx.delete(telemetryEvent).where(lt(telemetryEvent.expiresAt, now));
  });
}
