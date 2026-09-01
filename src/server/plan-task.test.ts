import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  MAX_BUFFERED_PLAN_TASKS,
  PLAN_TASK_WORKER_CONCURRENCY,
  planTaskAdmissionStatus,
  planTaskBufferIsFull,
  planTaskEtaSeconds,
  planTaskIpHmac,
} from "./plan-task.ts";

test("plan task IP admission keys are deterministic, secret-bound and never contain the address", () => {
  const firstKey = Buffer.alloc(32, 1);
  const secondKey = Buffer.alloc(32, 2);
  const first = planTaskIpHmac("203.0.113.10", firstKey);
  assert.match(first, /^[a-f0-9]{64}$/);
  assert.equal(first, planTaskIpHmac("203.0.113.10", firstKey));
  assert.notEqual(first, planTaskIpHmac("203.0.113.11", firstKey));
  assert.notEqual(first, planTaskIpHmac("203.0.113.10", secondKey));
  assert.equal(first.includes("203.0.113.10"), false);
});

test("plan task admission uses 1000 global slots, 600 new-account slots, and a bounded candidate pool", () => {
  assert.equal(MAX_BUFFERED_PLAN_TASKS, 2_000);
  assert.equal(PLAN_TASK_WORKER_CONCURRENCY, 4);
  assert.equal(planTaskAdmissionStatus({
    activeTotal: 999,
    activeNewAccounts: 600,
    accountClass: "established",
  }), "pending");
  assert.equal(planTaskAdmissionStatus({
    activeTotal: 1_000,
    activeNewAccounts: 0,
    accountClass: "established",
  }), "buffered");
  assert.equal(planTaskAdmissionStatus({
    activeTotal: 599,
    activeNewAccounts: 599,
    accountClass: "new",
  }), "pending");
  assert.equal(planTaskAdmissionStatus({
    activeTotal: 600,
    activeNewAccounts: 600,
    accountClass: "new",
  }), "buffered");
});

test("plan task ETA reflects four solver lanes", () => {
  assert.equal(planTaskEtaSeconds(1), 3);
  assert.equal(planTaskEtaSeconds(4), 3);
  assert.equal(planTaskEtaSeconds(5), 6);
});

test("candidate pool rejects the exact 2000-task boundary", () => {
  assert.equal(planTaskBufferIsFull(1_999), false);
  assert.equal(planTaskBufferIsFull(2_000), true);
  assert.equal(planTaskBufferIsFull(2_001), true);
});

test("candidate promotion is durable and randomly selected", async () => {
  const [source, migration] = await Promise.all([
    readFile(new URL("./plan-task.ts", import.meta.url), "utf8"),
    readFile(new URL("../../drizzle/0010_harsh_the_stranger.sql", import.meta.url), "utf8"),
  ]);
  assert.match(source, /WHERE candidate\.status = 'buffered'[\s\S]*ORDER BY random\(\)/);
  assert.match(source, /pg_advisory_xact_lock/);
  assert.match(source, /active_for_ip\.request_ip_hmac = candidate\.request_ip_hmac/);
  assert.match(source, /MAX_CONCURRENT_PLAN_ACCOUNTS_PER_IP/);
  assert.match(migration, /'buffered', 'pending', 'running'/);
  assert.match(migration, /plan_task_payload_lifecycle_check/);
});

test("expired running tasks release the per-account reservation", async () => {
  const source = await readFile(new URL("./plan-task.ts", import.meta.url), "utf8");
  assert.match(source, /status: "failed",\s+error: "任务已过期，请重新提交。"/);
  assert.match(source, /cleanupExpiredPlanTasks[\s\S]*where\(expiredAtOrBefore\(now\)\)/);
});
