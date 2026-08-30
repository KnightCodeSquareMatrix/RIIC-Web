import assert from "node:assert/strict";
import test from "node:test";

import {
  __resetRequestGuardsForTests,
  acquirePlanSlot,
  assertEmptyBody,
  assertFiammettaEnableCompatible,
  assertPlanCollectionLimits,
  assertSameOrigin,
  enforceRateLimit,
  ERROR_DEFINITIONS,
  failureResponse,
  healthHttpStatus,
  normalizeFiammettaEnable,
  PublicApiError,
  readJsonBody,
  successResponse,
  validateFeedbackRequest,
} from "./api-contract.ts";

test("error catalog keeps the required HTTP status mapping", () => {
  assert.equal(ERROR_DEFINITIONS["AIC-REQ-1001"].status, 400);
  assert.equal(ERROR_DEFINITIONS["AIC-REQ-1002"].status, 413);
  assert.equal(ERROR_DEFINITIONS["AIC-BOX-1101"].status, 422);
  assert.equal(ERROR_DEFINITIONS["AIC-LAYOUT-1201"].status, 422);
  assert.equal(ERROR_DEFINITIONS["AIC-AUTH-2001"].status, 401);
  assert.equal(ERROR_DEFINITIONS["AIC-AUTH-2002"].status, 403);
  assert.equal(ERROR_DEFINITIONS["AIC-AUTH-2003"].status, 503);
  assert.equal(ERROR_DEFINITIONS["AIC-AUTH-2004"].status, 409);
  assert.equal(ERROR_DEFINITIONS["AIC-AUTH-2005"].status, 400);
  assert.equal(ERROR_DEFINITIONS["AIC-AUTH-2006"].status, 409);
  assert.equal(ERROR_DEFINITIONS["AIC-AUTH-2007"].status, 404);
  assert.equal(ERROR_DEFINITIONS["AIC-PLAN-3001"].status, 503);
  assert.equal(ERROR_DEFINITIONS["AIC-PLAN-3002"].status, 429);
  assert.equal(ERROR_DEFINITIONS["AIC-PLAN-3003"].status, 504);
  assert.equal(ERROR_DEFINITIONS["AIC-PLAN-3004"].status, 502);
  assert.equal(ERROR_DEFINITIONS["AIC-FEEDBACK-4001"].status, 422);
  assert.equal(ERROR_DEFINITIONS["AIC-FEEDBACK-4002"].status, 500);
  assert.equal(ERROR_DEFINITIONS["AIC-SYS-5000"].status, 500);
  assert.equal(ERROR_DEFINITIONS["AIC-RATE-6001"].status, 429);
  assert.equal(ERROR_DEFINITIONS["AIC-DATA-8001"].status, 403);
  assert.equal(ERROR_DEFINITIONS["AIC-DATA-8002"].status, 503);
  assert.equal(ERROR_DEFINITIONS["AIC-DATA-8003"].status, 422);
  assert.equal(ERROR_DEFINITIONS["AIC-DATA-8004"].status, 404);
});

test("success and failure responses include the request id", async () => {
  const success = successResponse({ plannerReady: false }, "request-1", 503);
  assert.equal(success.status, 503);
  assert.equal(success.headers.get("X-Request-Id"), "request-1");
  assert.deepEqual(await success.json(), {
    success: true,
    data: { plannerReady: false },
    requestId: "request-1",
  });

  const failure = failureResponse(
    new PublicApiError("AIC-RATE-6001", { retryAfter: 7 }),
    "request-2",
    "/test",
    performance.now()
  );
  assert.equal(failure.status, 429);
  assert.equal(failure.headers.get("X-Request-Id"), "request-2");
  assert.equal(failure.headers.get("Retry-After"), "7");
  const body = await failure.json();
  assert.equal(body.error.requestId, "request-2");
  assert.equal(body.error.code, "AIC-RATE-6001");
});

test("health returns 503 while the planner is unavailable", () => {
  assert.equal(healthHttpStatus(false), 503);
  assert.equal(healthHttpStatus(true), 200);
});

