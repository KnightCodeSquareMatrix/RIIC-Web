import assert from "node:assert/strict";
import { register } from "node:module";
import test from "node:test";

import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";

register("../../scripts/ts-path-loader.mjs", import.meta.url);

type PollOutcome = {
  taskId: string;
  status: "buffered" | "pending" | "running" | "done" | "failed" | "cancelled";
  queuePosition?: number;
  result?: { diagnosticId: string; durationMs: number };
  error?: string;
} | Error;

test("usePlanTask owns polling timers and resumable storage across terminal and recoverable states", async (context) => {
  const pollOutcomes: PollOutcome[] = [];
  class MockApiClientError extends Error {
    readonly code: string;

    constructor(code: string) {
      super(code);
      this.code = code;
    }
  }
  await context.mock.module(new URL("../api.ts", import.meta.url), {
    namedExports: {
      ApiClientError: MockApiClientError,
      cancelPlanTask: async () => ({ cancelled: true, reason: null }),
      pollPlanTask: async () => {
        const outcome = pollOutcomes.shift();
        if (outcome instanceof Error) throw outcome;
        if (!outcome) throw new Error("missing poll fixture");
        return outcome;
      },
    },
  });

  const storage = new Map<string, string>();
  const localStorageMock = {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => { storage.set(key, value); },
    removeItem: (key: string) => { storage.delete(key); },
  };
  const localStorageDescriptor = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: localStorageMock });
  context.after(() => {
    if (localStorageDescriptor) Object.defineProperty(globalThis, "localStorage", localStorageDescriptor);
    else Reflect.deleteProperty(globalThis, "localStorage");
  });

  let nextTimerId = 1;
  const timeouts = new Map<number, () => void>();
  const intervals = new Map<number, () => void>();
  context.mock.method(globalThis, "setTimeout", ((callback: () => void) => {
    const id = nextTimerId;
    nextTimerId += 1;
    timeouts.set(id, callback);
    return id;
  }) as typeof setTimeout);
  context.mock.method(globalThis, "clearTimeout", ((id: number) => { timeouts.delete(id); }) as typeof clearTimeout);
  context.mock.method(globalThis, "setInterval", ((callback: () => void) => {
    const id = nextTimerId;
    nextTimerId += 1;
    intervals.set(id, callback);
    return id;
  }) as typeof setInterval);
  context.mock.method(globalThis, "clearInterval", ((id: number) => { intervals.delete(id); }) as typeof clearInterval);

  const { usePlanTask } = await import("./use-plan-task.ts");
  const doneResults: unknown[] = [];
  const failureMessages: string[] = [];
  let hookStorageKey: string | null | undefined = undefined;
  let hook: ReturnType<typeof usePlanTask> | null = null;
  function Harness() {
    hook = usePlanTask({
      onDone: (result) => doneResults.push(result),
      onFailed: (message) => failureMessages.push(message),
      ...(hookStorageKey === null ? { storageKey: null } : {}),
    });
    return null;
  }

  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  let renderer!: ReactTestRenderer;
  await act(async () => { renderer = create(React.createElement(Harness)); });
  const current = () => {
    assert.ok(hook);
    return hook;
  };
  const begin = async (taskId: string, outcomes: PollOutcome[]) => {
    pollOutcomes.push(...outcomes);
    await act(async () => { current().begin(taskId); });
  };
  const fireNextPoll = async () => {
    assert.equal(timeouts.size, 1);
    const [id, callback] = [...timeouts.entries()][0];
    timeouts.delete(id);
    await act(async () => { callback(); });
  };

  const result = { diagnosticId: "result-1", durationMs: 1 };
  await begin("task-done", [
    { taskId: "task-done", status: "pending", queuePosition: 3 },
    { taskId: "task-done", status: "running" },
    { taskId: "task-done", status: "done", result },
  ]);
  assert.equal(timeouts.size, 1);
  assert.ok(storage.has("aic-plan-task-v1"));
  await fireNextPoll();
  assert.equal(timeouts.size, 1);
  await fireNextPoll();
  assert.equal(timeouts.size, 0);
  assert.equal(storage.has("aic-plan-task-v1"), false);
  assert.deepEqual(doneResults, [result]);

  pollOutcomes.push({ taskId: "task-awaited", status: "done", result });
  let awaitedResult: unknown;
  await act(async () => {
    awaitedResult = await current().run({ taskId: "task-awaited", status: "pending", queuePosition: 1 });
  });
  assert.equal((awaitedResult as typeof result).diagnosticId, result.diagnosticId);
  assert.deepEqual(doneResults, [result, result]);

  await begin("task-failed", [{ taskId: "task-failed", status: "failed", error: "solver failed" }]);
  assert.equal(storage.has("aic-plan-task-v1"), false);
  assert.equal(timeouts.size, 0);
  assert.deepEqual(failureMessages, ["solver failed"]);

  await begin("task-cancelled", [{ taskId: "task-cancelled", status: "cancelled" }]);
  assert.equal(storage.has("aic-plan-task-v1"), false);
  assert.equal(timeouts.size, 0);
  assert.deepEqual(failureMessages, ["solver failed"]);

  await begin("task-login", [new MockApiClientError("AIC-AUTH-2001")]);
  assert.ok(storage.has("aic-plan-task-v1"));
  assert.equal(timeouts.size, 0);

  await begin("task-retry", [new Error("network")]);
  assert.ok(storage.has("aic-plan-task-v1"));
  assert.equal(timeouts.size, 1);

  await begin("task-stopped", Array.from({ length: 6 }, () => new Error("network")));
  for (let attempt = 0; attempt < 5; attempt += 1) await fireNextPoll();
  assert.ok(storage.has("aic-plan-task-v1"));
  assert.equal(timeouts.size, 0);
  assert.equal(current().pollStopped, true);
  assert.equal(intervals.size, 1);

  await act(async () => { renderer.unmount(); });
  assert.equal(timeouts.size, 0);
  assert.equal(intervals.size, 0);

  storage.clear();
  hook = null;
  await act(async () => { renderer = create(React.createElement(Harness)); });

  await begin("task-invalid", [new MockApiClientError("AIC-AUTH-2002")]);
  assert.equal(storage.has("aic-plan-task-v1"), false);
  assert.equal(timeouts.size, 0);

  await begin("task-unmount", [{ taskId: "task-unmount", status: "pending" }]);
  assert.equal(timeouts.size, 1);
  await act(async () => { renderer.unmount(); });
  assert.equal(timeouts.size, 0);
  assert.equal(intervals.size, 0);

  storage.clear();
  hookStorageKey = null;
  hook = null;
  await act(async () => { renderer = create(React.createElement(Harness)); });
  await begin("task-nonpersistent", [{ taskId: "task-nonpersistent", status: "pending", queuePosition: 2 }]);
  assert.equal(storage.size, 0);
  assert.equal(timeouts.size, 1);
  await act(async () => { renderer.unmount(); });
  assert.equal(timeouts.size, 0);
  delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
});
