"use client";

import { lazy, Suspense, useMemo, useState, type ComponentProps } from "react";
import { Timer } from "lucide-react";
import { calculateMastery, eligibleMasteryTargets, normalizeMasteryBox, availableMasteryEnvironments, formatMasteryTime, MASTERY_ENVIRONMENTS, type MasteryInput, type MasteryResult } from "@/mastery";
import { masteryClipboard, masteryInstructions } from "@/mastery-presentation";
import { InfraTechnicalCard, InfraTechnicalHeading } from "@/components/InfraTechnicalCard";
import { SetupActionButton } from "@/components/setup/SetupActionButton";
import { OperatorIdentity } from "@/components/operators/OperatorPickerParts";
import type { OperatorSkillTooltip } from "@/components/OperatorSkillTooltip";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { demoOperatorName, useLanguageDemo } from "@/language-demo";
import catalog from "@/generated/arkntools/operator-catalog.json";
import type { OperBoxEntry } from "@/types";

const TargetPicker = lazy(() => import("@/components/mastery/MasteryTargetPicker").then((m) => ({default:m.MasteryTargetPicker})));
const TrainerSkillTooltip = lazy(() => import("@/components/OperatorSkillTooltip").then((m) => ({ default: m.OperatorSkillTooltip })));

function MasteryTrainerTooltip(props: ComponentProps<typeof OperatorSkillTooltip>) {
  return <Suspense fallback={props.trigger}><TrainerSkillTooltip {...props} /></Suspense>;
}
export interface MasteryPlannerProps {
  operbox: OperBoxEntry[] | null;
  sourceName: string | null;
  requiresAccount: boolean;
  pending: boolean;
  identityKey: string;
  onOpenSetup: () => void;
  onRequestAccount: () => void;
  pickerRequested: boolean;
  onPickerRequestConsumed: () => void;
}

