"use client";

import { FlaskConical, Loader2 } from "lucide-react";
import { useMemo, useRef, useState } from "react";

import { ManualOperboxPicker } from "@/components/setup/ManualOperboxPicker";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useLanguageDemo } from "@/language-demo";
import { cn } from "@/lib/utils";
import type { MaaRoom, OperBoxEntry, PublicPlanData } from "@/types";
import { hasOperboxEliteStateChange } from "@/upgrade-simulation";

type Metric = "trade" | "manufacture" | "power";

const METRICS: Array<{ key: Metric; en: string; zh: string }> = [
  { key: "trade", en: "Trading", zh: "贸易" },
  { key: "manufacture", en: "Manufacturing", zh: "制造" },
  { key: "power", en: "Power", zh: "发电" },
];

function metric(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value)
    ? `${value.toFixed(1).replace(/\.?0+$/, "")}%`
    : "—";
}

function delta(before: number | null | undefined, after: number | null | undefined, en: boolean) {
  if (typeof before !== "number" || typeof after !== "number") return "—";
  const value = Math.round((after - before) * 10) / 10;
  return value === 0 ? (en ? "No change" : "持平") : `${value > 0 ? "+" : ""}${value.toFixed(1).replace(/\.?0+$/, "")}%`;
}

export function UpgradeSimulationDialog({
  operbox,
  baseline,
  disabled = false,
  onSimulate,
  onTrialReady,
}: {
  operbox: OperBoxEntry[];
  baseline: PublicPlanData;
  disabled?: boolean;
  onSimulate: (trialOperbox: OperBoxEntry[]) => Promise<PublicPlanData>;
  onTrialReady?: (trial: PublicPlanData) => void;
}) {
  const { locale } = useLanguageDemo();
  const en = locale === "en";
  const [open, setOpen] = useState(false);
  const [trial, setTrial] = useState<PublicPlanData | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pendingRef = useRef(false);
  const scheduledOperatorShifts = useMemo(() => {
    const shiftsByName: Record<string, number[]> = {};
    baseline.maa.plans.slice(0, 3).forEach((plan, planIndex) => {
      const shift = planIndex + 1;
      (Object.values(plan.rooms) as Array<MaaRoom[] | undefined>)
        .flatMap((rooms) => rooms ?? [])
        .flatMap((room) => room.operators)
        .forEach((operator) => {
          const name = typeof operator === "string" ? operator : operator?.name;
          if (!name) return;
          const shifts = shiftsByName[name] ?? [];
          if (!shifts.includes(shift)) shiftsByName[name] = [...shifts, shift];
        });
    });
    return shiftsByName;
  }, [baseline.maa.plans]);
  const scheduledOperatorNames = useMemo(() => Object.keys(scheduledOperatorShifts), [scheduledOperatorShifts]);

  const apply = async (nextBox: OperBoxEntry[]) => {
    if (pendingRef.current) return;
    if (!hasOperboxEliteStateChange(operbox, nextBox)) {
      setError(en
        ? "Change at least one operator's ownership or elite stage before running the simulation."
        : "请至少调整一名干员的精英化状态后再运行试算。");
      return;
    }

    pendingRef.current = true;
    setPending(true);
    setError(null);
    setTrial(null);
    try {
      const nextTrial = await onSimulate(nextBox);
      setTrial(nextTrial);
      onTrialReady?.(nextTrial);
      setOpen(false);
    } catch (reason) {
      setError(reason instanceof Error
        ? reason.message
        : en ? "Progression adjustment failed. Please try again later." : "调整练度试算失败，请稍后重试。");
    } finally {
      pendingRef.current = false;
      setPending(false);
    }
  };

  return (
    <>
      <Button type="button" variant="outline" size="sm" className="h-9 min-h-0 max-sm:h-11" disabled={disabled} onClick={() => setOpen(true)}>
        <FlaskConical />{en ? "Adjust progression" : "调整练度"}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent data-upgrade-simulation-dialog className="h-[min(720px,calc(100dvh-1rem))] max-w-[calc(100%-1rem)] grid-rows-[auto_minmax(0,1fr)] gap-0 overflow-hidden rounded-[24px] p-0 sm:max-w-[min(1060px,calc(100%-2rem))] sm:rounded-[32px]" aria-describedby="upgrade-simulation-description">
          <DialogHeader className="border-b border-border/70 px-4 py-3 pr-14 sm:flex-row sm:items-center sm:gap-5 sm:px-6 sm:py-4 sm:pr-16">
            <DialogTitle className="shrink-0 text-lg">
              {en ? "Same-layout progression adjustment" : "同布局调整练度"}
            </DialogTitle>
            <DialogDescription id="upgrade-simulation-description" className="max-w-3xl leading-5">
              {en
                ? "Adjust ownership or elite stage and solve with the same base layout. Successful changes sync to the manual BOX; the current schedule stays available for comparison."
                : "调整干员持有或精英化状态，按当前布局重新求解；成功后同步到手动 BOX，当前班表保留用于对比。"}
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="min-h-0" viewportClassName="overflow-x-hidden">
            <div className="px-4 py-3 sm:px-6 sm:py-4">
              <ManualOperboxPicker
                compact
                operbox={operbox}
                scheduledOperatorNames={scheduledOperatorNames}
                scheduledOperatorShifts={scheduledOperatorShifts}
                scheduledShiftCount={Math.min(3, baseline.maa.plans.length)}
                title={en ? "Operators for this simulation" : "本次试算干员"}
                description={en
                  ? "Change at least one operator; this selection is shared with Schedule Settings."
                  : "至少调整一名干员；这里的选择会与排班设置同步。"}
                applyLabel={pending
                  ? (en ? "Solving again…" : "正在重新求解…")
                  : (en ? "Solve with adjustments" : "按调整重新试算")}
                applyDisabled={pending}
                onApply={(entries) => void apply(entries)}
              />
              {pending ? (
                <p className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" />
                  {en ? "Solving again with the same layout…" : "正在按同一布局重新求解…"}
                </p>
              ) : null}
              {error ? <p className="mt-3 border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive" role="alert">{error}</p> : null}
              {trial ? (
                <section className="mt-3 flex flex-wrap items-center gap-3 border border-primary/25 bg-primary/5 px-3 py-2.5" aria-label={en ? "Progression adjustment result" : "调整练度结果"}>
                  <div className="min-w-48 flex-1">
                    <h3 className="font-semibold">{en ? "Simulation complete" : "试算完成"}</h3>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {en ? "The manual BOX is synced. Switch between both schedules on the main screen." : "手动 BOX 已同步，可在主界面切换当前方案与调整练度方案。"}
                    </p>
                  </div>
                  <dl className="grid w-full grid-cols-3 divide-x divide-primary/15 border border-primary/15 bg-background sm:w-auto">
                    {METRICS.map(({ key, en: englishLabel, zh }) => {
                      const change = delta(baseline.rotation.daily[key], trial.rotation.daily[key], en);
                      return (
                        <div key={key} className="min-w-24 px-3 py-1.5">
                          <dt className="text-[11px] text-muted-foreground">{en ? englishLabel : zh}</dt>
                          <dd className="font-number text-base font-semibold">{metric(trial.rotation.daily[key])}</dd>
                          <span className={cn("block text-[11px] font-medium", change.startsWith("+") ? "text-emerald-700" : change.startsWith("-") ? "text-red-700" : "text-muted-foreground")}>
                            {en ? `vs current ${change}` : `较当前 ${change}`}
                          </span>
                        </div>
                      );
                    })}
                  </dl>
                </section>
              ) : null}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </>
  );
}
