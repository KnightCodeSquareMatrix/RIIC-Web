import assert from "node:assert/strict";
import test from "node:test";

import { planToRows } from "./schedule.ts";
import type { BaseBlueprint, MaaPlan, TrainingRoomShift } from "./types.ts";

const layout: BaseBlueprint = {
  template: "243",
  drone_cap: 235,
  scenario: {},
  rooms: [
    { id: "control", kind: "control_center", level: 5 },
    { id: "training_room", kind: "training_room", level: 3 },
  ],
};

const plan: MaaPlan = {
  name: "第一班",
  rooms: {
    control: [{ operators: ["阿米娅"] }],
  },
};

function trainingRow(shift?: TrainingRoomShift) {
  const row = planToRows(plan, undefined, layout, shift).find((candidate) => candidate.group === "training");
  assert.ok(row);
  return row;
}

test("adds two named empty training positions for plans without optional training data", () => {
  const row = trainingRow();
  assert.equal(row.roomId, "training_room");
  assert.equal(row.level, 3);
  assert.equal(row.rule, "不参与 MAA 导出");
  assert.deepEqual(row.positionSlots, [
    { position: "trainee", positionLabel: "训练位" },
    { position: "trainer", positionLabel: "协助位" },
  ]);
  assert.deepEqual(row.operatorSlots, []);
});

test("keeps each training shift independent and preserves an empty leading position", () => {
  const first = trainingRow({ trainee: "能天使", trainer: "德克萨斯" });
  const second = trainingRow({ trainee: null, trainer: "拉普兰德" });

  assert.deepEqual(first.positionSlots?.map((position) => position.slot?.name ?? null), ["能天使", "德克萨斯"]);
  assert.deepEqual(second.positionSlots?.map((position) => position.slot?.name ?? null), [null, "拉普兰德"]);
  assert.deepEqual(second.operatorSlots.map((slot) => slot.name), ["拉普兰德"]);
  assert.equal("training" in plan.rooms, false);
});

test("also adds the training room while only a layout is available", () => {
  const row = planToRows(undefined, undefined, layout).find((candidate) => candidate.group === "training");
  assert.deepEqual(row?.positionSlots?.map((position) => position.positionLabel), ["训练位", "协助位"]);
});
