import assert from "node:assert/strict";
import test from "node:test";

import { formatSolverDiagnostic, solverDiagnosticFor } from "./solver-diagnostic.ts";

test("maps common solver failures to actionable guidance", () => {
  assert.match(solverDiagnosticFor({ code: "AIC-LAYOUT-1201", message: "布局无效", retryable: false }).suggestion, /设施等级/);
  assert.match(solverDiagnosticFor({ code: "AIC-PLAN-3003", message: "超时", retryable: true }).title, /超时/);
});

test("formats a complete copyable diagnostic with request id", () => {
  const text = formatSolverDiagnostic({ code: "AIC-PLAN-3003", message: "计算超时", retryable: true, requestId: "req-123" });
  assert.match(text, /错误码：AIC-PLAN-3003/);
  assert.match(text, /请求编号：req-123/);
  assert.match(text, /建议：/);
});
