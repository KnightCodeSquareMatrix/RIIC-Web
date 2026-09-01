import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { planTaskCancellationDecision } from "./plan-task-cancellation.ts";

test("pending cancellation clears the task only after server confirmation", () => {
  assert.deepEqual(planTaskCancellationDecision({ cancelled: true, reason: null }), {
    clearTask: true,
    message: null,
  });
});

test("running and unavailable cancellation responses preserve polling", () => {
  const running = planTaskCancellationDecision({ cancelled: false, reason: "running" });
  const unavailable = planTaskCancellationDecision({ cancelled: false, reason: "unavailable" });
  assert.equal(running.clearTask, false);
  assert.match(running.message ?? "", /完成后仍会保留结果/);
  assert.equal(unavailable.clearTask, false);
  assert.match(unavailable.message ?? "", /重新查询/);
});

test("buffered and pending tasks stay visibly queued during continuous polling", async () => {
  const source = await readFile(new URL("./App.tsx", import.meta.url), "utf8");
  assert.match(source, /queued: loading && \([\s\S]*status === "buffered"[\s\S]*status === "pending"[\s\S]*pollStopped/);
});

test("plan task polling backs off before settling on one-minute refreshes", async () => {
  const source = await readFile(new URL("./hooks/use-plan-task.ts", import.meta.url), "utf8");
  assert.match(source, /const BACKOFF_MS = \[2_000, 4_000, 8_000, 16_000, 32_000\]/);
  assert.match(source, /const STEADY_POLL_MS = 60_000/);
  assert.equal(source.match(/attempt < BACKOFF_MS\.length/g)?.length, 2);
});
