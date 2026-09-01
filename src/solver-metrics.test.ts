import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { buildAdminSolverMetricsData } from "./solver-metrics.ts";

test("admin solver metrics calculate rolling errors and active-cache hit rate", () => {
  const metrics = buildAdminSolverMetricsData({
    generatedAt: new Date("2026-09-01T08:00:00.000Z"),
    cacheEnabled: true,
    successCount: 18,
    failureCount: 2,
    cacheHitCount: 8,
    readyCacheEntryCount: 2,
    fillingCacheEntryCount: 1,
  });

  assert.deepEqual(metrics, {
    generatedAt: "2026-09-01T08:00:00.000Z",
    solver: {
      windowMinutes: 15,
      successCount: 18,
      failureCount: 2,
      completedCount: 20,
      errorRate: 0.1,
    },
    cache: {
      enabled: true,
      hitCount: 8,
      missCount: 2,
      lookupCount: 10,
      hitRate: 0.8,
      readyEntryCount: 2,
      fillingEntryCount: 1,
    },
  });
});

test("admin solver metrics report an unavailable rate when there is no denominator", () => {
  const metrics = buildAdminSolverMetricsData({
    generatedAt: new Date("2026-09-01T08:00:00.000Z"),
    cacheEnabled: false,
    successCount: 0,
    failureCount: 0,
    cacheHitCount: 0,
    readyCacheEntryCount: 0,
    fillingCacheEntryCount: 0,
  });

  assert.equal(metrics.solver.errorRate, null);
  assert.equal(metrics.cache.hitRate, null);
  assert.equal(metrics.solver.completedCount, 0);
  assert.equal(metrics.cache.lookupCount, 0);
});

test("admin solver metrics normalize invalid database counts before exposing them", () => {
  const metrics = buildAdminSolverMetricsData({
    generatedAt: new Date("2026-09-01T08:00:00.000Z"),
    cacheEnabled: true,
    successCount: Number.NaN,
    failureCount: -1,
    cacheHitCount: 1.9,
    readyCacheEntryCount: -2,
    fillingCacheEntryCount: Number.POSITIVE_INFINITY,
  });

  assert.equal(metrics.solver.completedCount, 0);
  assert.equal(metrics.cache.hitCount, 1);
  assert.equal(metrics.cache.lookupCount, 1);
  assert.equal(metrics.cache.hitRate, 1);
  assert.equal(metrics.cache.fillingEntryCount, 0);
});

test("admin solver metrics authenticate before querying and disable response caching", async () => {
  const source = await readFile(new URL("./server/admin-solver-metrics-api.ts", import.meta.url), "utf8");
  const authorization = source.indexOf("await requireWebsiteAdmin(request)");
  const query = source.indexOf("await queryAdminSolverMetrics()");

  assert.equal(authorization > 0, true);
  assert.equal(query > authorization, true);
  assert.equal(source.includes('response.headers.set("Cache-Control", "private, no-store, max-age=0")'), true);
  assert.equal(source.match(/noStore\(/g)?.length, 3);
});

test("admin solver metrics polling deduplicates requests and pauses in hidden tabs", async () => {
  const source = await readFile(new URL("./app/admin/users/solver-metrics-client.tsx", import.meta.url), "utf8");

  assert.equal(source.includes("if (requestRef.current) return"), true);
  assert.equal(source.includes('document.visibilityState === "visible"'), true);
  assert.equal(source.includes('document.addEventListener("visibilitychange", refreshWhenVisible)'), true);
  assert.equal(source.includes('cache: "no-store"'), true);
  assert.equal(source.includes("activeRequest?.abort()"), true);
});
