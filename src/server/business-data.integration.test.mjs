import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { randomUUID } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";
import test from "node:test";

import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";

import { buildAdminSolverTrendQuery } from "./admin-solver-metrics-trend.ts";
import * as schema from "./db/schema.ts";
import {
  decryptOperboxSnapshot,
  encryptOperboxSnapshot,
  encryptPlanTaskPayload,
} from "./workspace-crypto.ts";

const databaseUrl = process.env.AUTH_INTEGRATION_DATABASE_URL?.trim();
if (!databaseUrl) throw new Error("AUTH_INTEGRATION_DATABASE_URL is required for the business-data integration test.");

test("admin solver metrics trend query preserves PostgreSQL grouping identity", async () => {
  const pool = new Pool({ connectionString: databaseUrl, max: 2 });
  const database = drizzle({ client: pool, schema });
  const now = new Date();
  const trendStartedAt = new Date(now.getTime() - 60 * 60_000);
  const diagnosticId = randomUUID();
  try {
    await pool.query(
      `INSERT INTO app.plan_run
       (diagnostic_id,source_type,status,layout_template,room_count,operator_count,rotation,fiammetta_enable,created_at,expires_at)
       VALUES ($1,'sample','success','243',1,1,'abc',false,$2,now()+interval '1 day')`,
      [diagnosticId, now],
    );
    const query = buildAdminSolverTrendQuery(database, trendStartedAt, now, 300);
    const generated = query.toSQL();
    assert.equal(generated.params.includes(300), false);
    assert.match(generated.sql, /\/ 300\) \* 300\)/);
    const rows = await query;
    assert.ok(rows.length > 0);
    assert.ok(rows.every((row) => row.bucketStartedAt instanceof Date));
  } finally {
    await pool.query("DELETE FROM app.plan_run WHERE diagnostic_id=$1", [diagnosticId]).catch(() => undefined);
    await pool.end();
  }
});

const taskMasterKey = Buffer.alloc(32, 13);
const artifactWorkspace = await mkdtemp(path.join(tmpdir(), "arkinfra-artifact-integration-"));
const artifactStorageRoot = path.join(artifactWorkspace, "storage");
const artifactRunsRoot = path.join(artifactStorageRoot, "cli-runs");
process.env.BETA_BUSINESS_DB_ENABLED = "1";
process.env.BETA_STORAGE_DIR = artifactStorageRoot;
process.env.BETA_CLI_RUN_DIR = artifactRunsRoot;
process.env.BETA_FEEDBACK_DIR = path.join(artifactStorageRoot, "feedback");
process.env.WORKSPACE_ACTIVE_KEY_VERSION = "integration";
process.env.WORKSPACE_MASTER_KEYS = JSON.stringify({ integration: `base64:${taskMasterKey.toString("base64")}` });

const {
  cancelPlanTask,
  claimNextPlanTask,
  cleanupExpiredPlanTasks,
  createPlanTask,
  planQueuePosition,
} = await import("./plan-task.ts");
const {
  queryAdminSolverMetrics,
  updatePlanRunArtifactBestEffort,
} = await import("./business-records.ts");
const { getDatabase } = await import("./db/index.ts");
const {
  resumePendingPlanArtifactFinalizations,
  waitForPlanArtifactFinalizers,
} = await import("./infra.ts");

test.after(async () => {
  await getDatabase().$client.end().catch(() => undefined);
  await rm(artifactWorkspace, { recursive: true, force: true });
});

