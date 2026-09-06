"use client";
import { localize as localize_components_pages_MasteryPlanner } from "../../i18n/helpers/components_pages_MasteryPlanner.ts";

import { useTranslations, useLocale } from "next-intl";

import { lazy, Suspense, useEffect, useMemo, useRef, useState, type ComponentProps } from "react";
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
import { localizedOperatorName } from "@/i18n/game-data";
import { useGameCatalog } from "@/i18n/game-data-client";
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
  const intl = useTranslations();
  const locale = useLocale();
  const gameCatalog = useGameCatalog();
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
  const resultsRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!calculation) return;
    const frame = requestAnimationFrame(() => {
      resultsRef.current?.scrollIntoView({
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth",
        block: "start",
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [calculation]);
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
  const displayName = (name: string) => localizedOperatorName(name,locale,gameCatalog);
  const conditions = intl("components_pages_MasteryPlanner.assumesSufficientMoraleMaterialsAndTrainingRoomLevelEnvironment");
  const activeEnvironment = environmentKeys.map((key) => `${en ? MASTERY_ENVIRONMENTS[key]!.english : MASTERY_ENVIRONMENTS[key]!.label} ${input.environment[key]}`).join(" · ");
  const settingsSummary = `${intl("components_pages_MasteryPlanner.controlBonus")} ${controlBonus ? "+5%" : "0%"} · ${intl("components_pages_MasteryPlanner.buffer")} ${bufferMinutes} ${intl("components_pages_MasteryPlanner.min")}${activeEnvironment ? ` · ${activeEnvironment}` : ""}`;

  async function copyPlan() {
    if (!plan || !selected) return;
    try {
      await navigator.clipboard.writeText([masteryClipboard(plan,displayName(selected.name),en,displayName),settingsSummary,conditions].join("\n"));
      setCopied(true);
    } catch { setError(intl("components_pages_MasteryPlanner.couldNotCopyPleaseCheckBrowserClipboardPermissions")); }
  }

  return <section className="grid min-w-0 gap-5 pt-5 pb-8" aria-labelledby="mastery-heading" data-mastery-planner>
    <header className="flex flex-wrap items-center justify-between gap-3">
      <div><h1 id="mastery-heading" className="flex items-center gap-2.5 text-lg font-semibold"><span className="h-6 w-1.5 bg-[#FFD501]" />{intl("components_pages_MasteryPlanner.masteryPlanner")}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{intl("components_pages_MasteryPlanner.chooseAnOperatorGetAStageByStageTrainer")}</p></div>
      <SetupActionButton variant="outline" onClick={onOpenSetup} disabled={pending}>{intl("components_pages_MasteryPlanner.configureBox")}</SetupActionButton>
    </header>

    <div className="grid gap-5 rounded-[4px] border border-border bg-card p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0"><p className="text-xs text-muted-foreground">{intl("components_pages_MasteryPlanner.currentBox")}</p><p className="mt-1 break-words text-sm">{requiresAccount ? (intl("components_pages_MasteryPlanner.signInToUseYourBox")) : sourceName ?? (intl("components_pages_MasteryPlanner.noBoxConfigured"))}</p>
          {selected && meta ? <div className="mt-4 flex items-center gap-3"><OperatorIdentity name={selected.name} portrait={meta.portrait}><span className="text-xs text-muted-foreground">{selected.rarity}★ · {intl("components_pages_MasteryPlanner.elite2")}</span></OperatorIdentity></div> : null}
        </div>
        <SetupActionButton disabled={pending || (!requiresAccount && !eligible.length)} onClick={() => { if (requiresAccount) onRequestAccount(); else setPickerOpen(true); }}>
          {localize_components_pages_MasteryPlanner.text(en, "additional1", { choice1: ((en)) && (selected) ? "yes" : "no", choice2: (!(en)) && (selected) ? "yes" : "no" })}
        </SetupActionButton>
      </div>
      {!requiresAccount && !pending && !eligible.length ? <p className="text-sm text-muted-foreground">{intl("components_pages_MasteryPlanner.yourBoxHasNoOwnedE2OperatorsImportOr")}</p> : null}
      <div className="flex flex-wrap items-end gap-x-8 gap-y-4">
        <div className="grid gap-2"><span className="text-xs text-muted-foreground">{intl("components_pages_MasteryPlanner.currentMastery")}</span><Tabs value={String(current)} onValueChange={(value) => { const next = Number(value) as 0|1|2; setCurrent(next); if (target <= next) setTarget((next+1) as 1|2|3); }}><TabsList aria-label={intl("components_pages_MasteryPlanner.currentMastery")}>
          {[0,1,2].map((level) => <TabsTrigger key={level} value={String(level)}>{level === 0 ? (intl("components_pages_MasteryPlanner.untrained")) : (intl("components_pages_MasteryPlanner.m", { level: level }))}</TabsTrigger>)}
        </TabsList></Tabs></div>
        <div className="grid gap-2"><span className="text-xs text-muted-foreground">{intl("components_pages_MasteryPlanner.targetMastery")}</span><Tabs value={String(target)} onValueChange={(value) => setTarget(Number(value) as 1|2|3)}><TabsList aria-label={intl("components_pages_MasteryPlanner.targetMastery")}>
          {[1,2,3].map((level) => <TabsTrigger key={level} value={String(level)} disabled={level <= current}>{intl("components_pages_MasteryPlanner.m", { level: level })}</TabsTrigger>)}
        </TabsList></Tabs></div>
        <SetupActionButton variant={controlBonus ? "default" : "outline"} aria-pressed={controlBonus} onClick={() => setControlBonus((value) => !value)}>{intl("components_pages_MasteryPlanner.controlCenter5")}</SetupActionButton>
      </div>
      <p className="text-xs leading-5 text-muted-foreground">{intl("components_pages_MasteryPlanner.enterTheCurrentMasteryOfTheSkillYouPlan")}</p>
      <details className="min-w-0 border-t border-border pt-4">
        <summary className="cursor-pointer text-sm font-medium">{intl("components_pages_MasteryPlanner.advancedSettings")}</summary>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <label className="grid gap-2 text-xs">{intl("components_pages_MasteryPlanner.handoffBufferMinutes")}<Input type="number" min={0} step={0.5} value={Number.isFinite(bufferMinutes) ? bufferMinutes : ""} onChange={(e) => setBufferMinutes(e.target.valueAsNumber)} /></label>
          {environmentKeys.map((key) => <label key={key} className="grid gap-2 text-xs">{en ? MASTERY_ENVIRONMENTS[key]!.english : MASTERY_ENVIRONMENTS[key]!.label}<Input type="number" min={0} max={MASTERY_ENVIRONMENTS[key]!.max ?? 10000} step={1} value={Number.isFinite(environment[key] ?? 0) ? environment[key] ?? 0 : ""} onChange={(e) => setEnvironment((previous) => ({...previous,[key]:e.target.valueAsNumber}))} /></label>)}
        </div>
        <p className="mt-3 text-xs leading-5 text-muted-foreground">{intl("components_pages_MasteryPlanner.environmentCountsReferToOperatorsActuallyStationedInThe")}</p>
      </details>
      <div className="flex flex-wrap items-center gap-4">
        <SetupActionButton disabled={pending || requiresAccount || !selected} onClick={() => {
          setCopied(false); setError(null);
          try { setCalculation({ signature, result: calculateMastery(input) }); } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
        }}>{intl("components_pages_MasteryPlanner.generatePlans")}</SetupActionButton>
        <span className="text-xs text-muted-foreground">{intl("components_pages_MasteryPlanner.computedLocallyNoBaseScheduleRequired")}</span>
      </div>
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
    </div>

    <p className="text-xs leading-5 text-muted-foreground">{conditions}</p>
    {stale ? <p role="status" className="rounded-[4px] border border-border p-4 text-sm">{intl("components_pages_MasteryPlanner.inputsOrBoxChangedGeneratePlansAgainToSee")}</p> : null}
    {plan && calculation ? <div ref={resultsRef} className="grid min-w-0 scroll-mt-[calc(5rem+env(safe-area-inset-top))] gap-4 md:scroll-mt-6" data-mastery-results>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs value={mode} onValueChange={(value) => { setMode(value as "simple"|"fast"); setCopied(false); }}><TabsList aria-label={intl("components_pages_MasteryPlanner.planStyle")}><TabsTrigger value="simple">{intl("components_pages_MasteryPlanner.simple")}</TabsTrigger><TabsTrigger value="fast">{intl("components_pages_MasteryPlanner.fast")}</TabsTrigger></TabsList></Tabs>
        <SetupActionButton variant="outline" onClick={() => void copyPlan()}>{copied ? (intl("components_pages_MasteryPlanner.copied")) : (intl("components_pages_MasteryPlanner.copyInstructions"))}</SetupActionButton>
      </div>
      <InfraTechnicalCard group="training" className="p-5 sm:p-6">
        <InfraTechnicalHeading icon={<Timer className="size-4" />}>{intl("components_pages_MasteryPlanner.estimatedCompletionTime")}</InfraTechnicalHeading>
        <div className="mt-4 flex flex-wrap items-baseline gap-x-6 gap-y-2"><strong className="font-number text-3xl">{formatMasteryTime(plan.totalSeconds)}</strong><span className="text-sm text-white/75">{intl("components_pages_MasteryPlanner.trainerChanges", { switches: plan.switches })}</span>
          {mode === "fast" ? <span className="text-sm text-white/75">{intl("components_pages_MasteryPlanner.timeSaved")} {formatMasteryTime(Math.max(0,calculation.result.simple.totalSeconds-plan.totalSeconds))}</span> : null}</div>
        <p className="mt-3 text-xs leading-5 text-white/65">{settingsSummary}</p>
      </InfraTechnicalCard>
      <p className="text-xs text-muted-foreground">{intl("components_pages_MasteryPlanner.timesAreRelativeToTheStartFinishAndStart")}</p>
      <div className="grid gap-4">
        {masteryInstructions(plan,en,displayName).map((steps,index) => <article key={plan.stages[index]!.level} className="rounded-[4px] border border-border bg-card p-4 sm:p-5">
          <h2 className="mb-4 flex flex-wrap items-center gap-3 text-base font-semibold">{intl("components_pages_MasteryPlanner.mastery", { value1: plan.stages[index]!.level })}<span className="font-number text-sm font-normal text-muted-foreground">{formatMasteryTime(plan.stages[index]!.seconds)}</span>{plan.stages[index]!.activateWith ? <span className="text-xs font-normal">{intl("components_pages_MasteryPlanner.50Reduction")}</span> : null}</h2>
          <div className="mb-4 flex flex-wrap gap-3">{plan.stages[index]!.segments.filter((s) => s.trainerId).map((segment,i) => {
            const operator = normalizedBox.find((o) => o.id === segment.trainerId);
            const portrait = catalog.find((o) => o.id === segment.trainerId)?.portrait;
            return <MasteryTrainerTooltip key={`${segment.trainerId}:${i}`} name={segment.trainerName} currentElite={operator?.elite} currentLevel={operator?.level} highlightedSkillIds={segment.skillIds}
              trigger={<button type="button" className="flex min-w-0 items-center gap-2 rounded-[4px] border border-border p-2 text-left" aria-label={intl("components_pages_MasteryPlanner.showInfrastructureSkills", { value1: (en) ? (displayName(segment.trainerName)) : "", trainerName: (en) ? "" : (segment.trainerName) })}><OperatorIdentity compact name={segment.trainerName} portrait={portrait}><span className="text-xs text-muted-foreground">{intl("components_pages_MasteryPlanner.trainer")}</span></OperatorIdentity></button>} />;
          })}</div>
          <ol className="grid gap-3">{steps.map((step,i) => <li key={i} className="grid grid-cols-[5.75rem_minmax(0,1fr)] items-start gap-3 text-sm"><span className="font-number pt-0.5 text-xs text-muted-foreground">+{formatMasteryTime(step.elapsed)}</span><span className={step.kind === "notice" ? "text-muted-foreground" : "font-medium"}>{step.text}</span></li>)}</ol>
        </article>)}
      </div>
    </div> : null}
    {(pickerOpen || pickerRequested) && !pending && !requiresAccount && operbox ? <Suspense fallback={<Skeleton className="h-40" />}><TargetPicker operbox={operbox} selectedId={selectedId} onClose={() => { setPickerOpen(false); onPickerRequestConsumed(); }} onSelect={(id) => { setSelectedId(id); setPickerOpen(false); onPickerRequestConsumed(); setError(null); }} /></Suspense> : null}
  </section>;
}