test("readJsonBody rejects malformed and oversized requests", async () => {
  await assert.rejects(
    readJsonBody(new Request("http://localhost/api", { method: "POST", body: "{" }), 128),
    (error: unknown) => error instanceof PublicApiError && error.code === "AIC-REQ-1001"
  );
  await assert.rejects(
    readJsonBody(new Request("http://localhost/api", {
      method: "POST",
      headers: { "content-length": "129" },
      body: "{}",
    }), 128),
    (error: unknown) => error instanceof PublicApiError && error.code === "AIC-REQ-1002"
  );
  await assert.rejects(
    readJsonBody(new Request("http://localhost/api", {
      method: "POST",
      body: "x".repeat(129),
    }), 128),
    (error: unknown) => error instanceof PublicApiError && error.code === "AIC-REQ-1002"
  );
});

test("empty-body actions accept an empty stream while preserving request size limits", async () => {
  await assert.doesNotReject(
    assertEmptyBody(new Request("http://localhost/api", { method: "POST" }), 128)
  );
  await assert.rejects(
    assertEmptyBody(new Request("http://localhost/api", { method: "POST", body: "{}" }), 128),
    (error: unknown) => error instanceof PublicApiError && error.code === "AIC-REQ-1001"
  );
  await assert.rejects(
    assertEmptyBody(new Request("http://localhost/api", { method: "POST", body: "x".repeat(129) }), 128),
    (error: unknown) => error instanceof PublicApiError && error.code === "AIC-REQ-1002"
  );
});

test("same-origin protection rejects a mismatched Origin", () => {
  const previousPublicOrigin = process.env.BETA_PUBLIC_ORIGIN;
  try {
    delete process.env.BETA_PUBLIC_ORIGIN;
    assert.throws(
      () => assertSameOrigin(new Request("https://product.example/api/plan", {
        method: "POST",
        headers: { Origin: "https://attacker.example" },
      })),
      (error: unknown) => error instanceof PublicApiError && error.code === "AIC-AUTH-2002"
    );
    assert.doesNotThrow(() => assertSameOrigin(new Request("https://product.example/api/plan", {
      method: "POST",
      headers: { Origin: "https://product.example" },
    })));
  } finally {
    if (previousPublicOrigin === undefined) delete process.env.BETA_PUBLIC_ORIGIN;
    else process.env.BETA_PUBLIC_ORIGIN = previousPublicOrigin;
  }
});

test("general API origin checks do not inherit the Skland-only public origin", () => {
  const previousPublicOrigin = process.env.BETA_PUBLIC_ORIGIN;
  const previousSklandOrigin = process.env.SKLAND_PUBLIC_ORIGIN;
  try {
    delete process.env.BETA_PUBLIC_ORIGIN;
    process.env.SKLAND_PUBLIC_ORIGIN = "https://skland.example";
    assert.doesNotThrow(() => assertSameOrigin(new Request("http://127.0.0.1:5177/api/plan", {
      method: "POST",
      headers: { Origin: "http://127.0.0.1:5177" },
    })));
  } finally {
    if (previousPublicOrigin === undefined) delete process.env.BETA_PUBLIC_ORIGIN;
    else process.env.BETA_PUBLIC_ORIGIN = previousPublicOrigin;
    if (previousSklandOrigin === undefined) delete process.env.SKLAND_PUBLIC_ORIGIN;
    else process.env.SKLAND_PUBLIC_ORIGIN = previousSklandOrigin;
  }
});

test("same-origin protection uses Host instead of the wildcard listen address", () => {
  const previousPublicOrigin = process.env.BETA_PUBLIC_ORIGIN;
  try {
    delete process.env.BETA_PUBLIC_ORIGIN;
    assert.doesNotThrow(() => assertSameOrigin(new Request("http://0.0.0.0:5177/api/plan", {
      method: "POST",
      headers: {
        Host: "127.0.0.1:5177",
        Origin: "http://127.0.0.1:5177",
      },
    })));
  } finally {
    if (previousPublicOrigin === undefined) delete process.env.BETA_PUBLIC_ORIGIN;
    else process.env.BETA_PUBLIC_ORIGIN = previousPublicOrigin;
  }
});