test("online queue indexes are valid and artifact finalization requires an existing run row", async () => {
  const pool = new Pool({ connectionString: databaseUrl, max: 2 });
  const diagnosticId = randomUUID();
  const missingDiagnosticId = randomUUID();
  try {
    const indexes = await pool.query(
      `SELECT pg_class.relname AS name, pg_index.indisvalid AS valid, pg_get_indexdef(pg_index.indexrelid) AS definition
       FROM pg_index
       JOIN pg_class ON pg_class.oid = pg_index.indexrelid
       JOIN pg_namespace ON pg_namespace.oid = pg_class.relnamespace
       WHERE pg_namespace.nspname = 'app'
         AND pg_class.relname = ANY($1::text[])
       ORDER BY pg_class.relname`,
      [[
        "plan_task_account_active_idx",
        "plan_task_active_expires_idx",
        "plan_task_ip_active_idx",
      ]],
    );
    assert.equal(indexes.rows.length, 3);
    assert.ok(indexes.rows.every((row) => row.valid === true));
    assert.match(indexes.rows.find((row) => row.name === "plan_task_active_expires_idx").definition, /\(status, expires_at\)/);

    assert.equal(await updatePlanRunArtifactBestEffort({
      diagnosticId: missingDiagnosticId,
      status: "complete",
    }), "missing");

    await pool.query(
      `INSERT INTO app.plan_run
       (diagnostic_id,source_type,status,layout_template,room_count,operator_count,rotation,fiammetta_enable,artifact_status,created_at,expires_at)
       VALUES ($1,'sample','success','243',1,1,'abc',false,'pending',now(),now()+interval '1 day')`,
      [diagnosticId],
    );
    assert.equal(await updatePlanRunArtifactBestEffort({
      diagnosticId,
      status: "complete",
      artifact: { key: diagnosticId, bytes: 42, sha256: "b".repeat(64) },
    }), "updated");
    const finalized = await pool.query(
      "SELECT artifact_status,artifact_bytes,artifact_sha256,artifact_finalized_at FROM app.plan_run WHERE diagnostic_id=$1",
      [diagnosticId],
    );
    assert.equal(finalized.rows[0].artifact_status, "complete");
    assert.equal(Number(finalized.rows[0].artifact_bytes), 42);
    assert.equal(finalized.rows[0].artifact_sha256, "b".repeat(64));
    assert.ok(finalized.rows[0].artifact_finalized_at instanceof Date);
  } finally {
    await pool.query("DELETE FROM app.plan_run WHERE diagnostic_id=$1", [diagnosticId]).catch(() => undefined);
    await pool.end();
  }
});

test("artifact finalization stays pending across a transient missing run and retries to completion", async () => {
  const pool = new Pool({ connectionString: databaseUrl, max: 2 });
  const diagnosticId = randomUUID();
  const runRoot = path.join(artifactRunsRoot, `pending-${diagnosticId}`);
  const envelopePath = path.join(runRoot, "run-envelope.json");
  const finalizedPath = path.join(runRoot, "artifact-finalized.json");
  await mkdir(runRoot, { recursive: true });
  await writeFile(envelopePath, JSON.stringify({
    version: "plan-run-envelope-v1",
    diagnosticId,
    dataOwnerTag: null,
    result: {
      success: false,
      startedAt: "2026-09-02T00:00:00.000Z",
      runId: diagnosticId,
      error: "fixture",
    },
  }), "utf-8");

  try {
    assert.equal(await resumePendingPlanArtifactFinalizations(), 1);
    assert.equal(await waitForPlanArtifactFinalizers(500), false);
    await assert.rejects(readFile(finalizedPath, "utf-8"), (error) => error?.code === "ENOENT");
    const expanded = JSON.parse(await readFile(path.join(runRoot, "artifact-expanded.json"), "utf-8"));
    const resultMtimeBeforeRetry = (await stat(path.join(runRoot, "result.json"))).mtimeMs;
    assert.equal(expanded.diagnosticId, diagnosticId);

    await pool.query(
      `INSERT INTO app.plan_run
       (diagnostic_id,source_type,status,layout_template,room_count,operator_count,rotation,fiammetta_enable,artifact_status,created_at,expires_at)
       VALUES ($1,'sample','failed','243',1,1,'abc',false,'pending',now(),now()+interval '1 day')`,
      [diagnosticId],
    );

    assert.equal(await waitForPlanArtifactFinalizers(5_000), true);
    assert.equal(JSON.parse(await readFile(finalizedPath, "utf-8")).diagnosticId, diagnosticId);
    assert.equal((await stat(path.join(runRoot, "result.json"))).mtimeMs, resultMtimeBeforeRetry);
    const [artifact] = (await pool.query(
      "SELECT artifact_status,artifact_finalized_at FROM app.plan_run WHERE diagnostic_id=$1",
      [diagnosticId],
    )).rows;
    assert.equal(artifact.artifact_status, "complete");
    assert.ok(artifact.artifact_finalized_at instanceof Date);
  } finally {
    await pool.query("DELETE FROM app.plan_run WHERE diagnostic_id=$1", [diagnosticId]).catch(() => undefined);
    await pool.end();
  }
});

