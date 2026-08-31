import assert from "node:assert/strict";
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
