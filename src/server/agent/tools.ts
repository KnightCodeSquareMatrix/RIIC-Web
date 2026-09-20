import "server-only";

import { tool } from "ai";
import { z } from "zod";

import { PRESETS, buildBlueprint, factoryRecipeFor, updateFactoryRecipe } from "@/blueprint";
import type { FactoryRecipe } from "@/factory-recipes";
import { runPlan, getSampleOperbox } from "@/server/infra";
import { toPublicPlanData } from "@/server/public-plan";
import { loadStatusSnapshot } from "@/server/skland/adapter";
import { activeSklandAccount, readSklandAccountStore } from "@/server/skland/http";
import { sklandDataOwnerTag } from "@/server/skland/session";
import { listSavedPlans } from "@/server/workspace";
import { createRequestId } from "@/server/api-contract";
import type { BaseBlueprint, OperBoxEntry, RotationProfile } from "@/types";
import { projectPlanResult, saveAgentPlanArtifact } from "./plan-artifact.ts";
import { readKnowledgeDoc, searchKnowledgeBase } from "./knowledge.ts";

export interface AgentToolContext {
  request: Request;
  userId: string;
}

const ROTATION_PROFILES: RotationProfile[] = ["abc_12_6_6", "abc_12_12_12", "main_backup_12_12", "fiammetta_8_8_4_4", "abyssal_7_5_7_5"];
const SOLVE_TIMEOUT_MS = 180_000;

function logToolCall(userId: string, name: string, input: unknown, startedAt: number, failed: boolean) {
  console.log(JSON.stringify({
    level: "info",
    event: "agent_tool_call",
    userId,
    tool: name,
    failed,
    durationMs: Math.max(0, Math.round(performance.now() - startedAt)),
    inputPreview: JSON.stringify(input)?.slice(0, 300),
  }));
}

async function guarded<T>(userId: string, name: string, input: unknown, run: () => Promise<T>): Promise<T | { error: string }> {
  const startedAt = performance.now();
  try {
    const result = await run();
    logToolCall(userId, name, input, startedAt, false);
    return result;
  } catch (error) {
    logToolCall(userId, name, input, startedAt, true);
    return { error: error instanceof Error ? error.message : "工具执行失败。" };
  }
}

interface SklandSnapshotForTools {
  operbox: OperBoxEntry[];
  dataOwnerTag: string;
  sourceName: string;
  player: {
    nickname: string;
    level: number | null;
    sanity: { current: number; max: number } | null;
    operatorCount: number | null;
  };
  infrastructure: {
    layoutLabel: string | null;
    rooms: Array<{ key: string; group: string; level: number; operatorCount: number }>;
  };
  warnings: string[];
}

async function loadSklandSnapshot(ctx: AgentToolContext): Promise<SklandSnapshotForTools> {
  const store = await readSklandAccountStore(ctx.userId);
  const account = activeSklandAccount(store);
  if (!account) {
    throw new Error("当前浏览器没有可用的森空岛登录态，请先在「森空岛」页面扫码或导入凭证。");
  }
  const { snapshot } = await loadStatusSnapshot(account.session);
  return {
    operbox: snapshot.operbox,
    dataOwnerTag: sklandDataOwnerTag(account.session.userId),
    sourceName: `森空岛·${snapshot.player.nickname}`,
    player: {
      nickname: snapshot.player.nickname,
      level: snapshot.player.level,
      sanity: snapshot.player.sanity ? { current: snapshot.player.sanity.current, max: snapshot.player.sanity.max } : null,
      operatorCount: snapshot.player.counts.operators ?? null,
    },
    infrastructure: {
      layoutLabel: snapshot.infrastructure.layoutLabel,
      rooms: snapshot.infrastructure.rooms.map((room) => ({
        key: room.key,
        group: room.group,
        level: room.level,
        operatorCount: room.operators.length,
      })),
    },
    warnings: snapshot.warnings,
  };
}

function operboxStats(operbox: OperBoxEntry[]) {
  const byRarity = new Map<number, number>();
  let elite2 = 0;
  for (const entry of operbox) {
    if (entry.own) byRarity.set(entry.rarity, (byRarity.get(entry.rarity) ?? 0) + 1);
    if (entry.own && entry.elite === 2) elite2 += 1;
  }
  const elite2SixStar = operbox
    .filter((entry) => entry.own && entry.elite === 2 && entry.rarity === 6)
    .map((entry) => entry.name);
  return {
    owned: [...byRarity.values()].reduce((sum, count) => sum + count, 0),
    elite2,
    byRarity: Object.fromEntries([...byRarity.entries()].sort((a, b) => b[0] - a[0]).map(([rarity, count]) => [`star${rarity}`, count])),
    elite2SixStarNames: elite2SixStar,
  };
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error(message)), ms);
    }),
  ]);
}