function integrationTaskPayload() {
  const layout = { template: "243", drone_cap: 0, scenario: {}, rooms: [] };
  return {
    layout,
    operbox: [],
    sourceName: null,
    sourceType: "maa",
    rotation: "abc_12_6_6",
    fiammettaEnable: false,
    layoutTemplate: "243",
    roomCount: 0,
    operatorCount: 0,
    dataOwnerTag: null,
    calculationContext: {
      presetLabel: "243",
      layout,
      rotationProfile: "abc_12_6_6",
      fiammettaEnabled: false,
    },
    operboxContentHmac: null,
    operboxHmacKeyVersion: null,
    cacheReferenceUserId: null,
  };
}

async function insertIntegrationUsers(pool, userIds) {
  await pool.query(
    `INSERT INTO "user" (id,name,email,email_verified,created_at,updated_at)
     SELECT id,'Plan task integration',id || '@example.test',true,now(),now()
     FROM unnest($1::text[]) AS ids(id)`,
    [userIds],
  );
}

async function insertBufferedTask(pool, { taskId, userId, requestIpHmac }) {
  const envelope = encryptPlanTaskPayload({
    userId,
    taskId,
    plaintext: JSON.stringify(integrationTaskPayload()),
    activeVersion: "integration",
    masterKey: taskMasterKey,
  });
  await pool.query(
    `INSERT INTO app.plan_task
     (id,user_id,account_class,request_ip_hmac,status,encrypted_payload,payload_iv,wrapped_data_key,wrapped_key_iv,key_version,schema_version,expires_at)
     VALUES ($1,$2,'established',$3,'buffered',$4,$5,$6,$7,$8,$9,now()+interval '1 day')`,
    [
      taskId,
      userId,
      requestIpHmac,
      envelope.encryptedPayload,
      envelope.payloadIv,
      envelope.wrappedDataKey,
      envelope.wrappedKeyIv,
      envelope.keyVersion,
      envelope.schemaVersion,
    ],
  );
}

async function insertActiveTasks(pool, {
  taskIds,
  userIds,
  accountClass,
  status = "pending",
  requestIpHmac = null,
}) {
  await pool.query(
    `INSERT INTO app.plan_task
     (id,user_id,account_class,request_ip_hmac,status,encrypted_payload,payload_iv,wrapped_data_key,wrapped_key_iv,key_version,schema_version,expires_at)
     SELECT task_id,user_id,$3,coalesce($5,md5(task_id)),$4,'AA==','AA==','AA==','AA==','integration',1,now()+interval '1 day'
     FROM unnest($1::text[],$2::text[]) AS rows(task_id,user_id)`,
    [taskIds, userIds, accountClass, status, requestIpHmac],
  );
}

async function insertTerminalTasks(pool, { taskIds, userIds, requestIpHmac = null }) {
  await pool.query(
    `INSERT INTO app.plan_task
     (id,user_id,account_class,request_ip_hmac,status,created_at,finished_at,expires_at)
     SELECT task_id,user_id,'established',coalesce($3,md5(task_id)),'done',now()-interval '1 minute',now(),now()+interval '1 day'
     FROM unnest($1::text[],$2::text[]) AS rows(task_id,user_id)`,
    [taskIds, userIds, requestIpHmac],
  );
}

