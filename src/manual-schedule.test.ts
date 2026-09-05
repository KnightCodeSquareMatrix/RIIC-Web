import assert from "node:assert/strict";
import test from "node:test";

import {
  assignManualOperator,
  createManualScheduleDraft,
  createManualScheduleDraftFromCalculator,
  loadManualScheduleDraft,
  manualScheduleDraftContentEqual,
  manualScheduleToMaa,
  reconcileManualScheduleDraft,
  resizeManualScheduleDraft,
  setManualDormAutofill,
} from "./manual-schedule.ts";
import type { BaseBlueprint, OperBoxEntry } from "./types.ts";

const layout: BaseBlueprint = {
  template: "243",
  drone_cap: 235,
  scenario: {},
  rooms: [
    { id: "control", kind: "control_center", level: 5 },
    { id: "trade_1", kind: "trade_post", level: 3, product: { trade: { order: "gold" } } },
    { id: "manu_1", kind: "factory", level: 3, product: { factory: { recipe: "battle_record" } } },
    { id: "dorm_1", kind: "dormitory", level: 5 },
    { id: "training_room", kind: "training_room", level: 3 },
  ],
};

const box: OperBoxEntry[] = ["菲亚梅塔", "但书", "巫恋"].map((name, index) => ({
  id: String(index), name, own: true, elite: 2, level: 80, potential: 1, rarity: 6,
}));

test("manual draft defaults to independent 12/6/6 shifts and preserves filled shifts when resized", () => {
  const initial = createManualScheduleDraft();
  assert.deepEqual(initial.shifts.map((shift) => shift.durationHours), [12, 6, 6]);
  const assigned = assignManualOperator({
    draft: initial, layout, shiftIndex: 0, roomId: "trade_1", slotIndex: 0, operator: "但书",
  }).draft;
  const resized = resizeManualScheduleDraft(assigned, [12, 12, 12, 4]);
  assert.equal(resized.shifts[0]?.rooms.trade_1?.operators[0], "但书");
  assert.deepEqual(resized.shifts.map((shift) => shift.durationHours), [12, 12, 12, 4]);
});

test("manual assignment reports a same-shift conflict and moves only after confirmation", () => {
  const first = assignManualOperator({
    draft: createManualScheduleDraft(), layout, shiftIndex: 0, roomId: "trade_1", slotIndex: 0, operator: "巫恋",
  }).draft;
  const blocked = assignManualOperator({
    draft: first, layout, shiftIndex: 0, roomId: "manu_1", slotIndex: 1, operator: "巫恋",
  });
  assert.deepEqual(blocked.conflict, { roomId: "trade_1", slotIndex: 0 });
  assert.equal(blocked.draft.shifts[0]?.rooms.manu_1, undefined);

  const moved = assignManualOperator({
    draft: first, layout, shiftIndex: 0, roomId: "manu_1", slotIndex: 1, operator: "巫恋", moveExisting: true,
  }).draft;
  assert.equal(moved.shifts[0]?.rooms.trade_1?.operators[0], null);
  assert.equal(moved.shifts[0]?.rooms.manu_1?.operators[1], "巫恋");
});

test("selecting within one room swaps positions and selecting the current operator is a no-op", () => {
  let draft = reconcileManualScheduleDraft(createManualScheduleDraft([12]), layout, box);
  draft = assignManualOperator({
    draft, layout, shiftIndex: 0, roomId: "trade_1", slotIndex: 0, operator: "但书",
  }).draft;
  draft = assignManualOperator({
    draft, layout, shiftIndex: 0, roomId: "trade_1", slotIndex: 1, operator: "巫恋",
  }).draft;

  const swapped = assignManualOperator({
    draft, layout, shiftIndex: 0, roomId: "trade_1", slotIndex: 1, operator: "但书",
  });
  assert.equal(swapped.conflict, null);
  assert.deepEqual(swapped.draft.shifts[0]?.rooms.trade_1?.operators, ["巫恋", "但书", null]);

  const unchanged = assignManualOperator({
    draft: swapped.draft, layout, shiftIndex: 0, roomId: "trade_1", slotIndex: 1, operator: "但书",
  });
  assert.equal(unchanged.draft, swapped.draft);
  assert.deepEqual(unchanged.draft.shifts[0]?.rooms.trade_1?.operators, ["巫恋", "但书", null]);
});

test("reconcile removes missing rooms and operators no longer owned", () => {
  let draft = createManualScheduleDraft([12]);
  draft = assignManualOperator({ draft, layout, shiftIndex: 0, roomId: "trade_1", slotIndex: 0, operator: "但书" }).draft;
  draft.shifts[0]!.rooms.removed = { operators: ["巫恋"] };
  const reconciled = reconcileManualScheduleDraft(draft, layout, box.filter((entry) => entry.name !== "但书"));
  assert.equal(reconciled.shifts[0]?.rooms.trade_1?.operators[0], null);
  assert.equal(reconciled.shifts[0]?.rooms.removed, undefined);
});

