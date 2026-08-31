import assert from "node:assert/strict";
import test from "node:test";

import { ApiClientError, computePlan } from "./api.ts";
import { formatSolverDiagnostic, solverDiagnosticFor } from "./solver-diagnostic.ts";
import type { BaseBlueprint } from "./types.ts";

test("maps common solver failures to actionable guidance", () => {
  assert.match(solverDiagnosticFor({ code: "AIC-LAYOUT-1201", message: "布局无效", retryable: false }).suggestion, /设施等级/);
  assert.match(solverDiagnosticFor({ code: "AIC-PLAN-3002", message: "请求过于频繁", retryable: true }).title, /请求正在排队/);
  assert.match(solverDiagnosticFor({ code: "AIC-PLAN-3003", message: "超时", retryable: true }).title, /超时/);
});

test("formats a complete copyable diagnostic with request id", () => {
  const text = formatSolverDiagnostic({ code: "AIC-PLAN-3003", message: "计算超时", retryable: true, requestId: "req-123" });
  assert.match(text, /错误码：AIC-PLAN-3003/);
  assert.match(text, /请求编号：req-123/);
  assert.match(text, /建议：/);
});

test("maps a reverse-proxy HTML plan rate limit without inventing a request id", async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => {
    globalThis.fetch = originalFetch;
  });
  globalThis.fetch = async () => new Response("<h1>429 Too Many Requests</h1>", {
    status: 429,
    headers: {
      "Content-Type": "text/html",
      "Retry-After": "120",
    },
  });

  await assert.rejects(
    computePlan({
      layout: { template: "243", rooms: [] } as unknown as BaseBlueprint,
      operbox: [],
      sourceName: null,
      boxSource: "sample",
      rotation: "abc_12_6_6",
    }),
    (error: unknown) => {
      assert.equal(error instanceof ApiClientError, true);
      const apiError = error as ApiClientError;
      assert.equal(apiError.code, "AIC-PLAN-3002");
      assert.equal(apiError.message, "请求过于频繁，请等待 120 秒后重试。");
      assert.equal(apiError.requestId, undefined);
      assert.equal(apiError.retryable, true);
      return true;
    },
  );
});
