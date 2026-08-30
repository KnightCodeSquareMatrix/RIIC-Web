import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";

import { registerProcessCleanup, type ProcessCleanupTarget } from "./process-cleanup.ts";

test("process cleanup releases the Worker without taking over Next.js signal exit codes", () => {
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    const target = new EventEmitter();
    const reasons: string[] = [];
    const unregister = registerProcessCleanup(target as ProcessCleanupTarget, (reason) => reasons.push(reason));

    assert.equal(target.emit(signal), true);
    assert.deepEqual(reasons, [`收到 ${signal}，正在关闭 infra-cli serve。`]);
    assert.equal(target.emit("exit"), true);
    assert.equal(reasons.length, 1, "cleanup must stay idempotent while Next finishes graceful shutdown");

    unregister();
    assert.equal(target.listenerCount("SIGINT"), 0);
    assert.equal(target.listenerCount("SIGTERM"), 0);
    assert.equal(target.listenerCount("exit"), 0);
  }
});

test("process cleanup also releases the Worker on an ordinary process exit", () => {
  const target = new EventEmitter();
  const reasons: string[] = [];
  registerProcessCleanup(target as ProcessCleanupTarget, (reason) => reasons.push(reason));

  assert.equal(target.emit("exit"), true);
  assert.deepEqual(reasons, ["进程退出，正在关闭 infra-cli serve。"]);
});
