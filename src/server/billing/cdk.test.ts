import assert from "node:assert/strict";
import test from "node:test";
import { hashCdk, normalizeCdk, parseAdminCdkInput, randomCdk, validCdk } from "./cdk.ts";

const batchId = "ccdc31bf-3dc0-4d65-9fb9-6b55eabf5678";

test("admin batch accepts 20 codes with 30 points, bounded positive integer amounts only", () => {
  assert.deepEqual(parseAdminCdkInput({ batchId, count: 20, points: 30 }), { batchId, count: 20, points: 30 });
  for (const count of [0, -1, 101, 1.5, "20", NaN, Infinity]) {
    assert.throws(() => parseAdminCdkInput({ batchId, count, points: 30 }));
  }
  for (const points of [0, -30, 100001, 0.5, "30", NaN, Infinity]) {
    assert.throws(() => parseAdminCdkInput({ batchId, count: 20, points }));
  }
  for (const bad of [null, [], {}, { batchId: "invalid", count: 20, points: 30 }]) assert.throws(() => parseAdminCdkInput(bad));
});

test("custom codes normalize case, require matching quantity and reject duplicates", () => {
  assert.deepEqual(parseAdminCdkInput({ batchId, count: 2, points: 30, codes: [" welcome-30 ", "EVENT_002"] }).codes, ["WELCOME-30", "EVENT_002"]);
  for (const codes of [["WELCOME-30"], ["WELCOME-30", "welcome-30"], ["short", "EVENT_002"], [null, "EVENT_002"], ["A".repeat(65), "EVENT_002"], ["bad code", "EVENT_002"]]) {
    assert.throws(() => parseAdminCdkInput({ batchId, count: 2, points: 30, codes }));
  }
});

test("random codes retain legacy redeemability and hashes normalize identically", () => {
  const codes = Array.from({ length: 100 }, randomCdk);
  assert.equal(new Set(codes).size, 100);
  for (const code of codes) {
    assert.match(code, /^RIIC-[A-F0-9]{36}$/);
    assert.equal(validCdk(code), true);
    assert.equal(hashCdk(` ${code.toLowerCase()} `), hashCdk(code));
    assert.match(hashCdk(code), /^[a-f0-9]{64}$/);
  }
  assert.equal(normalizeCdk(" riic-gift_30 "), "RIIC-GIFT_30");
  for (const code of ["", "RIIC-1", "a b c d e", "<script>", "-12345678"]) assert.equal(validCdk(code), false);
});
