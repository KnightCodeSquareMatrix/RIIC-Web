import { useState, type ReactNode } from "react";
import { CircleAlert, ClipboardCheck, ChevronDown, GraduationCap } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";

import { InfraTechnicalCard, InfraTechnicalHeading } from "@/components/InfraTechnicalCard";
import { RecommendationCard } from "@/components/RecommendationCard";
import { cn } from "@/lib/utils";
import { MOTION_DURATION, MOTION_EASE_IN_OUT } from "@/motion";
import { TrainingAdviceActionCard } from "@/components/training-advice/TrainingAdviceActionCard";
import { TrainingCombinationCard } from "@/components/training-advice/TrainingCombinationCard";
import {
  sortTrainingCombinations,
  sortTrainingRecommendations,
} from "@/components/training-advice/presentation";
import { Button } from "@/components/ui/button";
import type {
  BaseBlueprint,
  OperBoxEntry,
  TrainingAdviceReport,
  UserProfile,
  UserProfileAction,
} from "@/types";

export type TrainingAdviceProps = {
  operbox?: OperBoxEntry[] | null;
  layout?: BaseBlueprint | null;
  profile?: UserProfile | null;
  trainingAdvice?: TrainingAdviceReport | null;
  requiresAccount?: boolean;
  onOpenCalculator: () => void;
};

function countRooms(layout: BaseBlueprint | null | undefined) {
  const rooms = layout?.rooms ?? [];
  return {
    total: rooms.length,
    trade: rooms.filter((room) => room.kind === "trade_post").length,
    factory: rooms.filter((room) => room.kind === "factory").length,
    power: rooms.filter((room) => room.kind === "power_plant").length,
    dormitory: rooms.filter((room) => room.kind === "dormitory").length,
  };
}

function duplicateValues(values: string[]) {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const value of values) {
    const normalized = value.trim();
    if (!normalized) continue;
    if (seen.has(normalized)) duplicates.add(normalized);
    seen.add(normalized);
  }
  return [...duplicates];
}

function contractIssues(layout: BaseBlueprint | null | undefined, operbox: OperBoxEntry[] | null | undefined) {
  const issues: string[] = [];
  const rooms = layout?.rooms ?? [];
  const entries = operbox ?? [];

  if (!rooms.length) issues.push("尚未配置基建设施");
  if (!entries.length) issues.push("尚未导入干员数据");
  if (rooms.length > 64) issues.push("基建设施不能超过 64 间房");
  if (entries.length > 1000) issues.push("干员数据不能超过 1000 条");
  if (rooms.some((room) => !room.id.trim())) issues.push("存在空房间 ID");
  if (entries.some((entry) => !entry.id.trim() || !entry.name.trim())) issues.push("存在空干员 ID 或名称");

  const duplicateRoomIds = duplicateValues(rooms.map((room) => room.id));
  if (duplicateRoomIds.length) issues.push(`房间 ID 重复：${duplicateRoomIds.join("、")}`);

  const duplicateOperatorIds = duplicateValues(entries.map((entry) => entry.id));
  if (duplicateOperatorIds.length) issues.push(`干员 ID 重复：${duplicateOperatorIds.join("、")}`);

  const duplicateOperatorNames = duplicateValues(entries.map((entry) => entry.name));
  if (duplicateOperatorNames.length) issues.push(`干员名称重复：${duplicateOperatorNames.join("、")}`);

  return issues;
}

function actionKey(action: UserProfileAction, index: number) {
  return `${action.domain_id}-${action.kind}-${action.operator}-${index}`;
}

function formatPercent(value: number | null | undefined): string {
  return value == null ? "—" : `${value.toFixed(1)}%`;
}

function CollapsibleSection({
  accent,
  title,
  count,
  collapsed,
  onToggle,
  children,
}: {
  accent: string;
  title: string;
  count: number;
  collapsed: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <section className="min-w-0" aria-label={title}>
      <div className="mb-2 flex min-w-0 items-center justify-between gap-3">
        <button
          type="button"
          className="flex min-w-0 items-center gap-2.5 text-left max-sm:min-h-11"
          aria-expanded={!collapsed}
          onClick={onToggle}
        >
          <span className={`h-7 w-1.5 shrink-0 ${accent}`} aria-hidden="true" />
          <h2 className="truncate text-[21px] font-medium leading-none text-[#313131]">{title}</h2>
          <span className="font-number text-xs text-[#313131]/52">{count}</span>
          <motion.span
            className="flex size-4 shrink-0 items-center justify-center text-[#313131]/45"
            animate={{ rotate: collapsed ? -90 : 0 }}
            transition={{ duration: MOTION_DURATION.fast, ease: MOTION_EASE_IN_OUT }}
            aria-hidden="true"
          >
            <ChevronDown className="size-4" />
          </motion.span>
        </button>
      </div>
      <div className={cn("grid min-w-0 gap-3", collapsed && "hidden")}>{children}</div>
    </section>
  );
}

