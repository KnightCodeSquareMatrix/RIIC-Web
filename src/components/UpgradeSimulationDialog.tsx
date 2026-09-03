"use client";

import { FlaskConical, Loader2, TrendingUp } from "lucide-react";
import { useRef, useState } from "react";

import { ManualOperboxPicker } from "@/components/setup/ManualOperboxPicker";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
  const scheduledOperatorNames = baseline.maa.plans.flatMap((plan) => (
    Object.values(plan.rooms) as Array<MaaRoom[] | undefined>
  ).flatMap((rooms) => (rooms ?? []).flatMap((room) => room.operators.flatMap((operator) => (
    typeof operator === "string" ? [operator] : operator?.name ? [operator.name] : []
  )))));

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
    } catch (reason) {
      setError(reason instanceof Error
        ? reason.message
        : en ? "Upgrade simulation failed. Please try again later." : "升级试算失败，请稍后重试。");
    } finally {
      pendingRef.current = false;
      setPending(false);
    }
  };

  return (
    <>
      <Button type="button" variant="outline" size="sm" className="min-h-11" disabled={disabled} onClick={() => setOpen(true)}>
        <FlaskConical />{en ? "Upgrade simulation" : "升级试算"}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[calc(100dvh-1rem)] w-[calc(100%-1rem)] max-w-[min(90rem,calc(100%-1rem))] overflow-y-auto p-0 sm:w-[calc(100%-2rem)] sm:max-w-[min(90rem,calc(100%-2rem))]" aria-describedby="upgrade-simulation-description">
          <DialogHeader className="border-b border-border/70 px-5 py-5 sm:px-7">
            <DialogTitle className="flex items-center gap-2 text-xl">
              <TrendingUp className="size-5" />{en ? "Same-layout upgrade simulation" : "同布局升级试算"}
            </DialogTitle>
            <DialogDescription id="upgrade-simulation-description" className="mt-2 leading-6">
              {en
                ? "Operators in this schedule are shown first. Switch to Not scheduled to search for any operator and change their elite stage. Unowned operators can be included as a hypothetical upgrade without changing your BOX or current schedule."
                : "默认先看本次上岗干员。需要补人时切到“未进排班”，再搜索任意干员并调整精英化状态；未拥有干员会作为假设获得加入本次计算，不会改动 BOX 或当前班表。"}
            </DialogDescription>
          </DialogHeader>
          <div className="px-5 py-5 sm:px-7">
            <ManualOperboxPicker
              operbox={operbox}
              scheduledOperatorNames={scheduledOperatorNames}
              title={en ? "Choose operators to simulate" : "选择要试算的干员"}
              description={en
                ? "Change at least one operator's ownership or elite stage. You can search for unowned operators and assign any available elite stage."
                : "至少调整一名干员的精英化状态；可以搜索未拥有干员并设置任意精英化阶段。"}
              applyLabel={pending
                ? (en ? "Solving again…" : "正在重新求解…")
                : (en ? "Run upgrade simulation" : "运行升级试算")}
              applyDisabled={pending}
              onApply={(entries) => void apply(entries)}
            />
            {pending ? (
              <p className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                {en ? "Solving again with the same layout…" : "正在按同一布局重新求解…"}
              </p>
            ) : null}
            {error ? <p className="mt-4 border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive" role="alert">{error}</p> : null}
            {trial ? (
              <section className="mt-5 border border-primary/25 bg-primary/5 p-4" aria-label={en ? "Upgrade simulation result" : "升级试算结果"}>
                <h3 className="font-semibold">{en ? "Simulation complete" : "试算完成"}</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  {en
                    ? "Use the Current plan / Upgrade simulation controls on the main screen to inspect both complete schedules."
                    : "已在主界面新增“当前方案 / 升级试算方案”切换，可直接查看两份完整班表。"}
                </p>
                <dl className="mt-4 grid grid-cols-3 gap-2">
                  {METRICS.map(({ key, en: englishLabel, zh }) => {
                    const change = delta(baseline.rotation.daily[key], trial.rotation.daily[key], en);
                    return (
                      <div key={key} className="border border-primary/15 bg-background p-3">
                        <dt className="text-xs text-muted-foreground">{en ? `${englishLabel} efficiency` : `${zh}效率`}</dt>
                        <dd className="mt-1 font-number text-lg font-semibold">{metric(trial.rotation.daily[key])}</dd>
                        <span className={cn("mt-1 block text-xs font-medium", change.startsWith("+") ? "text-emerald-700" : change.startsWith("-") ? "text-red-700" : "text-muted-foreground")}>
                          {en ? `vs current ${change}` : `较当前 ${change}`}
                        </span>
                      </div>
                    );
                  })}
                </dl>
              </section>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