test("app schema stores only encrypted Box data and cascades account-owned business rows", async () => {
  const pool = new Pool({ connectionString: databaseUrl, max: 2 });
  const userId = randomUUID();
  const snapshotId = randomUUID();
  const planId = randomUUID();
  const feedbackId = randomUUID();
  const telemetryId = randomUUID();
  const cacheKey = "c".repeat(64);
  const operboxContentHmac = "f".repeat(64);
  const key = Buffer.alloc(32, 9);
  const plaintext = '[{"id":"char_secret","name":"测试干员"}]';
  const calculationContext = {
    presetLabel: "243",
    layout: { template: "243", drone_cap: 235, scenario: {}, rooms: [] },
    rotationProfile: "abc_12_6_6",
    fiammettaEnabled: false,
  };
  const envelope = encryptOperboxSnapshot({ userId, snapshotId, plaintext, activeVersion: "v1", masterKey: key });
  try {
    await pool.query('INSERT INTO "user" (id,name,email,email_verified,created_at,updated_at) VALUES ($1,$2,$3,true,now(),now())', [userId, "Business Test", `${userId}@example.test`]);
    await pool.query(
      `INSERT INTO app.operbox_snapshot
       (id,user_id,source_type,content_hmac,encrypted_payload,payload_iv,wrapped_data_key,wrapped_key_iv,key_version,schema_version,expires_at)
       VALUES ($1,$2,'maa',$3,$4,$5,$6,$7,$8,$9,now()+interval '30 days')`,
      [snapshotId, userId, envelope.contentHmac, envelope.encryptedPayload, envelope.payloadIv, envelope.wrappedDataKey, envelope.wrappedKeyIv, envelope.keyVersion, envelope.schemaVersion],
    );
    const stored = await pool.query("SELECT * FROM app.operbox_snapshot WHERE id=$1", [snapshotId]);
    assert.equal(JSON.stringify(stored.rows[0]).includes("char_secret"), false);
    assert.equal(decryptOperboxSnapshot({ userId, snapshotId, envelope, keys: new Map([["v1", key]]) }), plaintext);

    await pool.query(`INSERT INTO app.policy_consent (id,user_id,terms_version,privacy_version,accepted_at) VALUES ($1,$2,'terms','privacy',now())`, [randomUUID(), userId]);
    await pool.query(`INSERT INTO app.saved_plan (id,user_id,diagnostic_id,title,public_result,calculation_context,operbox_content_hmac,operbox_hmac_key_version,pinned,expires_at) VALUES ($1,$2,$3,'test','{}',$4,$5,'v1',false,now()+interval '30 days')`, [planId, userId, randomUUID(), calculationContext, operboxContentHmac]);
    const storedPlan = await pool.query(`SELECT calculation_context,operbox_content_hmac,operbox_hmac_key_version FROM app.saved_plan WHERE id=$1`, [planId]);
    assert.deepEqual(storedPlan.rows[0], {
      calculation_context: calculationContext,
      operbox_content_hmac: operboxContentHmac,
      operbox_hmac_key_version: "v1",
    });
    await pool.query(`INSERT INTO app.user_workspace (user_id,current_revision,state,operbox_snapshot_id,current_saved_plan_id) VALUES ($1,1,'{}',$2,$3)`, [userId, snapshotId, planId]);
    const diagnosticId = randomUUID();
    const publicResultSha256 = "b".repeat(64);
    await pool.query(`INSERT INTO app.plan_run (diagnostic_id,user_id,source_type,status,layout_template,room_count,operator_count,rotation,fiammetta_enable,calculation_context,public_result_sha256,operbox_content_hmac,operbox_hmac_key_version,expires_at) VALUES ($1,$2,'maa','success','243',1,1,'abc',false,$3,$4,$5,'v1',now()+interval '30 days')`, [diagnosticId, userId, calculationContext, publicResultSha256, operboxContentHmac]);
    const storedRun = await pool.query(`SELECT calculation_context,public_result_sha256,operbox_content_hmac,operbox_hmac_key_version FROM app.plan_run WHERE diagnostic_id=$1`, [diagnosticId]);
    assert.deepEqual(storedRun.rows[0], {
      calculation_context: calculationContext,
      public_result_sha256: publicResultSha256,
      operbox_content_hmac: operboxContentHmac,
      operbox_hmac_key_version: "v1",
    });
    await pool.query(`INSERT INTO app.feedback (id,diagnostic_id,plan_run_diagnostic_id,user_id,kind,note,consent_at,expires_at) VALUES ($1,$2,$2,$3,'performance_issue','test',now(),now()+interval '30 days')`, [feedbackId, diagnosticId, userId]);
    await pool.query(`INSERT INTO app.plan_cache (key_hmac,solver_executable_sha256,protocol_version,plan_schema_version,expires_at) VALUES ($1,$2,1,3,now()+interval '1 day')`, [cacheKey, "a".repeat(64)]);
    await pool.query(`INSERT INTO app.plan_cache_reference (id,cache_key_hmac,diagnostic_id,user_id) VALUES ($1,$2,$3,$4)`, [randomUUID(), cacheKey, diagnosticId, userId]);
    await pool.query(
      `INSERT INTO app.telemetry_event (id,session_id,user_id,type,name,expires_at)
       VALUES ($1,$2,$3,'interaction','plan_click',now()+interval '30 days')`,
      [telemetryId, randomUUID(), userId],
    );

    await pool.query("DELETE FROM app.plan_run WHERE diagnostic_id=$1", [diagnosticId]);
    const retainedFeedback = await pool.query(
      "SELECT diagnostic_id, plan_run_diagnostic_id FROM app.feedback WHERE id=$1",
      [feedbackId],
    );
    assert.deepEqual(retainedFeedback.rows[0], {
      diagnostic_id: diagnosticId,
      plan_run_diagnostic_id: null,
    });

    await pool.query('DELETE FROM "user" WHERE id=$1', [userId]);
    const counts = await pool.query(
      `SELECT
       (SELECT count(*)::int FROM app.operbox_snapshot WHERE user_id=$1) snapshots,
       (SELECT count(*)::int FROM app.user_workspace WHERE user_id=$1) workspaces,
       (SELECT count(*)::int FROM app.saved_plan WHERE user_id=$1) plans,
       (SELECT count(*)::int FROM app.plan_run WHERE user_id=$1) runs,
       (SELECT count(*)::int FROM app.feedback WHERE user_id=$1) feedback,
       (SELECT count(*)::int FROM app.plan_cache_reference WHERE user_id=$1) refs,
       (SELECT count(*)::int FROM app.telemetry_event WHERE user_id=$1) telemetry`, [userId],
    );
    assert.deepEqual(counts.rows[0], { snapshots: 0, workspaces: 0, plans: 0, runs: 0, feedback: 0, refs: 0, telemetry: 0 });
  } finally {
    await pool.query("DELETE FROM app.plan_cache WHERE key_hmac=$1", [cacheKey]).catch(() => undefined);
    await pool.query('DELETE FROM "user" WHERE id=$1', [userId]).catch(() => undefined);
    await pool.end();
  }
});