export function MasteryPlanner({ operbox, sourceName, requiresAccount, pending, onOpenSetup, onRequestAccount, pickerRequested, onPickerRequestConsumed }: MasteryPlannerProps) {
  const { locale } = useLanguageDemo();
  const en = locale === "en";
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [current, setCurrent] = useState<0 | 1 | 2>(0);
  const [target, setTarget] = useState<1 | 2 | 3>(3);
  const [controlBonus, setControlBonus] = useState(true);
  const [bufferMinutes, setBufferMinutes] = useState(1);
  const [environment, setEnvironment] = useState<Record<string,number>>({});
  const [mode, setMode] = useState<"simple" | "fast">("simple");
  const [calculation, setCalculation] = useState<{ signature: string; result: MasteryResult } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const normalizedBox = useMemo(() => normalizeMasteryBox(operbox ?? []),[operbox]);
  const eligible = useMemo(() => eligibleMasteryTargets(normalizedBox),[normalizedBox]);
  const selected = eligible.find((o) => o.id === selectedId) ?? null;
  if (selectedId && !selected) setSelectedId(null);
  const meta = selected ? catalog.find((o) => o.id === selected.id) : null;
  const environmentKeys = availableMasteryEnvironments(operbox ?? [],selected?.id);
  const input: MasteryInput = { operbox: operbox ?? [], targetId: selected?.id ?? "", current, target, controlBonus, bufferMinutes, environment: Object.fromEntries(environmentKeys.map((key) => [key, environment[key] ?? 0])) };
  const signature = JSON.stringify(input);
  const stale = !!calculation && calculation.signature !== signature;
  const plan = !stale ? calculation?.result[mode] : null;
  const displayName = (name: string) => demoOperatorName(name,locale);
  const conditions = en ? "Assumes sufficient morale, materials and training-room level. Environment bonuses must remain active. Rest, Martial Arts instant completion and base-production impact are not included." : "按教官心情充足、材料齐备、训练室等级满足要求计算。环境加成需全程保持；暂不计算休息、武道秒专一和基建产能影响。";
  const activeEnvironment = environmentKeys.map((key) => `${en ? MASTERY_ENVIRONMENTS[key]!.english : MASTERY_ENVIRONMENTS[key]!.label} ${input.environment[key]}`).join(" · ");
  const settingsSummary = `${en ? "Control bonus" : "中枢加成"} ${controlBonus ? "+5%" : "0%"} · ${en ? "Buffer" : "操作余量"} ${bufferMinutes} ${en ? "min" : "分钟"}${activeEnvironment ? ` · ${activeEnvironment}` : ""}`;

  async function copyPlan() {
    if (!plan || !selected) return;
    try {
      await navigator.clipboard.writeText([masteryClipboard(plan,displayName(selected.name),en,displayName),settingsSummary,conditions].join("\n"));
      setCopied(true);
    } catch { setError(en ? "Could not copy. Please check browser clipboard permissions." : "复制失败，请检查浏览器剪贴板权限。"); }
  }

  return <section className="grid min-w-0 gap-5 pt-5 pb-8" aria-labelledby="mastery-heading" data-mastery-planner>
    <header className="flex flex-wrap items-center justify-between gap-3">
      <div><h1 id="mastery-heading" className="flex items-center gap-2.5 text-lg font-semibold"><span className="h-6 w-1.5 bg-[#FFD501]" />{en ? "Mastery Planner" : "专精规划"}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{en ? "Choose an operator. Get a stage-by-stage trainer schedule from your Box." : "选择一名干员，用自己的 Box 计算每个专精阶段的教官安排。"}</p></div>
      <SetupActionButton variant="outline" onClick={onOpenSetup} disabled={pending}>{en ? "Configure Box" : "配置 Box"}</SetupActionButton>
    </header>

    <div className="grid gap-5 rounded-[4px] border border-border bg-card p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0"><p className="text-xs text-muted-foreground">{en ? "Current Box" : "当前 Box"}</p><p className="mt-1 break-words text-sm">{requiresAccount ? (en ? "Sign in to use your Box" : "登录后使用自己的 Box") : sourceName ?? (en ? "No Box configured" : "尚未配置 Box")}</p>
          {selected && meta ? <div className="mt-4 flex items-center gap-3"><OperatorIdentity name={selected.name} portrait={meta.portrait}><span className="text-xs text-muted-foreground">{selected.rarity}★ · {en ? "Elite 2" : "精二"}</span></OperatorIdentity></div> : null}
        </div>
        <SetupActionButton disabled={pending || (!requiresAccount && !eligible.length)} onClick={() => { if (requiresAccount) onRequestAccount(); else setPickerOpen(true); }}>
          {en ? (selected ? "Change operator" : "Choose operator") : (selected ? "更换干员" : "选择干员")}
        </SetupActionButton>
      </div>
      {!requiresAccount && !pending && !eligible.length ? <p className="text-sm text-muted-foreground">{en ? "Your Box has no owned E2 operators. Import or update your Box to continue." : "当前 Box 中没有已拥有的精二干员，请先导入或更新 Box。"}</p> : null}
      <div className="flex flex-wrap items-end gap-x-8 gap-y-4">
        <div className="grid gap-2"><span className="text-xs text-muted-foreground">{en ? "Current mastery" : "当前专精等级"}</span><Tabs value={String(current)} onValueChange={(value) => { const next = Number(value) as 0|1|2; setCurrent(next); if (target <= next) setTarget((next+1) as 1|2|3); }}><TabsList aria-label={en ? "Current mastery" : "当前专精等级"}>
          {[0,1,2].map((level) => <TabsTrigger key={level} value={String(level)}>{level === 0 ? (en ? "Untrained" : "未专精") : (en ? `M${level}` : `专${level}`)}</TabsTrigger>)}
        </TabsList></Tabs></div>
        <div className="grid gap-2"><span className="text-xs text-muted-foreground">{en ? "Target mastery" : "目标专精等级"}</span><Tabs value={String(target)} onValueChange={(value) => setTarget(Number(value) as 1|2|3)}><TabsList aria-label={en ? "Target mastery" : "目标专精等级"}>
          {[1,2,3].map((level) => <TabsTrigger key={level} value={String(level)} disabled={level <= current}>{en ? `M${level}` : `专${level}`}</TabsTrigger>)}
        </TabsList></Tabs></div>
        <SetupActionButton variant={controlBonus ? "default" : "outline"} aria-pressed={controlBonus} onClick={() => setControlBonus((value) => !value)}>{en ? "Control center +5%" : "中枢专精加成 +5%"}</SetupActionButton>
      </div>
      <p className="text-xs leading-5 text-muted-foreground">{en ? "Enter the current mastery of the skill you plan to train. Start a new stage; no saved halving is assumed. The control bonus assumes a suitable operator remains stationed throughout." : "填写准备训练的那项技能的当前专精等级。从新阶段开始，不预设已有减半效果；开启中枢加成即表示你会全程安排对应干员进驻。"}</p>
      <details className="min-w-0 border-t border-border pt-4">
        <summary className="cursor-pointer text-sm font-medium">{en ? "Advanced settings" : "高级设置"}</summary>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <label className="grid gap-2 text-xs">{en ? "Handoff buffer (minutes)" : "换人操作余量（分钟）"}<Input type="number" min={0} step={0.5} value={Number.isFinite(bufferMinutes) ? bufferMinutes : ""} onChange={(e) => setBufferMinutes(e.target.valueAsNumber)} /></label>
          {environmentKeys.map((key) => <label key={key} className="grid gap-2 text-xs">{en ? MASTERY_ENVIRONMENTS[key]!.english : MASTERY_ENVIRONMENTS[key]!.label}<Input type="number" min={0} max={MASTERY_ENVIRONMENTS[key]!.max ?? 10000} step={1} value={Number.isFinite(environment[key] ?? 0) ? environment[key] ?? 0 : ""} onChange={(e) => setEnvironment((previous) => ({...previous,[key]:e.target.valueAsNumber}))} /></label>)}
        </div>
        <p className="mt-3 text-xs leading-5 text-muted-foreground">{en ? "Environment counts refer to operators actually stationed in the base, not simply owned. Reserve extra time for the 5-hour halving trigger." : "人数指基建内实际进驻人数，不是 Box 持有数量。操作余量用于让减半教官连续工作超过 5 小时，降低错过换人时间的风险。"}</p>
      </details>
      <div className="flex flex-wrap items-center gap-4">
        <SetupActionButton disabled={pending || requiresAccount || !selected} onClick={() => {
          setCopied(false); setError(null);
          try { setCalculation({ signature, result: calculateMastery(input) }); } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
        }}>{en ? "Generate plans" : "生成方案"}</SetupActionButton>
        <span className="text-xs text-muted-foreground">{en ? "Computed locally. No base schedule required." : "本地计算，无需先生成基建排班。"}</span>
      </div>
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
    </div>

    <p className="text-xs leading-5 text-muted-foreground">{conditions}</p>
    {stale ? <p role="status" className="rounded-[4px] border border-border p-4 text-sm">{en ? "Inputs or Box changed. Generate plans again to see updated results." : "输入或 Box 已变化，请重新生成方案。"}</p> : null}
    {plan && calculation ? <div className="grid min-w-0 gap-4" data-mastery-results>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs value={mode} onValueChange={(value) => { setMode(value as "simple"|"fast"); setCopied(false); }}><TabsList aria-label={en ? "Plan style" : "专精方案类型"}><TabsTrigger value="simple">{en ? "Simple" : "省操作"}</TabsTrigger><TabsTrigger value="fast">{en ? "Fast" : "极速"}</TabsTrigger></TabsList></Tabs>
        <SetupActionButton variant="outline" onClick={() => void copyPlan()}>{copied ? (en ? "Copied" : "已复制") : (en ? "Copy instructions" : "复制操作清单")}</SetupActionButton>
      </div>
      <InfraTechnicalCard group="training" className="p-5 sm:p-6">
        <InfraTechnicalHeading icon={<Timer className="size-4" />}>{en ? "Estimated completion time" : "预计总耗时"}</InfraTechnicalHeading>
        <div className="mt-4 flex flex-wrap items-baseline gap-x-6 gap-y-2"><strong className="font-number text-3xl">{formatMasteryTime(plan.totalSeconds)}</strong><span className="text-sm text-white/75">{en ? `${plan.switches} trainer changes` : `${plan.switches} 次换教官`}</span>
          {mode === "fast" ? <span className="text-sm text-white/75">{en ? "Time saved" : "比省操作节省"} {formatMasteryTime(Math.max(0,calculation.result.simple.totalSeconds-plan.totalSeconds))}</span> : null}</div>
        <p className="mt-3 text-xs leading-5 text-white/65">{settingsSummary}</p>
      </InfraTechnicalCard>
      <p className="text-xs text-muted-foreground">{en ? "Times are relative to the start. Finish and start each mastery stage manually at the indicated time." : "时间从开始专精起累计；请在标注时刻手动收取并开启下一阶段。"}</p>
      <div className="grid gap-4">
        {masteryInstructions(plan,en,displayName).map((steps,index) => <article key={plan.stages[index]!.level} className="rounded-[4px] border border-border bg-card p-4 sm:p-5">
          <h2 className="mb-4 flex flex-wrap items-center gap-3 text-base font-semibold">{en ? `Mastery ${plan.stages[index]!.level}` : `专${plan.stages[index]!.level}`}<span className="font-number text-sm font-normal text-muted-foreground">{formatMasteryTime(plan.stages[index]!.seconds)}</span>{plan.stages[index]!.activateWith ? <span className="text-xs font-normal">{en ? "50% reduction" : "已继承减半"}</span> : null}</h2>
          <div className="mb-4 flex flex-wrap gap-3">{plan.stages[index]!.segments.filter((s) => s.trainerId).map((segment,i) => {
            const operator = normalizedBox.find((o) => o.id === segment.trainerId);
            const portrait = catalog.find((o) => o.id === segment.trainerId)?.portrait;
            return <MasteryTrainerTooltip key={`${segment.trainerId}:${i}`} name={segment.trainerName} currentElite={operator?.elite} currentLevel={operator?.level} highlightedSkillIds={segment.skillIds}
              trigger={<button type="button" className="flex min-w-0 items-center gap-2 rounded-[4px] border border-border p-2 text-left" aria-label={en ? `Show ${displayName(segment.trainerName)} infrastructure skills` : `查看${segment.trainerName}的基建技能`}><OperatorIdentity compact name={segment.trainerName} portrait={portrait}><span className="text-xs text-muted-foreground">{en ? "Trainer" : "教官"}</span></OperatorIdentity></button>} />;
          })}</div>
          <ol className="grid gap-3">{steps.map((step,i) => <li key={i} className="grid grid-cols-[5.75rem_minmax(0,1fr)] items-start gap-3 text-sm"><span className="font-number pt-0.5 text-xs text-muted-foreground">+{formatMasteryTime(step.elapsed)}</span><span className={step.kind === "notice" ? "text-muted-foreground" : "font-medium"}>{step.text}</span></li>)}</ol>
        </article>)}
      </div>
    </div> : null}
    {(pickerOpen || pickerRequested) && !pending && !requiresAccount && operbox ? <Suspense fallback={<Skeleton className="h-40" />}><TargetPicker operbox={operbox} selectedId={selectedId} onClose={() => { setPickerOpen(false); onPickerRequestConsumed(); }} onSelect={(id) => { setSelectedId(id); setPickerOpen(false); onPickerRequestConsumed(); setError(null); }} /></Suspense> : null}
  </section>;
}
