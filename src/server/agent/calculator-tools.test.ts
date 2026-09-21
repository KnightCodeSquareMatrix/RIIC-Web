import assert from "node:assert/strict";
import test from "node:test";
import { z } from "zod";
import roster from "../../../fixtures/operbox_full_e2.json" with { type: "json" };
import { buildCalculatorTools, type AgentOperatorPool } from "./calculator-tools.ts";
import { observeMasteryEnvironment } from "./mastery-environment.ts";
import type { SklandStatusSnapshot } from "../../types.ts";
import { calculateMastery } from "../../mastery.ts";
import { calculateRecruitment, RECRUITMENT_TAGS } from "../../recruitment.ts";

function tools(source: AgentOperatorPool["source"] = "sample") {
  return buildCalculatorTools(async () => ({ operbox: roster, source, sourceName: "测试干员池" }), async (_name, _input, run) => {
    try { return await run(); } catch (error) { return { error: (error as Error).message }; }
  });
}
const options = { toolCallId: "test", messages: [], context: {} };

test("snapshot environments reach mastery output and explicit zero overrides automatic counts", async () => {
  const room = (group: string, names: string[]) => ({ group, operators: names.map((name) => ({ id: roster.find((o) => o.name === name)!.id, name })) });
  const snapshot = { operbox: roster, infrastructure: { storeTs: 12345, currentTs: 12350, rooms: [
    room("control", ["阿斯卡纶", "薇薇安娜"]),
    room("dormitory", ["歌蕾蒂娅", "斯卡蒂", "幽灵鲨", "安哲拉", "乌尔比安"]),
    room("manufacture", ["灰毫", "野鬃", "远牙", "砾", "阿罗玛"]),
    room("trading", ["巫恋", "伺夜"]), room("hire", ["斥罪"]),
    room("training", ["歌蕾蒂娅"]), room("processing", ["提丰"]),
  ] } } as unknown as SklandStatusSnapshot;
  const observation = observeMasteryEnvironment(snapshot);
  assert.deepEqual(observation.environment, { sami: 0, abyssal: 5, knights: 5, defence: 0, attack: 0, siracusa: 4 });
  assert.equal(observation.controlBonus, true);
  assert.equal(observation.matches.abyssal.length, 5);
  const tool = buildCalculatorTools(async () => ({ source: "skland", sourceName: "测试快照", operbox: roster, masteryEnvironment: observation }), async (_n, _i, run) => run()).calculate_mastery;
  const result = await tool.execute!({ targetOperator: "结城理", target: 3 }, options);
  assert.ok(result && "settings" in result);
  assert.equal(result.settings.environment.abyssal, 5);
  assert.equal(result.settings.environment.fireworks, 0);
  assert.equal(result.settingsSources.environment.abyssal, "森空岛自动读取");
  assert.equal(result.environmentObservation!.warning, "自动读取状态可能存在误差或延迟，如果环境加成变动，记得跟我说哦。");
  assert.equal(result.environmentObservation!.storeTs, 12345);
  const override = await tool.execute!({ targetOperator: "结城理", target: 3, controlBonus: false, environment: { abyssal: 0 } }, options);
  assert.ok(override && "settings" in override);
  assert.equal(override.settings.controlBonus, false);
  assert.equal(override.settings.environment.abyssal, 0);
  assert.equal(override.settings.environment.knights, 5);
  assert.equal(override.settingsSources.environment.abyssal, "手动指定");
});

test("mastery tool matches webpage calculation and preserves activation instructions", async () => {
  const tool = tools().calculate_mastery;
  const input = { targetOperator: "埃癸斯", target: 3 as const };
  const result = await tool.execute!(input, options);
  assert.ok(result && "simple" in result);
  const target = roster.find((entry) => entry.name === input.targetOperator)!;
  const expected = calculateMastery({ operbox: roster, targetId: target.id, current: 0, target: 3, controlBonus: true, bufferMinutes: 1, environment: {} });
  assert.equal(result.simple.totalSeconds, expected.simple.totalSeconds);
  assert.equal(result.fast.totalSeconds, expected.fast.totalSeconds);
  assert.equal(result.isSample, true);
  assert.equal(result.settings.current, 0);
  assert.equal(result.settings.controlBonus, true);
  assert.equal(result.settings.bufferMinutes, 1);
  assert.ok(Object.values(result.settings.environment).every((value) => value === 0));
  assert.ok(result.simple.instructions.flat().length > 0);
});

test("mastery honors explicit starting level and settings", async () => {
  const result = await tools().calculate_mastery.execute!({ targetOperator: "埃癸斯", current: 2, target: 3, controlBonus: false, bufferMinutes: 2 }, options);
  assert.ok(result && "settings" in result);
  assert.equal(result.settings.current, 2);
  assert.equal(result.settings.controlBonus, false);
  assert.equal(result.settings.bufferMinutes, 2);
  assert.deepEqual(result.simple.stages.map((stage) => stage.level), [3]);
});

test("mastery tool rejects unavailable operators and reversed progression", async () => {
  const tool = tools().calculate_mastery;
  const unknown = await tool.execute!({ targetOperator: "不存在", current: 0, target: 3 }, options);
  assert.ok(unknown && "error" in unknown);
  const reversed = await tool.execute!({ targetOperator: "埃癸斯", current: 2, target: 1 }, options);
  assert.ok(reversed && "error" in reversed);
});

test("recruitment fallback calculates combinations without inventing personal ownership", async () => {
  const tool = tools().calculate_recruitment;
  const tag = RECRUITMENT_TAGS.find((entry) => entry.id === 11)!;
  const result = await tool.execute!({ tags: [tag.zh], missingOnly: true }, options);
  assert.ok(result && "results" in result);
  assert.equal(result.minutes, 540);
  assert.equal(result.ownershipKnown, false);
  assert.equal(result.missingFilterApplied, false);
  assert.equal(result.results.length, calculateRecruitment([11]).length);
  assert.ok(result.results.every((entry) => entry.operators.every((operator) => operator.ownership === "unknown")));
});

test("recruitment personal pool supports missing and rarity filters", async () => {
  const tool = tools("maa").calculate_recruitment;
  const tag = RECRUITMENT_TAGS.find((entry) => entry.id === 11)!;
  const result = await tool.execute!({ tags: [tag.zh], fourStarOnly: true, missingOnly: true }, options);
  assert.ok(result && "results" in result);
  assert.equal(result.ownershipKnown, true);
  assert.equal(result.missingFilterApplied, true);
  assert.ok(result.results.every((entry) => entry.minimumRarity >= 4 && entry.missingCount! > 0));
});

test("tool schemas reject invalid tags, duration, environment and extra arguments", () => {
  const all = tools();
  const recruitment = all.calculate_recruitment.inputSchema as z.ZodType;
  const mastery = all.calculate_mastery.inputSchema as z.ZodType;
  assert.equal(recruitment.safeParse({ tags: ["不存在"] }).success, false);
  assert.equal(recruitment.safeParse({ tags: [RECRUITMENT_TAGS[0]!.zh], minutes: 541 }).success, false);
  assert.equal(mastery.safeParse({ targetOperator: "埃癸斯", current: 0, target: 3, environment: { invented: 1 } }).success, false);
  assert.equal(mastery.safeParse({ targetOperator: "埃癸斯", current: 0, target: 3, userId: "other" }).success, false);
});
