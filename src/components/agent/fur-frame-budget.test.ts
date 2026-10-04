import assert from "node:assert/strict";
import test from "node:test";
import { motionResolutionScale } from "./fur-frame-budget.ts";

test("motion keeps full resolution on fast GPUs and bounds slow GPU sampling", () => {
  assert.equal(motionResolutionScale(8, 1), 1);
  assert.equal(motionResolutionScale(1000, 1), 0.5);
  assert.equal(motionResolutionScale(NaN, 1), 1);
  assert.equal(motionResolutionScale(0, 1), 1);
});

test("cost is normalized to the currently sampled area rather than repeatedly halving", () => {
  const scale = motionResolutionScale(40, 1);
  assert.equal(scale, 0.65);
  assert.equal(motionResolutionScale(40 * scale * scale, scale), scale);
  assert.equal(motionResolutionScale(4, 0.5), 1);
});
