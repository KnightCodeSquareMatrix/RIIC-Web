import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { randomUUID } from "node:crypto";
import process from "node:process";
import test from "node:test";

import { Pool } from "pg";

const databaseUrl = process.env.AUTH_INTEGRATION_DATABASE_URL?.trim();
if (!databaseUrl) throw new Error("AUTH_INTEGRATION_DATABASE_URL is required for the plan-task integration test.");

process.env.DATABASE_URL = databaseUrl;
process.env.BETA_CLI_TIMEOUT_MS = "1000";
process.env.WORKSPACE_ACTIVE_KEY_VERSION = "test-v1";
process.env.WORKSPACE_MASTER_KEYS = JSON.stringify({
  "test-v1": `base64:${Buffer.alloc(32, 17).toString("base64")}`,
});

const {
  claimNextPlanTask,
  completePlanTask,
  createPlanTask,
  deleteExpiredPlanTasks,
  getPlanTask,
  isCurrentPlanTaskAttempt,
  recoverStaleRunningTasks,
  userHasActivePlanTask,
} = await import("./plan-task.ts");
const { getDatabase } = await import("./db/index.ts");

const layout = {
  template: "243",
  drone_cap: 235,
  scenario: {},
  rooms: [
    { id: "control", kind: "control_center", level: 5 },
    { id: "power", kind: "power_plant", level: 3 },
  ],
};
const payload = {
  layout,
  operbox: [{
    id: "char_secret",
    name: "测试干员",
    elite: 2,
    level: 90,
    own: true,
    potential: 1,
    rarity: 6,
  }],
  sourceName: "private-box",
  sourceType: "maa",
  rotation: "abc_12_6_6",
  fiammettaEnable: true,
  layoutTemplate: "243",
  roomCount: layout.rooms.length,
  operatorCount: 1,
  dataOwnerTag: "private-owner",
  operboxContentHmac: "f".repeat(64),
  operboxHmacKeyVersion: "test-v1",
};

test("plan tasks encrypt account data, fence stale workers, and release expired admissions", async () => {
  const pool = new Pool({ connectionString: databaseUrl, max: 2 });
  const userId = randomUUID();
  try {
    await pool.query(
      'INSERT INTO "user" (id,name,email,email_verified,created_at,updated_at) VALUES ($1,$2,$3,true,now(),now())',
      [userId, "Plan Task Test", `${userId}@example.test`],
    );

    const first = await createPlanTask({ userId, payload });
    const stored = await pool.query("SELECT payload::text FROM app.plan_task WHERE id=$1", [first.id]);
    assert.match(stored.rows[0].payload, /encrypted-v1/);
    assert.doesNotMatch(stored.rows[0].payload, /char_secret|测试干员|private-box|private-owner/);
    assert.deepEqual((await getPlanTask(first.id))?.payload, payload);
    assert.equal(await userHasActivePlanTask(userId), true);
    await assert.rejects(
      createPlanTask({ userId, payload }),
      (error) => error?.code === "23505",
    );

    const attemptOne = await claimNextPlanTask();
    assert.equal(attemptOne?.id, first.id);
    assert.equal(attemptOne?.attempts, 1);
    assert.equal(await recoverStaleRunningTasks(), 0);
    await pool.query(
      "UPDATE app.plan_task SET started_at=now()-interval '2 minutes' WHERE id=$1",
      [first.id],
    );
    assert.equal(await recoverStaleRunningTasks(), 1);
    const attemptTwo = await claimNextPlanTask();
    assert.equal(attemptTwo?.id, first.id);
    assert.equal(attemptTwo?.attempts, 2);
    assert.equal(await isCurrentPlanTaskAttempt(first.id, 1), false);
    assert.equal(await isCurrentPlanTaskAttempt(first.id, 2), true);
    assert.equal(await completePlanTask(first.id, { status: "done", result: { old: true } }, 1), false);
    assert.equal(await completePlanTask(first.id, { status: "done", result: { ok: true } }, 2), true);
    assert.deepEqual((await getPlanTask(first.id))?.result, { ok: true });
    assert.equal(await userHasActivePlanTask(userId), false);

    delete process.env.WORKSPACE_ACTIVE_KEY_VERSION;
    delete process.env.WORKSPACE_MASTER_KEYS;
    process.env.BETTER_AUTH_SECRET = "plan-task-integration-auth-secret-with-more-than-32-bytes";
    const expired = await createPlanTask({ userId, payload });
    assert.deepEqual((await getPlanTask(expired.id))?.payload, payload);
    await pool.query("UPDATE app.plan_task SET expires_at=now()-interval '1 second' WHERE id=$1", [expired.id]);
    assert.equal(await userHasActivePlanTask(userId), false);
    assert.equal(await deleteExpiredPlanTasks(), 1);

    const cascaded = await createPlanTask({ userId, payload });
    await pool.query('DELETE FROM "user" WHERE id=$1', [userId]);
    assert.equal((await pool.query("SELECT count(*)::int AS count FROM app.plan_task WHERE id=$1", [cascaded.id])).rows[0].count, 0);
  } finally {
    await pool.query('DELETE FROM "user" WHERE id=$1', [userId]).catch(() => undefined);
    await pool.end();
    await getDatabase().$client.end();
  }
});