test("database lease grants only one concurrent solver and can be reclaimed after expiry", async () => {
  const pool = new Pool({ connectionString: databaseUrl, max: 4 });
  const key = "d".repeat(64);
  const query = (owner) => pool.query(
    `INSERT INTO app.plan_cache
      (key_hmac,solver_executable_sha256,protocol_version,plan_schema_version,public_result,expires_at,lease_owner,lease_expires_at)
     VALUES ($1,$2,1,3,NULL,now()+interval '1 day',$3,now()+interval '2 minutes')
     ON CONFLICT (key_hmac) DO UPDATE SET lease_owner=excluded.lease_owner,lease_expires_at=excluded.lease_expires_at
     WHERE app.plan_cache.expires_at <= now()
        OR (app.plan_cache.public_result IS NULL AND (app.plan_cache.lease_expires_at IS NULL OR app.plan_cache.lease_expires_at <= now()))
     RETURNING lease_owner`,
    [key, "e".repeat(64), owner],
  );
  try {
    const attempts = await Promise.all([query("one"), query("two")]);
    assert.equal(attempts.reduce((sum, result) => sum + (result.rowCount ?? 0), 0), 1);
    await pool.query("UPDATE app.plan_cache SET lease_expires_at=now()-interval '1 second' WHERE key_hmac=$1", [key]);
    assert.equal((await query("recovered")).rows[0]?.lease_owner, "recovered");
  } finally {
    await pool.query("DELETE FROM app.plan_cache WHERE key_hmac=$1", [key]);
    await pool.end();
  }
});

