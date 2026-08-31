import assert from "node:assert/strict";
import test from "node:test";

import { planTaskIpHmac } from "./plan-task.ts";

test("plan task IP admission keys are deterministic, secret-bound and never contain the address", () => {
  const firstKey = Buffer.alloc(32, 1);
  const secondKey = Buffer.alloc(32, 2);
  const first = planTaskIpHmac("203.0.113.10", firstKey);
  assert.match(first, /^[a-f0-9]{64}$/);
  assert.equal(first, planTaskIpHmac("203.0.113.10", firstKey));
  assert.notEqual(first, planTaskIpHmac("203.0.113.11", firstKey));
  assert.notEqual(first, planTaskIpHmac("203.0.113.10", secondKey));
  assert.equal(first.includes("203.0.113.10"), false);
});
