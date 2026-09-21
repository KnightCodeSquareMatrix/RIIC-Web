import { tool } from "ai";
import { z } from "zod";
import { calculateMastery, eligibleMasteryTargets, formatMasteryTime, MASTERY_ENVIRONMENTS } from "../../mastery.ts";
import { masteryInstructions } from "../../mastery-presentation.ts";
import { calculateRecruitment, RECRUITMENT_TAGS, RECRUITMENT_SOURCE } from "../../recruitment.ts";
import type { MasteryEnvironmentObservation } from "./mastery-environment.ts";
import type { OperBoxEntry } from "../../types.ts";

export interface AgentOperatorPool {
  operbox: OperBoxEntry[];
  source: "skland" | "maa" | "sample";
  sourceName: string;
  masteryEnvironment?: MasteryEnvironmentObservation;
}

type Guard = <T>(name: string, input: unknown, run: () => Promise<T>) => Promise<T | { error: string }>;

export function buildCalculatorTools(loadPool: () => Promise<AgentOperatorPool>, guard: Guard) {
  return {
    calculate_mastery: tool({
      description: "专精训练计算：按当前账号干员池生成简单、快速两套教官与换人时间线，无需基建排班。干员池自动按森空岛→MAA→全精二示例兜底。targetOperator 使用完整干员名称或 ID；current 省略从未专精开始，用户指定从专X开始则传 X。未指定中枢与环境参数时自动读取森空岛快照；无快照中枢默认 +5%、环境默认 0，换人余量默认 1 分钟。用户未明确设置时请省略 controlBonus/environment，不要用默认值覆盖自动读取。先调用出方案，末尾按 settings 汇报条件并询问是否调整，不要先确认默认值。环境值为实际进驻人数或对应点数。",
      inputSchema: z.object({
        targetOperator: z.string().trim().min(1).describe("目标干员完整名称或 ID"),
        current: z.union([z.literal(0), z.literal(1), z.literal(2)]).optional().describe("当前专精等级，省略从未专精（0）开始；用户说从专X开始时传 X"),
        target: z.union([z.literal(1), z.literal(2), z.literal(3)]).describe("目标专精等级，必须高于当前等级"),
        controlBonus: z.boolean().optional().describe("用户明确指定的中枢加成；省略自动读取，无快照默认开启"),
        bufferMinutes: z.number().min(0).max(1440).optional().describe("减半教官换人操作余量（分钟），默认 1"),
        environment: z.object(Object.fromEntries(Object.entries(MASTERY_ENVIRONMENTS).map(([key, config]) => [
          key, z.number().int().min(0).max(config.max ?? 10000).optional().describe(config.label),
        ]))).strict().optional().describe("仅传用户明确指定的环境参数；其余自动读取，未支持或无快照时为 0"),
      }).strict(),
      execute: async (input) => guard("calculate_mastery", input, async () => {
        const pool = await loadPool();
        const candidates = eligibleMasteryTargets(pool.operbox);
        const target = candidates.find((entry) => entry.id === input.targetOperator || entry.name === input.targetOperator || entry.id === `char_${input.targetOperator}`);
        if (!target) throw new Error(`干员池中没有可专精的「${input.targetOperator}」，请使用已拥有、精二且受计算器支持的干员完整名称。当前来源：${pool.sourceName}`);
        const settings = {
          current: input.current ?? 0, target: input.target,
          controlBonus: input.controlBonus ?? pool.masteryEnvironment?.controlBonus ?? true, bufferMinutes: input.bufferMinutes ?? 1,
          environment: Object.fromEntries(Object.keys(MASTERY_ENVIRONMENTS).map((key) => [key, input.environment?.[key] ?? pool.masteryEnvironment?.environment[key] ?? 0])),
        };
        const result = calculateMastery({ operbox: pool.operbox, targetId: target.id, ...settings });
        const project = (plan: typeof result.simple) => ({
          ...plan, totalTime: formatMasteryTime(plan.totalSeconds), instructions: masteryInstructions(plan),
        });
        return {
          source: pool.source, sourceName: pool.sourceName, isSample: pool.source === "sample",
          targetOperator: { id: target.id, name: target.name }, settings,
          environmentObservation: pool.masteryEnvironment ?? null,
          settingsSources: {
            controlBonus: input.controlBonus !== undefined ? "手动指定" : pool.masteryEnvironment ? "森空岛自动读取" : "默认值",
            environment: Object.fromEntries(Object.keys(MASTERY_ENVIRONMENTS).map((key) => [key, input.environment?.[key] !== undefined ? "手动指定" : pool.masteryEnvironment?.environment[key] !== undefined ? "森空岛自动读取" : "默认值（未自动推导）"])),
          },
          simple: project(result.simple), fast: project(result.fast),
          savedSeconds: Math.max(0, result.simple.totalSeconds - result.fast.totalSeconds),
          assumptions: "按教官心情充足、材料齐备、训练室等级满足要求计算。环境加成需全程保持；暂不计算休息、武道秒专一和基建产能影响。",
        };
      }),
    }),
    calculate_recruitment: tool({
      description: "公招词条计算：用户附带一至五个词条时直接计算，有几个执行几个，不要求补齐五个；完全没有词条时追问。枚举一至三个词条组合，返回最低星级与候选干员。默认九小时。自动获取干员池，全精二示例仅作兜底，示例不用于判断个人缺失。结果以有效词条全部保留为前提，不代表抽取概率。",
      inputSchema: z.object({
        tags: z.array(z.enum(RECRUITMENT_TAGS.map((tag) => tag.zh))).min(1).max(5).describe("公招界面词条名称"),
        minutes: z.number().int().min(60).max(540).multipleOf(10).optional().describe("招聘分钟数，默认 540"),
        fourStarOnly: z.boolean().optional().describe("仅显示最低四星的组合"),
        missingOnly: z.boolean().optional().describe("仅显示包含未拥有干员的组合；示例池时不启用"),
      }).strict(),
      execute: async (input) => guard("calculate_recruitment", input, async () => {
        const pool = await loadPool();
        const minutes = input.minutes ?? 540;
        const tags = [...new Set(input.tags)].map((name) => RECRUITMENT_TAGS.find((tag) => tag.zh === name)!.id);
        const personalPool = pool.source === "sample" ? null : pool.operbox;
        const results = calculateRecruitment(tags, minutes, personalPool).filter((result) =>
          (!input.fourStarOnly || result.minimumRarity >= 4) && (!input.missingOnly || personalPool === null || (result.missingCount ?? 0) > 0));
        return {
          source: pool.source, sourceName: pool.sourceName, isSample: pool.source === "sample",
          minutes, ownershipKnown: personalPool !== null, missingFilterApplied: !!input.missingOnly && personalPool !== null,
          dataSource: RECRUITMENT_SOURCE,
          assumptions: "最低星级以有效词条全部保留为前提，不代表抽取概率；示例干员池不用于判断个人已拥有或缺失。",
          results: results.map((result) => ({
            tags: result.tags.map((id) => RECRUITMENT_TAGS.find((tag) => tag.id === id)!.zh),
            minimumRarity: result.minimumRarity, missingCount: result.missingCount,
            operators: result.operators.map(({ id, name, rarity, ownership }) => ({ id, name, rarity, ownership })),
          })),
        };
      }),
    }),
  };
}
