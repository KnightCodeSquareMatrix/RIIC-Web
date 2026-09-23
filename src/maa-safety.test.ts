import assert from "node:assert/strict";
import test from "node:test";

import { prepareMaaForExport } from "./maa-safety.ts";
import { planToRows } from "./schedule.ts";
import type { BaseBlueprint, MaaJson } from "./types.ts";

test("MAA execution preference applies to every shift without changing source data", () => {
  const maa: MaaJson = {
    title: "execution",
    plans: [0, 1].map(() => ({
      name: "Shift",
      rooms: {},
      Fiammetta: { enable: true, target: "但书", order: "pre" },
      drones: { enable: true, room: "trading", index: 1, rule: "all", order: "pre" },
    })),
  };
  for (const pre of [false, true]) {
    const exported = prepareMaaForExport(maa, true, false, undefined, pre);
    for (const plan of exported.plans) {
      assert.equal(plan.Fiammetta?.order, pre ? "pre" : "post");
      assert.equal(plan.drones?.order, pre ? "pre" : "post");
    }
  }
  assert.equal(maa.plans[0]!.Fiammetta!.order, "pre");
});

test("prepares MAA export with sort enabled and preserves displayed operator order", () => {
  const maa: MaaJson = {
    title: "test",
    plans: [{
      name: "班次 1",
      rooms: {
        trading: [{
          operators: ["古米", "银灰", "梅"],
          sort: false,
        }],
      },
    }],
  };

  const exported = prepareMaaForExport(maa);
  const room = exported.plans[0]!.rooms.trading![0]!;

  assert.equal(room.sort, true);
  assert.deepEqual(room.operators, ["古米", "银灰", "梅"]);
  assert.equal(maa.plans[0]!.rooms.trading![0]!.sort, false);

  const relaxed = prepareMaaForExport(maa, false);
  assert.equal(relaxed.plans[0]!.rooms.trading![0]!.sort, false);

  const replacementSorted = prepareMaaForExport(maa, false, true);
  assert.equal(replacementSorted.plans[0]!.rooms.trading![0]!.sort, true);
});

test("calculator downloads preserve displayed dorm autofill across every shift", () => {
  const layout: BaseBlueprint = {
    template: "243", drone_cap: 235, scenario: {},
    rooms: [{ id: "dorm_4", kind: "dormitory", level: 1, dorm_beds: 2 }],
  };
  const maa: MaaJson = {
    title: "计算排班",
    plans: [false, undefined].map((autofill, index) => ({
      name: `班次 ${index + 1}`,
      rooms: {
        dormitory: [
          { operators: [], autofill },
          { operators: ["阿米娅", null, { name: "杜林" }, " ", {}], autofill },
          { operators: ["阿米娅", "杜林", "芬", "克洛丝", "米格鲁"], autofill },
          { operators: ["芬", "克洛丝"], autofill },
          { operators: [], autofill, skip: true },
          { operators: ["阿米娅", "杜林", "芬", "克洛丝", "米格鲁"], autofill: true },
          { operators: ["杜林"], autofill, candidates: ["芬"] },
        ],
        trading: [{ operators: ["但书"], autofill: false }],
        meeting: [{ operators: [], autofill: true }],
      },
    })),
  };
  const original = structuredClone(maa);
  const exported = JSON.parse(JSON.stringify(prepareMaaForExport(maa, true, false, layout))) as MaaJson;

  exported.plans.forEach((plan, index) => {
    const displayed = planToRows(maa.plans[index], undefined, layout)
      .filter((row) => row.group === "dormitory");
    assert.deepEqual(plan.rooms.dormitory?.map((room) => room.autofill), plan === exported.plans[0]
      ? [false, false, false, false, false, true, false]
      : [true, true, false, false, false, true, false]);
    assert.deepEqual(plan.rooms.dormitory?.map((room) => room.autofill), displayed.map((row) => row.autofill));
    assert.deepEqual(plan.rooms.dormitory?.map((room) => room.operators), maa.plans[index]!.rooms.dormitory?.map((room) => room.operators));
    assert.deepEqual(plan.rooms.dormitory?.[6]?.candidates, ["芬"]);
    assert.equal(plan.rooms.dormitory?.[4]?.skip, true);
    assert.equal(plan.rooms.trading?.[0]?.autofill, false);
    assert.equal(plan.rooms.meeting?.[0]?.autofill, true);
  });
  assert.deepEqual(maa, original);
});

test("manual downloads preserve explicit dorm autofill settings", () => {
  const maa: MaaJson = {
    title: "手动排班",
    plans: [{
      name: "班次 1",
      rooms: {
        dormitory: [
          { operators: [], autofill: false },
          { operators: ["杜林"], autofill: false },
          { operators: [], autofill: true },
        ],
      },
    }],
  };
  assert.deepEqual(prepareMaaForExport(maa).plans[0]!.rooms.dormitory?.map((room) => room.autofill), [false, false, true]);
});
