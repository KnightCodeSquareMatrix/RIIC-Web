import assert from "node:assert/strict";
import test from "node:test";

import {
  chooseDroneAllocations,
  droneProductionForShift,
  droneTradeOutputForEfficiency,
  droneTradeOutputForShift,
  powerEfficiencyForShift,
} from "./drone-production.ts";

test("power efficiency includes one shared base, working-operator bonuses, and station efficiency", () => {
  assert.ok(Math.abs(powerEfficiencyForShift({
    powerStations: [
      { equivalentEfficiency: 0.235, working: true },
      { equivalentEfficiency: 0.2, working: true },
      { equivalentEfficiency: 0.15, working: true },
    ],
  }) - 1.735) < 1e-12);
});

test("twelve hours at 1.735 efficiency produces 208.2 drones and 0.43375 equivalent efficiency", () => {
  const result = droneProductionForShift({
    powerStations: [
      { equivalentEfficiency: 0.235, working: true },
      { equivalentEfficiency: 0.2, working: true },
      { equivalentEfficiency: 0.15, working: true },
    ],
    durationHours: 12,
  });
  assert.equal(result.drones, 208.2);
  assert.ok(Math.abs(result.equivalentEfficiency - 0.43375) < 1e-12);
});

test("trade target conversion supports normal, dantshu, tequila, and closure", () => {
  assert.deepEqual(droneTradeOutputForEfficiency({ kind: "normal", level: 3 }, 0.43375), {
    lmd: 0.43375 * 10_265,
    goldValue: 0,
  });
  assert.deepEqual(droneTradeOutputForEfficiency({ kind: "dantshu", level: 2 }, 0.43375), {
    lmd: 0.43375 * 18_591.55,
    goldValue: 0,
  });
  assert.deepEqual(droneTradeOutputForEfficiency({ kind: "tequila" }, 0.43375), {
    lmd: 0.43375 * 12_739.73,
    goldValue: 0.43375 * 2_328.77,
  });
  assert.deepEqual(droneTradeOutputForEfficiency({ kind: "closure" }, 0.43375), {
    lmd: 0.43375 * 12_000,
    goldValue: 0.43375 * 2_000,
  });
});

test("a complete shift conversion reproduces the stated tequila example", () => {
  const result = droneTradeOutputForShift({
    powerStations: [
      { equivalentEfficiency: 0.235, working: true },
      { equivalentEfficiency: 0.2, working: true },
      { equivalentEfficiency: 0.15, working: true },
    ],
    durationHours: 12,
    target: { kind: "tequila" },
  });
  assert.equal(result.drones, 208.2);
  assert.ok(Math.abs(result.equivalentEfficiency - 0.43375) < 1e-12);
  assert.ok(Math.abs(result.lmd - 5525.86) < 0.1);
  assert.ok(Math.abs(result.goldValue - 1010.1) < 0.1);
});

test("zero or missing equivalent efficiency does not receive the working-station bonus", async () => {
  const { powerStationsFromRotation } = await import("./drone-production.ts");
  const layout = {
    template: "243", drone_cap: 0, scenario: {}, rooms: [
      { id: "power_1", kind: "power_plant" as const, level: 3 },
      { id: "power_2", kind: "power_plant" as const, level: 3 },
    ],
  };
  const shift = {
    index: 0, duration_hours: 12, active_teams: [], resting_team: "", weighted_trade: 0, weighted_manu: 0, weighted_power: 0,
    scores: { trade_score: 0, manu_prod_sum: 0, power_charge_sum: 0, room_lines: [
      { room_id: "power_1", equivalent_efficiency: 0 },
      { room_id: "power_2" },
    ] },
  };
  const plan = { name: "A", rooms: { power: [{ operators: ["Lancet-2"] }, { operators: ["Lancet-2"] }] } };
  const stations = powerStationsFromRotation(layout, shift, plan);
  assert.deepEqual(stations.map(({ working }) => working), [false, false]);
  assert.equal(powerEfficiencyForShift({ powerStations: stations }), 1);
});

test("allocation enumerates shifts, counts special-trade gold, and prefers the closest balance", () => {
  const layout = {
    template: "243", drone_cap: 0, scenario: {}, rooms: [
      { id: "trade_1", kind: "trade_post" as const, level: 3, product: { trade: { order: "gold" as const } } },
      { id: "factory_1", kind: "factory" as const, level: 3, product: { factory: { recipe: "gold" as const } } },
      { id: "power_1", kind: "power_plant" as const, level: 3 },
    ],
  };
  const plans = [0, 1].map((index) => ({
    name: `shift-${index}`,
    rooms: {
      trading: [{ product: "LMD", operators: ["龙舌兰"] }],
      manufacture: [{ product: "Gold", operators: ["砾"] }],
      power: [{ operators: ["雷蛇"] }],
    },
  }));
  const shifts = [0, 1].map((index) => ({
    index, duration_hours: 12, active_teams: [], resting_team: "", weighted_trade: 0, weighted_manu: 0, weighted_power: 0,
    scores: { trade_score: 0, manu_prod_sum: 0, power_charge_sum: 0, room_lines: [
      { room_id: "power_1", equivalent_efficiency: 0.2 },
    ] },
  }));
  const allocations = chooseDroneAllocations({ layout, plans, shifts, dailyProduction: { lmd: 25_000, pure_gold: 20_000 } });
  assert.equal(allocations.length, 2);
  assert.ok(allocations.some(({ target }) => target.product === "gold"));
  assert.ok(allocations.some(({ target }) => target.product === "lmd"));
});

test("153 always accelerates experience and falls back to trade when no experience factory exists", () => {
  const baseRooms = [
    { id: "trade_1", kind: "trade_post" as const, level: 3, product: { trade: { order: "gold" as const } } },
    { id: "power_1", kind: "power_plant" as const, level: 3 },
  ];
  const shift = {
    index: 0, duration_hours: 12, active_teams: [], resting_team: "", weighted_trade: 0, weighted_manu: 0, weighted_power: 0,
    scores: { trade_score: 0, manu_prod_sum: 0, power_charge_sum: 0, room_lines: [{ room_id: "power_1", equivalent_efficiency: 0.2 }] },
  };
  const plan = { name: "A", rooms: { trading: [{ product: "LMD", operators: [] }], power: [{ operators: ["雷蛇"] }] } };
  const [fallback] = chooseDroneAllocations({
    layout: { template: "153", drone_cap: 0, scenario: {}, rooms: baseRooms },
    plans: [plan], shifts: [shift], dailyProduction: { lmd: 0, pure_gold: 0 },
  });
  assert.equal(fallback.target.product, "lmd");
});
