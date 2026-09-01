import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { randomUUID } from "node:crypto";
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
  try {
    const query = buildAdminSolverTrendQuery(database, trendStartedAt, now, 300);
    const generated = query.toSQL();
    assert.equal(generated.params.includes(300), false);
    assert.match(generated.sql, /\/ 300\) \* 300\)/);
    assert.ok(Array.isArray(await query));
  } finally {
    await pool.end();
  }
});

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