test("plan tasks persist only encrypted Box payloads and scrub them at terminal state", async () => {
  const pool = new Pool({ connectionString: databaseUrl, max: 2 });
  const userId = randomUUID();
  const taskId = randomUUID();
  const duplicateId = randomUUID();
  const key = Buffer.alloc(32, 11);
  const plaintext = JSON.stringify({ operbox: [{ id: "char_private", name: "隐私干员" }] });
  const envelope = encryptPlanTaskPayload({
    userId,
    taskId,
    plaintext,
    activeVersion: "v1",
    masterKey: key,
  });
  try {
    await pool.query(
      'INSERT INTO "user" (id,name,email,email_verified,created_at,updated_at) VALUES ($1,$2,$3,true,now(),now())',
      [userId, "Task Test", `${userId}@example.test`],
    );
    await pool.query(
      `INSERT INTO app.plan_task
       (id,user_id,account_class,request_ip_hmac,status,encrypted_payload,payload_iv,wrapped_data_key,wrapped_key_iv,key_version,schema_version,expires_at)
       VALUES ($1,$2,'established',$3,'pending',$4,$5,$6,$7,$8,$9,now()+interval '1 day')`,
      [taskId, userId, "a".repeat(64), envelope.encryptedPayload, envelope.payloadIv, envelope.wrappedDataKey, envelope.wrappedKeyIv, envelope.keyVersion, envelope.schemaVersion],
    );
    const stored = await pool.query("SELECT * FROM app.plan_task WHERE id=$1", [taskId]);
    assert.equal(JSON.stringify(stored.rows[0]).includes("char_private"), false);

    await assert.rejects(
      pool.query(
        `INSERT INTO app.plan_task
         (id,user_id,account_class,request_ip_hmac,status,encrypted_payload,payload_iv,wrapped_data_key,wrapped_key_iv,key_version,schema_version,expires_at)
         VALUES ($1,$2,'established',$3,'pending',$4,$5,$6,$7,$8,$9,now()+interval '1 day')`,
        [duplicateId, userId, "b".repeat(64), envelope.encryptedPayload, envelope.payloadIv, envelope.wrappedDataKey, envelope.wrappedKeyIv, envelope.keyVersion, envelope.schemaVersion],
      ),
      (error) => error?.code === "23505",
    );
    await assert.rejects(
      pool.query("UPDATE app.plan_task SET status='done' WHERE id=$1", [taskId]),
      (error) => error?.code === "23514",
    );
    await pool.query(
      `UPDATE app.plan_task SET status='done',finished_at=now(),result='{}',
       encrypted_payload=NULL,payload_iv=NULL,wrapped_data_key=NULL,wrapped_key_iv=NULL,key_version=NULL,schema_version=NULL
       WHERE id=$1`,
      [taskId],
    );
    const terminal = await pool.query(
      "SELECT status,encrypted_payload,payload_iv,wrapped_data_key,wrapped_key_iv,key_version,schema_version FROM app.plan_task WHERE id=$1",
      [taskId],
    );
    assert.deepEqual(terminal.rows[0], {
      status: "done",
      encrypted_payload: null,
      payload_iv: null,
      wrapped_data_key: null,
      wrapped_key_iv: null,
      key_version: null,
      schema_version: null,
    });
  } finally {
    await pool.query('DELETE FROM "user" WHERE id=$1', [userId]).catch(() => undefined);
    await pool.end();
  }
});

