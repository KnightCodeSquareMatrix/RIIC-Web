import test from "node:test";
import assert from "node:assert/strict";

import { calculateAgentTokenCost } from "./pricing.ts";

test("DeepSeek V4.1 Flash uses RMB off-peak price and 1.2x service markup", () => {
  const result = calculateAgentTokenCost("deepseek-flash", { inputTokens: 1_000_000, outputTokens: 1_000_000 }, new Date("2026-09-27T00:00:00.000Z"));
  assert.ok(result);
  assert.equal(result.sourceCurrency, "RMB");
  assert.equal(result.providerCostRmbFen, 500);
  assert.equal(result.chargedCostRmbFen, 600);
  assert.equal(result.chargedPoints, 60);
  assert.equal(result.cacheHitRate, 0);
});

test("token cache is an exclusive input bucket", () => {
  const result = calculateAgentTokenCost("deepseek-flash", { inputTokens: 1_000_000, cachedInputTokens: 250_000, outputTokens: 0 }, new Date("2026-09-27T00:00:00.000Z"));
  assert.ok(result);
  assert.equal(result.uncachedInputTokens, 750_000);
  assert.equal(result.cacheHitRate, 0.25);
  assert.equal(result.providerCostRmbFen, 76);
});

test("GLM-5.3-Flash returns RMB settlement values", () => {
  const result = calculateAgentTokenCost("glm-5.3-flash", { inputTokens: 1_000_000, outputTokens: 1_000_000 }, new Date("2026-09-27T00:00:00.000Z"));
  assert.ok(result);
  assert.equal(result.sourceCurrency, "RMB");
  assert.equal(result.providerCostRmbFen, 468);
  assert.equal(result.chargedCostRmbFen, 562);
  assert.equal(result.chargedPoints, 57);
});

test("unknown model is retained as unpriced until a price version is published", () => {
  assert.equal(calculateAgentTokenCost("unknown-model", { inputTokens: 100, outputTokens: 20 }), null);
});