test("dormitories default to autofill and become explicitly empty when cleared", () => {
  const reconciled = reconcileManualScheduleDraft(createManualScheduleDraft([12]), layout, box);
  assert.equal(reconciled.version, 2);
  assert.equal(reconciled.shifts[0]?.rooms.dorm_1?.autofill, true);
  assert.equal(reconciled.shifts[0]?.rooms.dorm_1?.operators.length, 5);

  const cleared = assignManualOperator({
    draft: reconciled,
    layout,
    shiftIndex: 0,
    roomId: "dorm_1",
    slotIndex: 0,
    operator: null,
  }).draft;
  assert.equal(cleared.shifts[0]?.rooms.dorm_1?.autofill, false);
});

test("MAA export keeps arbitrary durations, per-shift Fiammetta targets and dorm autofill", () => {
  let draft = createManualScheduleDraft([12, 12, 12]);
  draft.shifts[0]!.fiammettaTarget = "但书";
  draft = setManualDormAutofill(draft, layout, 0, "dorm_1", true);
  const maa = manualScheduleToMaa(draft, layout, true);
  assert.equal(maa.planTimes, "3班");
  assert.deepEqual(maa.plans.map((plan) => plan.duration), [720, 720, 720]);
  assert.deepEqual(maa.plans[0]?.Fiammetta, { enable: true, target: "但书", order: "pre" });
  assert.deepEqual(maa.plans[1]?.Fiammetta, { enable: false, target: "", order: "pre" });
  assert.equal(maa.plans[0]?.rooms.dormitory?.[0]?.autofill, true);
  assert.deepEqual(maa.plans[0]?.rooms.dormitory?.[0]?.operators, []);
  assert.deepEqual(maa.plans[0]?.rooms.control?.[0], { operators: [], sort: false, skip: false, autofill: false });
  assert.equal(maa.plans[0]?.rooms.trading?.[0]?.product, "LMD");
  assert.equal(maa.plans[0]?.rooms.manufacture?.[0]?.product, "Battle Record");
  assert.equal("training" in (maa.plans[0]?.rooms ?? {}), false);
});

test("calculator results become an editable manual draft with room order, shifts, Fiammetta and training room preserved", () => {
  const draft = createManualScheduleDraftFromCalculator({
    layout,
    maa: {
      title: "求解结果",
      plans: [
        {
          name: "班次 1",
          duration: 600,
          Fiammetta: { enable: true, target: ["但书", "巫恋"], order: "pre" },
          rooms: {
            control: [{ operators: [{ name: "菲亚梅塔", skill: 2 }] }],
            trading: [{ operators: ["但书", null, { name: "巫恋" }] }],
            dormitory: [{ operators: ["菲亚梅塔"], autofill: false }],
          },
        },
        { name: "班次 2", rooms: { manufacture: [{ operators: ["巫恋"] }] } },
      ],
    },
    fallbackDurations: [12, 6],
    fiammettaEnabled: true,
    trainingRoomShifts: [
      { trainee: "巫恋", trainer: "菲亚梅塔" },
      { trainee: null, trainer: "但书" },
    ],
  });

  assert.deepEqual(draft.shifts.map((shift) => shift.durationHours), [12, 6]);
  assert.deepEqual(draft.shifts[0]?.rooms.control?.operators, ["菲亚梅塔", null, null, null, null]);
  assert.deepEqual(draft.shifts[0]?.rooms.trade_1?.operators, ["但书", null, "巫恋"]);
  assert.equal(draft.shifts[0]?.rooms.dorm_1?.autofill, false);
  assert.equal(draft.shifts[0]?.fiammettaTarget, "但书");
  assert.deepEqual(draft.shifts[0]?.rooms.training_room?.operators, ["巫恋", "菲亚梅塔"]);
  assert.deepEqual(draft.shifts[1]?.rooms.manu_1?.operators, ["巫恋", null, null]);
});

test("manual draft source survives reconciliation without affecting content equality", () => {
  const original = createManualScheduleDraft([12, 6]);
  original.source = {
    kind: "calculator",
    variant: "progression-adjusted",
    createdAt: "2026-09-05T00:00:00.000Z",
  };
  const reconciled = reconcileManualScheduleDraft(original, layout, box);
  const sameContent = structuredClone(reconciled);
  sameContent.source = {
    kind: "calculator",
    variant: "baseline",
    createdAt: "2026-09-05T01:00:00.000Z",
  };

  assert.equal(reconciled.source?.variant, "progression-adjusted");
  assert.equal(manualScheduleDraftContentEqual(reconciled, sameContent), true);
  sameContent.shifts[0]!.durationHours = 10;
  assert.equal(manualScheduleDraftContentEqual(reconciled, sameContent), false);
});

test("manual draft loading preserves only valid calculator source metadata", () => {
  const draft = createManualScheduleDraft([12, 6]);
  draft.source = {
    kind: "calculator",
    variant: "progression-adjusted",
    createdAt: "2026-09-05T00:00:00.000Z",
  };
  const storage = {
    getItem: () => JSON.stringify(draft),
    setItem: () => undefined,
  };

  assert.deepEqual(loadManualScheduleDraft(storage)?.source, draft.source);

  const invalidDraft = structuredClone(draft);
  invalidDraft.source.createdAt = "not-a-date";
  assert.equal(loadManualScheduleDraft({
    ...storage,
    getItem: () => JSON.stringify(invalidDraft),
  })?.source, undefined);
});