test("candidate promotion respects IP capacity, cancellation scrubs payloads, and expired runners release accounts", async () => {
  const pool = new Pool({ connectionString: databaseUrl, max: 4 });
  const blockedIp = "1".repeat(64);
  const blockedUserIds = Array.from({ length: 100 }, () => randomUUID());
  const blockedTaskIds = blockedUserIds.map(() => randomUUID());
  const candidateUserIds = Array.from({ length: 3 }, () => randomUUID());
  const candidateTaskIds = candidateUserIds.map(() => randomUUID());
  const staleUserId = randomUUID();
  const staleTaskId = randomUUID();
  const replacementTaskId = randomUUID();
  const allUserIds = [...blockedUserIds, ...candidateUserIds, staleUserId];

  try {
    await insertIntegrationUsers(pool, allUserIds);
    await pool.query(
      `INSERT INTO app.plan_task
       (id,user_id,account_class,request_ip_hmac,status,encrypted_payload,payload_iv,wrapped_data_key,wrapped_key_iv,key_version,schema_version,started_at,expires_at)
       SELECT task_id,user_id,'established',$3,'running','AA==','AA==','AA==','AA==','integration',1,now(),now()+interval '1 day'
       FROM unnest($1::text[],$2::text[]) AS rows(task_id,user_id)`,
      [blockedTaskIds, blockedUserIds, blockedIp],
    );

    await insertBufferedTask(pool, {
      taskId: candidateTaskIds[0],
      userId: candidateUserIds[0],
      requestIpHmac: blockedIp,
    });
    await insertBufferedTask(pool, {
      taskId: candidateTaskIds[1],
      userId: candidateUserIds[1],
      requestIpHmac: "2".repeat(64),
    });
    await insertBufferedTask(pool, {
      taskId: candidateTaskIds[2],
      userId: candidateUserIds[2],
      requestIpHmac: "3".repeat(64),
    });

    const claimed = await claimNextPlanTask();
    assert.ok(claimed, "one eligible candidate should be promoted and claimed");
    assert.ok(candidateTaskIds.slice(1).includes(claimed.id));
    assert.equal(claimed.status, "running");
    assert.equal(claimed.payload.sourceType, "maa");

    const candidateStatuses = await pool.query(
      "SELECT id,status FROM app.plan_task WHERE id = ANY($1::text[]) ORDER BY id",
      [candidateTaskIds],
    );
    assert.equal(candidateStatuses.rows.find((row) => row.id === candidateTaskIds[0])?.status, "buffered");
    assert.equal(candidateStatuses.rows.filter((row) => row.status === "running").length, 1);
    assert.equal(candidateStatuses.rows.filter((row) => row.status === "buffered").length, 2);

    assert.equal(await cancelPlanTask(candidateTaskIds[0]), "cancelled");
    const cancelled = await pool.query(
      `SELECT status,encrypted_payload,payload_iv,wrapped_data_key,wrapped_key_iv,key_version,schema_version
       FROM app.plan_task WHERE id=$1`,
      [candidateTaskIds[0]],
    );
    assert.deepEqual(cancelled.rows[0], {
      status: "cancelled",
      encrypted_payload: null,
      payload_iv: null,
      wrapped_data_key: null,
      wrapped_key_iv: null,
      key_version: null,
      schema_version: null,
    });

    await pool.query(
      `INSERT INTO app.plan_task
       (id,user_id,account_class,request_ip_hmac,status,encrypted_payload,payload_iv,wrapped_data_key,wrapped_key_iv,key_version,schema_version,started_at,expires_at)
       VALUES ($1,$2,'established',$3,'running','AA==','AA==','AA==','AA==','integration',1,now()-interval '2 days',now()-interval '1 day')`,
      [staleTaskId, staleUserId, "4".repeat(64)],
    );
    await cleanupExpiredPlanTasks(new Date());
    assert.equal((await pool.query("SELECT count(*)::int AS count FROM app.plan_task WHERE id=$1", [staleTaskId])).rows[0].count, 0);

    await pool.query(
      `INSERT INTO app.plan_task
       (id,user_id,account_class,request_ip_hmac,status,encrypted_payload,payload_iv,wrapped_data_key,wrapped_key_iv,key_version,schema_version,expires_at)
       VALUES ($1,$2,'established',$3,'pending','AA==','AA==','AA==','AA==','integration',1,now()+interval '1 day')`,
      [replacementTaskId, staleUserId, "5".repeat(64)],
    );
    assert.equal((await pool.query("SELECT status FROM app.plan_task WHERE id=$1", [replacementTaskId])).rows[0].status, "pending");
  } finally {
    await pool.query('DELETE FROM "user" WHERE id = ANY($1::text[])', [allUserIds]).catch(() => undefined);
    await pool.end();
  }
});

