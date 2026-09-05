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
  open,
  disabled = false,
  showTrigger = true,
  onOpen,
  onOpenChange,
  onSimulate,
  onTrialReady,
}: {
  operbox: OperBoxEntry[];
  baseline: PublicPlanData;
  open: boolean;
  disabled?: boolean;
  showTrigger?: boolean;
  onOpen: () => void;
  onOpenChange: (open: boolean) => void;
  onSimulate: (trialOperbox: OperBoxEntry[]) => Promise<PublicPlanData>;
  onTrialReady?: (trial: PublicPlanData) => void;
}) {
  const { locale } = useLanguageDemo();
  const en = locale === "en";
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
        ? "Change at least one operator's ownership or elite stage before recalculating."
        : "请至少修改一名干员的持有或精英化状态后再重新计算。");
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
      onOpenChange(false);
    } catch (reason) {
      setError(reason instanceof Error
        ? reason.message
        : en ? "Recalculation with the updated progression failed. Please try again later." : "使用修改后的练度重新计算失败，请稍后重试。");
    } finally {
      pendingRef.current = false;
      setPending(false);
    }
  };

  return (
    <>
      {showTrigger ? (
        <Button type="button" variant="outline" size="sm" className="h-9 min-h-0 max-sm:h-11" disabled={disabled} onClick={onOpen}>
          <FlaskConical />{en ? "Modify progression and recalculate" : "修改练度并重算"}
        </Button>
      ) : null}
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent data-upgrade-simulation-dialog className="h-[min(720px,calc(100dvh-1rem))] max-w-[calc(100%-1rem)] grid-rows-[auto_minmax(0,1fr)] gap-0 overflow-hidden rounded-[24px] p-0 sm:max-w-[min(1060px,calc(100%-2rem))] sm:rounded-[32px]" aria-describedby="upgrade-simulation-description">
          <DialogHeader className="border-b border-border/70 px-4 py-3 pr-14 sm:flex-row sm:items-center sm:gap-5 sm:px-6 sm:py-4 sm:pr-16">
            <DialogTitle className="shrink-0 text-lg">
              {en ? "Modify progression and recalculate" : "修改练度并重新计算"}
            </DialogTitle>
            <DialogDescription id="upgrade-simulation-description" className="max-w-3xl leading-5">
              {en
                ? "Update ownership or elite stage and recalculate with the same layout. After success, the current BOX is updated and the original plan remains available for comparison."
                : "修改干员持有或精英化状态，并按当前布局重新计算；成功后会更新当前 BOX，同时保留原方案用于对比。"}
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="min-h-0" viewportClassName="overflow-x-hidden">
            <div className="px-4 py-3 sm:px-6 sm:py-4">
              <ManualOperboxPicker
                compact
                showProfessionFilter
                operbox={operbox}
                scheduledOperatorNames={scheduledOperatorNames}
                scheduledOperatorShifts={scheduledOperatorShifts}
                scheduledShiftCount={Math.min(3, baseline.maa.plans.length)}
                title={en ? "Operators for this recalculation" : "本次重新计算使用的干员"}
                description={en
                  ? "Change at least one operator. These updates are saved to the same BOX used by Schedule Settings."
                  : "请至少修改一名干员；这里的修改会保存到排班设置使用的同一个 BOX。"}
                applyLabel={pending
                  ? (en ? "Solving again…" : "正在重新求解…")
                  : (en ? "Save progression and recalculate" : "保存练度并重新计算")}
                applyDisabled={pending}
                onApply={(entries) => void apply(entries)}
              />
              {pending ? (
                <p className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" />
                  {en ? "Recalculating with the updated progression and same layout…" : "正在使用修改后的练度按同一布局重新计算…"}
                </p>
              ) : null}
              {error ? <p className="mt-3 border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive" role="alert">{error}</p> : null}
              {trial ? (
                <section className="mt-3 flex flex-wrap items-center gap-3 border border-primary/25 bg-primary/5 px-3 py-2.5" aria-label={en ? "Progression recalculation result" : "练度重新计算结果"}>
                  <div className="min-w-48 flex-1">
                    <h3 className="font-semibold">{en ? "Recalculation complete" : "重新计算完成"}</h3>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {en ? "The BOX is updated. Switch between the original and progression-adjusted plans on the main screen." : "当前 BOX 已更新，可在主界面切换原方案与练度调整后方案。"}
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
