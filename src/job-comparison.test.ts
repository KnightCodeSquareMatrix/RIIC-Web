import assert from "node:assert/strict";
import test from "node:test";

import { compareMaaWithBox, maaOperatorRequirements } from "./job-comparison.ts";
import type { MaaJson, OperBoxEntry } from "./types.ts";

const maa: MaaJson = {
  title: "对比作业",
  plans: [{ name: "班次 1", rooms: { trading: [{ operators: ["阿米娅", "阿米娅", null] }], manufacture: [{ operators: ["凯尔希"] }] } }],
};
const box: OperBoxEntry[] = [
  { id: "a", name: "阿米娅", own: true, elite: 2, level: 80, potential: 1, rarity: 5 },
  { id: "k", name: "凯尔希", own: false, elite: 2, level: 80, potential: 1, rarity: 6 },
];

test("counts repeated job positions and compares owned Box availability", () => {
  assert.deepEqual(Object.fromEntries(maaOperatorRequirements(maa)), { 阿米娅: 2, 凯尔希: 1 });
  assert.deepEqual(compareMaaWithBox(maa, box), [
    { name: "阿米娅", required: 2, available: 1, missing: 1 },
    { name: "凯尔希", required: 1, available: 0, missing: 1 },
  ]);
});
