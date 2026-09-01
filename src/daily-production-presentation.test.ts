import assert from "node:assert/strict";
import test from "node:test";

import { dailyProductionGroups } from "./daily-production-presentation.ts";

test("solver daily production drives the same summary amount and detail row", () => {
  const groups = dailyProductionGroups(null, {
    lmd: 34_254,
    pure_gold: 52_999,
    battle_records: 22_400,
    originium_shards: 48,
    orundum: 360,
  });
  assert.equal(groups.every((group) => group.source === "solver"), true);
  assert.equal(groups[0].primary.amount.value, 22_400);
  assert.deepEqual(groups[0].primary.rows, [["求解器日产量", 22_400, "经验"]]);
  assert.equal(groups[1].primary.amount.value, 34_254);
  assert.deepEqual(groups[1].primary.rows, [["求解器日产量", 34_254, "龙门币"]]);
  assert.equal(groups[2].primary.amount.value, 360);
  assert.deepEqual(groups[2].primary.rows, [["求解器日产量", 360, "合成玉"]]);
  for (const group of groups) {
    for (const product of [group.primary, group.supporting].filter((value) => value !== undefined)) {
      assert.equal(product.rows[0][1], product.amount.value, `${product.id} detail must match its summary`);
    }
  }
});

test("pure gold keeps full precision until the shared display rounding step", () => {
  const groups = dailyProductionGroups(null, {
    lmd: 0,
    pure_gold: 999,
    battle_records: 0,
    originium_shards: 0,
    orundum: 0,
  });
  assert.equal(groups[1].supporting?.amount.value, 1.998);
  assert.deepEqual(groups[1].supporting?.rows, [["求解器日产量", 1.998, "枚"]]);
});

test("solver totals stay authoritative while estimate rows split natural and drone production", () => {
  const groups = dailyProductionGroups({
    experience: { value: 21_000, natural: 15_000, drones: 6_000 },
    lmdOrders: { value: 31_000, natural: 20_000, drones: 11_000, droneTrade: 11_000 },
    gold: { value: 82, natural: 60, drones: 22 },
    shards: { value: 44, natural: 32, drones: 12 },
    orundum: {
      value: 300,
      natural: 240,
      drones: 60,
      manufactureCapacity: 360,
      tradeCapacity: 300,
      manufactureDrones: 120,
      tradeDrones: 60,
      bottleneck: "trade",
    },
  }, {
    lmd: 34_254,
    pure_gold: 52_999,
    battle_records: 22_400,
    originium_shards: 48,
    orundum: 360,
  });

  assert.equal(groups.every((group) => group.source === "solver"), true);
  assert.equal(groups[0].primary.amount.value, 22_400);
  assert.deepEqual(groups[0].primary.rows, [
    ["估算自然制造", 15_000, "经验"],
    ["估算无人机制造", 6_000, "经验"],
  ]);
  assert.equal(groups[0].primary.note, undefined);
  assert.equal(groups[1].primary.amount.value, 34_254);
  assert.equal(groups[1].supporting?.amount.value, 52_999 / 500);
  assert.equal(groups[2].primary.amount.value, 360);
  assert.equal(groups[2].primary.note, "限制环节：合成玉订单");
  assert.equal(groups[2].supporting?.amount.value, 48);
});

test("production presentation stays empty only when neither source is available", () => {
  assert.deepEqual(dailyProductionGroups(null, null), []);
});