test("feedback validation separates room and performance feedback while keeping notes minimal", () => {
  const valid = {
    diagnosticId: "diag",
    room: { id: "trade_1", title: "贸易站 1", group: "trading", operators: ["能天使"] },
    note: "站位不符合预期",
    consent: true as const,
  };
  assert.doesNotThrow(() => validateFeedbackRequest(valid));
  assert.doesNotThrow(() => validateFeedbackRequest({
    kind: "performance_issue",
    diagnosticId: "diag",
    note: "运行耗时明显偏长",
    consent: true,
  }));
  assert.throws(
    () => validateFeedbackRequest({ ...valid, consent: false }),
    (error: unknown) => error instanceof PublicApiError && error.code === "AIC-FEEDBACK-4001"
  );
  assert.throws(
    () => validateFeedbackRequest({ ...valid, note: "x".repeat(1001) }),
    (error: unknown) => error instanceof PublicApiError && error.code === "AIC-FEEDBACK-4001"
  );
  assert.throws(
    () => validateFeedbackRequest({ ...valid, kind: "performance_issue" }),
    (error: unknown) => error instanceof PublicApiError && error.code === "AIC-FEEDBACK-4001"
  );
  assert.throws(
    () => validateFeedbackRequest({ kind: "room_issue", diagnosticId: "diag", note: "缺少房间", consent: true }),
    (error: unknown) => error instanceof PublicApiError && error.code === "AIC-FEEDBACK-4001"
  );
  assert.throws(
    () => validateFeedbackRequest({ kind: "future", diagnosticId: "diag", note: "未知类型", consent: true }),
    (error: unknown) => error instanceof PublicApiError && error.code === "AIC-FEEDBACK-4001"
  );
});

test("plan collection limits enforce operators, rooms, and source length", () => {
  assert.doesNotThrow(() => assertPlanCollectionLimits(1000, 64, "x".repeat(80)));
  assert.throws(
    () => assertPlanCollectionLimits(1001, 64, "source"),
    (error: unknown) => error instanceof PublicApiError && error.code === "AIC-BOX-1101"
  );
  assert.throws(
    () => assertPlanCollectionLimits(1, 65, "source"),
    (error: unknown) => error instanceof PublicApiError && error.code === "AIC-LAYOUT-1201"
  );
  assert.throws(
    () => assertPlanCollectionLimits(1, 1, "x".repeat(81)),
    (error: unknown) => error instanceof PublicApiError && error.code === "AIC-BOX-1101"
  );
});

test("fiammetta enable normalizes to true by default and rejects non-boolean values", () => {
  assert.equal(normalizeFiammettaEnable(undefined), true);
  assert.equal(normalizeFiammettaEnable(true), true);
  assert.equal(normalizeFiammettaEnable(false), false);
  assert.throws(
    () => normalizeFiammettaEnable("yes"),
    (error: unknown) => error instanceof PublicApiError && error.code === "AIC-REQ-1001"
  );
});

test("fiammetta enable conflicts with the dedicated Fiammetta rotation", () => {
  assert.doesNotThrow(() => assertFiammettaEnableCompatible(true, "fiammetta_8_8_4_4"));
  assert.doesNotThrow(() => assertFiammettaEnableCompatible(false, "abc_12_6_6"));
  assert.throws(
    () => assertFiammettaEnableCompatible(false, "fiammetta_8_8_4_4"),
    (error: unknown) => error instanceof PublicApiError && error.code === "AIC-REQ-1001"
  );
});

test("rate limiting and plan concurrency return retryable 429 errors", () => {
  const previous = process.env.BETA_RATE_LIMIT_ENABLED;
  process.env.BETA_RATE_LIMIT_ENABLED = "1";
  __resetRequestGuardsForTests();
  try {
    enforceRateLimit("test", "ip", 1, 60_000);
    assert.throws(
      () => enforceRateLimit("test", "ip", 1, 60_000),
      (error: unknown) => error instanceof PublicApiError
        && error.code === "AIC-RATE-6001"
        && Boolean(error.retryAfter)
    );

    const release = acquirePlanSlot("ip");
    assert.throws(
      () => acquirePlanSlot("ip"),
      (error: unknown) => error instanceof PublicApiError && error.code === "AIC-PLAN-3002"
    );
    release();
    assert.doesNotThrow(() => acquirePlanSlot("ip")());
  } finally {
    if (previous === undefined) delete process.env.BETA_RATE_LIMIT_ENABLED;
    else process.env.BETA_RATE_LIMIT_ENABLED = previous;
    __resetRequestGuardsForTests();
  }
});
