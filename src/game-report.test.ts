import test from "node:test";
import assert from "node:assert/strict";

import { gameReportAverage, parseGameReportDays } from "./game-report.ts";

const sample = [
  { experience: 0, goldValue: 54000, lmd: 85500, orundum: 20 },
  { experience: 0, goldValue: 46000, lmd: 63800, orundum: 480 },
  { experience: 0, goldValue: 39000, lmd: 56000, orundum: 360 },
];

test("three integer days are required and daily averages preserve the exact mean", () => {
  const days = parseGameReportDays(sample);
  assert.ok(days);
  assert.deepEqual(gameReportAverage(days), { experience: 0, goldValue: 139000 / 3, lmd: 205300 / 3, orundum: 860 / 3 });
  assert.equal(parseGameReportDays(sample.slice(0, 1)), null);
  assert.equal(parseGameReportDays([{ ...sample[0], lmd: 1.5 }, sample[1], sample[2]]), null);
  assert.equal(parseGameReportDays([{ ...sample[0], lmd: -1 }, sample[1], sample[2]]), null);
  assert.equal(parseGameReportDays(sample, true), null);
  const withOrders = sample.map((day, index) => ({ ...day, orderCount: [43, 33, 24][index]! }));
  assert.deepEqual(gameReportAverage(parseGameReportDays(withOrders, true)!), {
    experience: 0, goldValue: 139000 / 3, lmd: 205300 / 3, orderCount: 100 / 3, orundum: 860 / 3,
  });
  assert.equal(parseGameReportDays([{ ...withOrders[0], orderCount: 1.5 }, withOrders[1], withOrders[2]], true), null);
});
