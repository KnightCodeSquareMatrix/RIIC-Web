import assert from "node:assert/strict";
import test from "node:test";

import {
  sortTrainingCombinations,
  sortTrainingRecommendations,
  trainingAcquisitionLabel,
  trainingCombinationStateLabel,
  trainingConditionStatusLabel,
  trainingLevelText,
  trainingMemberProgressLabel,
  trainingMemberRoleLabel,
  trainingPriorityLabel,
  trainingProductLabel,
  trainingReasonLabel,
  trainingScaleLabel,
} from "./presentation.ts";
import type { TrainingCombination, TrainingRecommendation } from "@/types";

const target = { kind: "explicit" as const, elite: 1, level: 30 };

test("maps every schema v2 wire enum used by the presentation", () => {
  assert.equal(trainingProductLabel("trade"), "贸易");
  assert.equal(trainingProductLabel("general_manufacturing"), "制造");
  assert.equal(trainingProductLabel("originium_shards"), "源石碎片");
  assert.equal(trainingProductLabel(), "综合");
  assert.equal(trainingScaleLabel("system"), "体系组合");
  assert.equal(trainingScaleLabel("small"), "小型组合");
  assert.equal(trainingMemberRoleLabel("core"), "核心");
  assert.equal(trainingMemberRoleLabel("important"), "重要");
  assert.equal(trainingMemberRoleLabel("secondary"), "次级");
  assert.equal(trainingMemberRoleLabel("hanger"), "挂件");
  assert.equal(trainingCombinationStateLabel("needs_review"), "待核对");
  assert.equal(trainingMemberProgressLabel("needs_review"), "待核对");
  assert.equal(trainingReasonLabel("newbie_required"), "新手必需");
  assert.equal(trainingReasonLabel("combination_core"), "组合核心");
  assert.equal(trainingReasonLabel("combination_important"), "组合重要");
  assert.equal(trainingReasonLabel("standalone"), "独立推荐");
  assert.equal(trainingPriorityLabel("automation_must_train"), "自动化必练");
  assert.equal(trainingAcquisitionLabel("public_recruitment"), "公开招募");
  assert.equal(trainingConditionStatusLabel("unknown"), "待确认");
});

test("formats all target kinds without exposing protocol values", () => {
  assert.equal(trainingLevelText({ kind: "explicit", elite: 2 }), "精2");
  assert.equal(trainingLevelText(target), "精1 Lv30");
  assert.equal(trainingLevelText({ kind: "no_requirement" }), "无需额外培养");
  assert.equal(trainingLevelText({ kind: "derive_from_skill_binding" }), "按技能解锁要求");
  assert.equal(trainingLevelText({ kind: "needs_review" }), "目标待核对");
});

test("preserves the server-defined combination and recommendation order", () => {
  const combinations: TrainingCombination[] = [
    {
      id: "complete-first",
      name: "服务端第一项",
      scale: "small",
      state: "complete",
      completed_slots: 1,
      total_slots: 1,
      completion_percent: 100,
      facilities: [],
      members: [],
    },
    {
      id: "missing-second",
      name: "服务端第二项",
      scale: "system",
      state: "missing_core",
      completed_slots: 0,
      total_slots: 2,
      completion_percent: 0,
      facilities: [],
      members: [],
    },
  ];
  const recommendations: TrainingRecommendation[] = [
    {
      operator: "服务端第一名",
      action: "train",
      target,
      priority: "lower_priority_core",
      priority_rank: 90,
      reason: "combination_core",
    },
    {
      operator: "服务端第二名",
      action: "train",
      target,
      priority: "newbie_four_star_elite_one",
      priority_rank: 10,
      reason: "newbie_required",
    },
  ];

  assert.deepEqual(sortTrainingCombinations(combinations).map((item) => item.id), ["complete-first", "missing-second"]);
  assert.deepEqual(sortTrainingRecommendations(recommendations).map((item) => item.operator), ["服务端第一名", "服务端第二名"]);
});