export function TrainingAdvice({
  operbox,
  layout,
  profile,
  trainingAdvice,
  requiresAccount = false,
  onOpenCalculator,
}: TrainingAdviceProps) {
  const shouldReduceMotion = useReducedMotion();
  const entries = operbox ?? [];
  const ownedByName = new Map(entries.map((entry) => [entry.name, entry]));
  const roomCounts = countRooms(layout);
  const issues = contractIssues(layout, operbox);
  const actions = profile?.actions ?? [];
  const ownedTotal = entries.filter((entry) => entry.own).length;
  const eliteTotal = entries.filter((entry) => entry.own && entry.elite >= 2).length;
  const advice = trainingAdvice ?? null;
  const recommendations = advice ? sortTrainingRecommendations(advice.recommendations) : [];
  const combinations = advice ? sortTrainingCombinations(advice.combinations) : [];
  const context = advice?.context;
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});
  const toggleSection = (id: string) =>
    setCollapsedSections((current) => ({ ...current, [id]: !current[id] }));

  if (requiresAccount) {
    return (
      <div className="flex w-full flex-col gap-5 pt-5" data-training-page>
        <section className="min-w-0" aria-label="训练建议概览">
          <div className="mb-2 flex min-w-0 items-center gap-2.5">
            <span className="h-7 w-1.5 shrink-0 bg-[#FFD501]" aria-hidden="true" />
            <h1 className="truncate text-[21px] font-medium leading-none text-[#313131]">训练建议</h1>
          </div>
          <InfraTechnicalCard group="training" className="min-h-[248px]" dataSlot="training-account-required" showEmblem={false}>
            <div className="grid min-h-[216px] place-content-center text-center">
              <CircleAlert className="mx-auto size-8 text-[var(--room-accent)]" aria-hidden="true" />
              <h2 className="mt-4 text-xl font-semibold">登录后查看练卡建议</h2>
              <p className="mt-2 max-w-lg text-sm leading-6 text-white/62">当前数据来自自主上传或第三方同步。请前往账号管理登录；匿名状态仍可改用全角色样例生成建议。</p>
              <Button type="button" className="mx-auto mt-4 h-9 bg-white text-[#272a2b] hover:bg-white/90 max-sm:h-11" onClick={onOpenCalculator}>返回基建计算器</Button>
            </div>
          </InfraTechnicalCard>
        </section>
      </div>
    );
  }

  return (
    <div className="flex w-full flex-col gap-5 pt-5" data-training-page>
      <section className="min-w-0" aria-label="训练建议概览">
        <div className="mb-2 flex min-w-0 items-center gap-2.5">
          <span className="h-7 w-1.5 shrink-0 bg-[#FFD501]" aria-hidden="true" />
          <h1 className="truncate text-[21px] font-medium leading-none text-[#313131]">训练建议</h1>
          <span className="font-number text-xs text-[#313131]/52">
            {advice ? recommendations.length : actions.length}
          </span>
        </div>
        <InfraTechnicalCard group="manufacture" dataSlot="training-summary" showEmblem={false}>
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(28rem,0.8fr)] lg:items-end">
            <div>
              <InfraTechnicalHeading icon={<GraduationCap className="size-4" aria-hidden="true" />}>
                最近一次排班
              </InfraTechnicalHeading>
              <h2 className="mt-4 text-[23px] font-medium leading-tight tracking-[-0.02em]">
                根据最近排班整理的培养方向
              </h2>
            </div>
            <div className="grid grid-cols-2 gap-px bg-white/10 sm:grid-cols-4">
              {[
                ["布局", layout?.template || "—"],
                ["房间", roomCounts.total || "—"],
                ["已拥有", entries.length ? ownedTotal : "—"],
                ["已精二", entries.length ? eliteTotal : "—"],
              ].map(([label, value]) => (
                <div key={label} className="min-w-0 bg-black/24 px-3 py-3">
                  <span className="text-[10px] text-white/48">{label}</span>
                  <strong className="mt-1 block truncate text-2xl font-semibold tabular-nums text-[var(--room-accent)]">
                    {value}
                  </strong>
                </div>
              ))}
              {advice ? (
                <div className="col-span-2 flex flex-wrap items-center gap-x-3 gap-y-1 bg-black/24 px-3 py-2 text-xs text-white/65 sm:col-span-4">
                  <span>效率</span>
                  <span>
                    <span className="font-number">{formatPercent(context?.trade_average_efficiency_percent)}</span> 贸易
                  </span>
                  <span>
                    <span className="font-number">{formatPercent(context?.manufacturing_average_efficiency_percent)}</span> 制造
                  </span>
                  {context?.dormitory_level_sum != null ? (
                    <span><span className="font-number">{context.dormitory_level_sum}</span> 宿舍级</span>
                  ) : null}
                  {context?.engineering_robot_count != null ? (
                    <span><span className="font-number">{context.engineering_robot_count}</span> 机器人</span>
                  ) : null}
                  {context?.meeting_room_max_level != null ? (
                    <span>会客室 Lv<span className="font-number">{context.meeting_room_max_level}</span></span>
                  ) : null}
                  {context?.has_originium_shard_factory != null ? (
                    <span>搓玉 {context.has_originium_shard_factory ? "是" : "否"}</span>
                  ) : null}
                </div>
              ) : (
                <div className="col-span-2 flex flex-wrap items-center gap-x-3 gap-y-1 bg-black/24 px-3 py-2 text-xs text-white/65 sm:col-span-4">
                  <span>设施</span>
                  <span><span className="font-number">{roomCounts.trade}</span> 贸易</span>
                  <span><span className="font-number">{roomCounts.factory}</span> 制造</span>
                  <span><span className="font-number">{roomCounts.power}</span> 发电</span>
                  <span><span className="font-number">{roomCounts.dormitory}</span> 宿舍</span>
                </div>
              )}
            </div>
          </div>
        </InfraTechnicalCard>
      </section>

      {issues.length ? (
        <InfraTechnicalCard group="manufacture" dataSlot="training-data-check" showEmblem={false}>
          <div className="flex gap-3 text-sm" aria-label="数据检查问题">
            <CircleAlert className="mt-0.5 size-5 shrink-0 text-[var(--room-accent)]" aria-hidden="true" />
            <div>
              <strong className="text-[var(--room-accent)]">还需要补充以下信息</strong>
              <ul className="mt-2 grid gap-1 text-white/72">
                {issues.map((issue) => <li key={issue}>• {issue}</li>)}
              </ul>
            </div>
          </div>
        </InfraTechnicalCard>
      ) : (
        <InfraTechnicalCard group="power" dataSlot="training-data-check" showEmblem={false}>
          <div className="flex gap-3 text-sm" aria-label="数据检查">
            <ClipboardCheck className="mt-0.5 size-5 shrink-0 text-[var(--room-accent)]" aria-hidden="true" />
            <p className="text-white/76">当前基建设施与干员数据已通过基础检查，可以生成排班。</p>
          </div>
        </InfraTechnicalCard>
      )}

      {advice ? (
        <>
          {advice.newbie_section_status === "shown" && advice.incomplete_newbie.length ? (
            <CollapsibleSection
              accent="bg-[#B8F03A]"
              title="新手目标"
              count={advice.incomplete_newbie.length}
              collapsed={Boolean(collapsedSections.newbie)}
              onToggle={() => toggleSection("newbie")}
            >
              <div className="grid min-w-0 gap-3" data-training-newbie-list>
                {advice.incomplete_newbie.map((item, index) => (
                  <TrainingAdviceActionCard
                    key={`${item.action}-${item.operator}`}
                    action={item}
                    index={index}
                  />
                ))}
              </div>
            </CollapsibleSection>
          ) : advice.newbie_section_status === "skipped_by_efficiency" ? (
            <InfraTechnicalCard group="power" dataSlot="training-newbie-skipped" showEmblem={false}>
              <p className="text-sm leading-6 text-white/76">
                当前贸易与制造均效已高于新手门槛，本轮不把基础名单列为优先行动；仍有
                <span className="font-number mx-1 text-[var(--room-accent)]">{advice.incomplete_newbie.length}</span>
                名干员未完成基础目标。
              </p>
            </InfraTechnicalCard>
          ) : advice.newbie_section_status === "complete" ? (
            <InfraTechnicalCard group="power" dataSlot="training-newbie-complete" showEmblem={false}>
              <p className="text-sm leading-6 text-white/76">基础练卡目标已完成。</p>
            </InfraTechnicalCard>
          ) : null}

          <CollapsibleSection
            accent="bg-[#29BDF5]"
            title="练卡建议"
            count={recommendations.length}
            collapsed={Boolean(collapsedSections.actions)}
            onToggle={() => toggleSection("actions")}
          >
            {recommendations.length ? (
              <div className="grid min-w-0 gap-3" data-training-advice-list>
                {recommendations.map((recommendation, index) => (
                  <TrainingAdviceActionCard
                    key={`${recommendation.combination_id}-${recommendation.operator}`}
                    action={recommendation}
                    entry={ownedByName.get(recommendation.operator)}
                    index={index}
                  />
                ))}
              </div>
            ) : (
              <InfraTechnicalCard group="training" className="min-h-[248px]" dataSlot="training-empty" showEmblem={false}>
                <div className="grid min-h-[216px] place-content-center text-center">
                  <h3 className="text-xl font-semibold">暂无优先培养目标</h3>
                  <p className="mt-2 max-w-lg text-sm leading-6 text-white/62">
                    当前干员与布局没有需要优先培养的项目，可以继续使用现有排班。
                  </p>
                </div>
              </InfraTechnicalCard>
            )}
          </CollapsibleSection>

          <CollapsibleSection
            accent="bg-[#FFD501]"
            title="组合进度"
            count={combinations.length}
            collapsed={Boolean(collapsedSections.combinations)}
            onToggle={() => toggleSection("combinations")}
          >
            <div className="grid min-w-0 gap-3" data-training-combination-list>
              {combinations.map((combination) => (
                <TrainingCombinationCard key={combination.id} combination={combination} />
              ))}
            </div>
          </CollapsibleSection>
        </>
      ) : (
        <CollapsibleSection
          accent="bg-[#29BDF5]"
          title="培养建议"
          count={actions.length}
          collapsed={Boolean(collapsedSections["legacy-actions"])}
          onToggle={() => toggleSection("legacy-actions")}
        >
          {actions.length ? (
            <div className="grid min-w-0 gap-3" data-training-advice-list>
              {actions.map((action, index) => (
                <RecommendationCard key={actionKey(action, index)} action={action} entry={ownedByName.get(action.operator)} index={index} showSkillTooltip={false} />
              ))}
            </div>
          ) : (
            <InfraTechnicalCard
              group="training"
              className="min-h-[248px]"
              dataSlot="training-empty"
              showEmblem={false}
            >
              <div className="grid min-h-[216px] gap-6 sm:grid-cols-[minmax(0,1fr)_15rem] sm:items-center">
                <motion.div className="max-w-xl" initial={{ opacity: 0, x: shouldReduceMotion ? 0 : -12 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: shouldReduceMotion ? 0 : 0.38, ease: [0.23, 1, 0.32, 1] }}>
                  <h3 className="text-xl font-semibold">
                    {profile ? "本次排班暂无培养建议" : "尚无培养建议"}
                  </h3>
                  {profile ? (
                    <p className="mt-2 max-w-lg text-sm leading-6 text-white/62">
                      当前干员与布局没有需要优先培养的项目，可以继续使用现有排班。
                    </p>
                  ) : null}
                  <div className="mt-5 flex justify-start">
                    <Button type="button" size="dialog" className="bg-white text-[#272a2b] hover:bg-white/90" onClick={onOpenCalculator}>
                      {profile ? "查看当前排班" : "前往生成排班"}
                    </Button>
                  </div>
                </motion.div>
                <motion.div className="hidden border-y border-white/12 py-3 sm:block" aria-hidden="true" initial={{ opacity: 0, x: shouldReduceMotion ? 0 : 12 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: shouldReduceMotion ? 0 : 0.38, delay: shouldReduceMotion ? 0 : 0.08, ease: [0.23, 1, 0.32, 1] }}>
                  {["干员练度扫描", "设施领域分析", "优先级队列"].map((label, index) => (
                    <div key={label} className="grid grid-cols-[auto_1fr_auto] items-center gap-2 border-b border-white/8 py-2.5 last:border-0">
                      <span className="font-number text-[10px] text-white/35">0{index + 1}</span>
                      <span className="text-xs text-white/65">{label}</span>
                      <span className="font-number text-[10px] text-emerald-300/80">CLEAR</span>
                    </div>
                  ))}
                </motion.div>
              </div>
            </InfraTechnicalCard>
          )}
        </CollapsibleSection>
      )}
    </div>
  );
}