test("database admission serializes hard limits and reports deterministic queue state", async () => {
  const pool = new Pool({ connectionString: databaseUrl, max: 8 });
  const allUserIds = [];
  const addUsers = async (count) => {
    const userIds = Array.from({ length: count }, () => randomUUID());
    allUserIds.push(...userIds);
    await insertIntegrationUsers(pool, userIds);
    return userIds;
  };
  const submit = (userId, accountClass, requestIpHmac = randomUUID().replaceAll("-", "")) => createPlanTask({
    userId,
    accountClass,
    requestIpHmac,
    payload: integrationTaskPayload(),
  });

  try {
    const establishedActiveUsers = await addUsers(999);
    await insertActiveTasks(pool, {
      taskIds: establishedActiveUsers.map(() => randomUUID()),
      userIds: establishedActiveUsers,
      accountClass: "established",
    });
    const establishedSubmitters = await addUsers(2);
    const establishedResults = await Promise.all(establishedSubmitters.map((userId) => submit(userId, "established")));
    assert.deepEqual(establishedResults.map((task) => task.status).sort(), ["buffered", "pending"]);
    await pool.query('DELETE FROM "user" WHERE id = ANY($1::text[])', [[...establishedActiveUsers, ...establishedSubmitters]]);

    const newActiveUsers = await addUsers(599);
    await insertActiveTasks(pool, {
      taskIds: newActiveUsers.map(() => randomUUID()),
      userIds: newActiveUsers,
      accountClass: "new",
    });
    const newSubmitters = await addUsers(2);
    const newResults = await Promise.all(newSubmitters.map((userId) => submit(userId, "new")));
    assert.deepEqual(newResults.map((task) => task.status).sort(), ["buffered", "pending"]);

    const bufferedUsers = await addUsers(1_999);
    await insertActiveTasks(pool, {
      taskIds: bufferedUsers.map(() => randomUUID()),
      userIds: bufferedUsers,
      accountClass: "established",
      status: "buffered",
    });
    const overflowUser = (await addUsers(1))[0];
    await assert.rejects(
      submit(overflowUser, "new"),
      (error) => error?.code === "AIC-PLAN-3008" && error?.retryAfter === 30,
    );

    await pool.query('DELETE FROM "user" WHERE id = ANY($1::text[])', [[...newActiveUsers, ...newSubmitters, ...bufferedUsers, overflowUser]]);

    const accountLimitedUser = (await addUsers(1))[0];
    const accountTerminalIds = Array.from({ length: 10 }, () => randomUUID());
    await insertTerminalTasks(pool, {
      taskIds: accountTerminalIds,
      userIds: accountTerminalIds.map(() => accountLimitedUser),
    });
    await assert.rejects(
      submit(accountLimitedUser, "established"),
      (error) => error?.code === "AIC-PLAN-3006" && error?.retryAfter > 0,
    );

    const ipActiveUsers = await addUsers(101);
    const activeIpHmac = "e".repeat(64);
    await insertActiveTasks(pool, {
      taskIds: ipActiveUsers.slice(0, 100).map(() => randomUUID()),
      userIds: ipActiveUsers.slice(0, 100),
      accountClass: "established",
      requestIpHmac: activeIpHmac,
    });
    await assert.rejects(
      submit(ipActiveUsers[100], "established", activeIpHmac),
      (error) => error?.code === "AIC-PLAN-3007" && error?.retryAfter === 5,
    );

    const ipLimitedUsers = await addUsers(201);
    const sharedIpHmac = "f".repeat(64);
    await insertTerminalTasks(pool, {
      taskIds: ipLimitedUsers.slice(0, 200).map(() => randomUUID()),
      userIds: ipLimitedUsers.slice(0, 200),
      requestIpHmac: sharedIpHmac,
    });
    await assert.rejects(
      submit(ipLimitedUsers[200], "established", sharedIpHmac),
      (error) => error?.code === "AIC-PLAN-3007" && error?.retryAfter > 0,
    );

    await pool.query('DELETE FROM "user" WHERE id = ANY($1::text[])', [[accountLimitedUser, ...ipActiveUsers, ...ipLimitedUsers]]);

    const queueUsers = await addUsers(3);
    const queueIds = ["queue-a", "queue-b", "queue-c"].map((prefix) => `${prefix}-${randomUUID()}`);
    const queueCreatedAt = new Date();
    await pool.query(
      `INSERT INTO app.plan_task
       (id,user_id,account_class,request_ip_hmac,status,encrypted_payload,payload_iv,wrapped_data_key,wrapped_key_iv,key_version,schema_version,created_at,expires_at)
       SELECT task_id,user_id,'established',md5(task_id),'pending','AA==','AA==','AA==','AA==','integration',1,$3,now()+interval '1 day'
       FROM unnest($1::text[],$2::text[]) AS rows(task_id,user_id)`,
      [queueIds, queueUsers, queueCreatedAt],
    );
    assert.equal(await planQueuePosition(queueIds[1]), 2);

    for (const duplicateStatus of ["buffered", "running"]) {
      await assert.rejects(
        insertActiveTasks(pool, {
          taskIds: [randomUUID()],
          userIds: [queueUsers[1]],
          accountClass: "established",
          status: duplicateStatus,
        }),
        (error) => error?.code === "23505",
      );
    }

    const metrics = await queryAdminSolverMetrics();
    assert.ok(metrics.queue.pendingCount >= 3);
  } finally {
    await pool.query('DELETE FROM "user" WHERE id = ANY($1::text[])', [allUserIds]).catch(() => undefined);
    await pool.end();
  }
});