export function buildAgentTools(ctx: AgentToolContext) {
  return {
    diagnose_account: tool({
      description:
        "账号诊断：查看当前用户的森空岛绑定状态、干员库存概览（总数、精二数、稀有度分布、精二六星名单）、当前游戏内基建布局、最近保存的排班。判断用户库存与练度水平时必用。",
      inputSchema: z.object({}).strict().describe("无需参数"),
      execute: async () => guarded(ctx.userId, "diagnose_account", {}, async () => {
        let skland: Awaited<ReturnType<typeof loadSklandSnapshot>> | null = null;
        let sklandError: string | null = null;
        try {
          skland = await loadSklandSnapshot(ctx);
        } catch (error) {
          sklandError = error instanceof Error ? error.message : "森空岛数据不可用。";
        }
        let savedPlans: Array<{ title: string; createdAt: string; layoutLabel: string | null }> = [];
        try {
          const plans = await listSavedPlans(ctx.userId);
          savedPlans = plans.plans.slice(0, 3).map((plan) => ({
            title: plan.title,
            createdAt: plan.createdAt,
            layoutLabel: plan.calculationContext?.presetLabel ?? null,
          }));
        } catch {
          savedPlans = [];
        }
        return {
          skland: skland
            ? {
                connected: true,
                player: skland.player,
                operbox: operboxStats(skland.operbox),
                currentInfrastructure: skland.infrastructure,
                warnings: skland.warnings,
              }
            : { connected: false, reason: sklandError },
          savedPlans,
        };
      }),
    }),

    solve_schedule: tool({
      description:
        "排班求解：向站内求解器提交一次真正的排班计算，返回三班（或所选节奏）排班表、日产出与练卡建议。调用前先与用户确认布局预设与干员来源；搓玉时通过 manufactureRecipes 把部分制造站配方设为 originium。计算耗时通常 10-60 秒。",
      inputSchema: z.object({
        layoutPreset: z.enum(["243", "153", "333", "252", "342"]).describe("布局预设：贸易/制造/发电站数量"),
        boxSource: z.enum(["skland", "sample"]).describe("干员数据来源：skland=用户森空岛同步，sample=243 全精二示例"),
        rotation: z.enum(["abc_12_6_6", "abc_12_12_12", "main_backup_12_12", "fiammetta_8_8_4_4", "abyssal_7_5_7_5"]).optional().describe(
          "换班节奏，默认 abc_12_6_6（三班 12/6/6 小时）"
        ),
        manufactureRecipes: z.array(z.enum(["gold", "battle_record", "originium"])).optional().describe(
          "制造站配方，按制造站顺序给定。搓玉经典配置：[\"originium\",\"originium\",\"gold\",\"gold\"]（243 布局）。省略则全部为 gold。"
        ),
        fiammettaEnable: z.boolean().optional().describe("是否启用菲亚梅塔（焰尾）换班加成，默认 false"),
      }),
      execute: async (input) => guarded(ctx.userId, "solve_schedule", input, async () => {
        const preset = PRESETS.find((candidate) => candidate.label === input.layoutPreset);
        if (!preset) return { error: `未知布局预设：${input.layoutPreset}` };
        let layout: BaseBlueprint = buildBlueprint(preset);
        if (input.manufactureRecipes?.length) {
          const factoryRooms = layout.rooms.filter((room) => room.kind === "factory");
          for (const [index, recipe] of input.manufactureRecipes.entries()) {
            const room = factoryRooms[index];
            if (room) layout = updateFactoryRecipe(layout, room.id, recipe as FactoryRecipe);
          }
        }
        const recipes = layout.rooms
          .filter((room) => room.kind === "factory")
          .map((room) => factoryRecipeFor(room));
        let operbox: OperBoxEntry[];
        let sourceName: string;
        let dataOwnerTag: string | null = null;
        if (input.boxSource === "skland") {
          const snapshot = await loadSklandSnapshot(ctx);
          operbox = snapshot.operbox;
          sourceName = snapshot.sourceName;
          dataOwnerTag = snapshot.dataOwnerTag;
        } else {
          const sample = await getSampleOperbox();
          operbox = sample.operbox as OperBoxEntry[];
          sourceName = sample.sourceName;
        }
        const rotation = (input.rotation && ROTATION_PROFILES.includes(input.rotation) ? input.rotation : "abc_12_6_6");
        const runResult = await withTimeout(
          runPlan({
            layout,
            operbox,
            sourceName,
            rotation,
            fiammettaEnable: input.fiammettaEnable ?? false,
            dataOwnerTag,
          }),
          SOLVE_TIMEOUT_MS,
          `求解超时（${SOLVE_TIMEOUT_MS / 1000} 秒），请稍后重试或改用示例 Box。`
        );
        const publicResult = toPublicPlanData(
          runResult,
          { layoutLabel: preset.label, sourceName, layout },
          createRequestId()
        );
        const projected = projectPlanResult(publicResult);
        const artifactId = await saveAgentPlanArtifact(
          ctx.userId,
          projected,
          {
            layoutPreset: preset.label,
            boxSource: input.boxSource,
            factoryRecipes: recipes,
            operatorCount: operbox.length,
          },
          {
            presetLabel: preset.label,
            layout,
            operbox,
            sourceName,
            boxSource: input.boxSource === "skland" ? "skland" : "sample",
            rotationProfile: rotation,
            fiammettaEnabled: input.fiammettaEnable ?? false,
            result: publicResult,
            activeShift: 0,
          }
        ).catch(() => null);
        return {
          solved: true,
          factoryRecipes: recipes,
          boxSource: input.boxSource,
          operatorCount: operbox.length,
          planUrl: artifactId ? `/plan/${artifactId}` : null,
          planArtifactNote: artifactId
            ? "排班已保存为结果页，planUrl 可直接给博士点击验收（保留 7 天）。"
            : "结果页保存失败，直接在对话中呈现结果即可。",
          plan: projected,
        };
      }),
    }),

    query_skills: tool({
      description: "基建技能查询：按技能名、关键词或标签查询游戏内基建技能效果原文。用于回答某技能效果、某类加成技能有哪些。",
      inputSchema: z.object({
        query: z.string().min(1).describe("技能名或效果关键词，如 订单效率 赤金 生产力"),
        tag: z.string().optional().describe("可选标签过滤，如 生产力 订单效率 心情消耗"),
        limit: z.number().int().min(1).max(30).optional().describe("返回条数上限，默认 12"),
      }),
      execute: async (input) => guarded(ctx.userId, "query_skills", input, async () => {
        const catalog = (await import("@/generated/arkntools/building-skill-catalog.json")).default as Record<
          string,
          { id: string; name: string; descriptionRich: string; tags: string[] }
        >;
        const needle = input.query.trim().toLowerCase();
        const tag = input.tag?.trim().toLowerCase();
        const limit = input.limit ?? 12;
        const matched = Object.values(catalog)
          .filter((skill) => {
            const description = skill.descriptionRich.replace(/<[^>]+>/g, "");
            if (tag && !skill.tags.some((value) => value.toLowerCase().includes(tag))) return false;
            return (
              skill.name.toLowerCase().includes(needle)
              || description.toLowerCase().includes(needle)
              || skill.tags.some((value) => value.toLowerCase().includes(needle))
            );
          })
          .slice(0, limit)
          .map((skill) => ({
            id: skill.id,
            name: skill.name,
            description: skill.descriptionRich.replace(/<[^>]+>/g, ""),
            tags: skill.tags,
          }));
        return { query: input.query, matchedCount: matched.length, skills: matched };
      }),
    }),

    kb_route: tool({
      description:
        "知识库导诊：把用户问题转成关键词，返回基建知识库（RIIC-knowledge）中最相关的候选文档路径列表。回答机制、组合、产出换算、搓玉取舍等知识类问题前先用本工具定位文档。",
      inputSchema: z.object({
        question: z.string().min(1).describe("用户的问题或主题关键词，如 搓玉 源石碎片 无人机折算"),
      }),
      execute: async (input) => guarded(ctx.userId, "kb_route", input, async () => searchKnowledgeBase(input.question)),
    }),

    kb_read: tool({
      description: "读取知识库文档正文（markdown）。path 必须使用 kb_route 返回的相对路径；超长文档会被截断。",
      inputSchema: z.object({
        path: z.string().min(1).describe("知识库内相对路径，如 docs/1-基础设定/资源体系/产出常数表.md"),
      }),
      execute: async (input) => guarded(ctx.userId, "kb_read", input, async () => readKnowledgeDoc(input.path)),
    }),
  };
}
