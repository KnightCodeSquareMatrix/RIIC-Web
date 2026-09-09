"use client";

import { useLocale } from "next-intl";
import { useMemo, useRef, useState } from "react";
import { FileUp, GitCompareArrows } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { localizedOperatorName } from "@/i18n/game-data";
import { useGameCatalog } from "@/i18n/game-data-client";
import { compareMaaWithBox, type JobOperatorComparison } from "@/job-comparison";
import { normalizeMaaScheduleForManualImport, parseMaaScheduleText } from "@/manual-schedule";
import type { MaaJson, OperBoxEntry } from "@/types";

export interface JobComparisonProps {
  operbox: OperBoxEntry[] | null;
  requiresAccount: boolean;
}

export function JobComparison({ operbox, requiresAccount }: JobComparisonProps) {
  const locale = useLocale();
  const catalog = useGameCatalog();
  const fileRef = useRef<HTMLInputElement>(null);
  const [maa, setMaa] = useState<MaaJson | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<JobOperatorComparison | null>(null);
  const comparison = useMemo(() => maa && operbox ? compareMaaWithBox(maa, operbox) : [], [maa, operbox]);
  const missing = comparison.filter((item) => item.missing > 0);
  const requiredTotal = comparison.reduce((sum, item) => sum + item.required, 0);

  async function importJob(file: File) {
    setError(null);
    try {
      const parsed = normalizeMaaScheduleForManualImport(parseMaaScheduleText(await file.text()));
      setMaa(parsed);
      setFileName(file.name);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "无法读取 MAA 排班文件。");
      setMaa(null);
      setFileName(null);
    }
  }

  return (
    <section className="grid min-w-0 gap-5 py-5" data-job-comparison>
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2.5 text-lg font-semibold"><span className="h-6 w-1.5 bg-cyan-500" /><GitCompareArrows className="size-5 text-cyan-600" />作业对比</h1>
          <p className="mt-2 text-sm text-muted-foreground">导入别人的 MAA 排班，查看自己的 Box 缺少哪些干员。</p>
        </div>
        <input ref={fileRef} className="sr-only" type="file" accept=".json,application/json" onChange={(event) => { const file = event.target.files?.[0]; if (file) void importJob(file); event.currentTarget.value = ""; }} />
        <Button type="button" variant="outline" onClick={() => fileRef.current?.click()}><FileUp />导入 MAA 作业</Button>
      </header>

      {requiresAccount || !operbox ? <div className="border border-border bg-muted/30 p-5 text-sm text-muted-foreground">登录并准备自己的 Box 后，才能进行缺口对比。</div> : null}
      {error ? <div role="alert" className="border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">{error}</div> : null}
      {fileName ? <p className="text-xs text-muted-foreground">当前作业：{fileName} · {maa?.plans.length ?? 0} 个班次</p> : null}

      {maa && operbox ? (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <Metric label="作业干员位置" value={requiredTotal} />
            <Metric label="需要干员种类" value={comparison.length} />
            <Metric label="Box 缺口种类" value={missing.length} accent={missing.length > 0} />
          </div>
          <section className="grid gap-3" aria-label="作业干员对比">
            <div className="flex items-center justify-between"><h2 className="text-sm font-semibold">干员缺口</h2><span className="text-xs text-muted-foreground">点击干员查看需求数量</span></div>
            <div className="grid gap-2 md:grid-cols-2">
              {comparison.map((item) => <button key={item.name} type="button" onClick={() => setSelected(item)} className="flex min-w-0 items-center justify-between gap-3 rounded-[4px] border border-border bg-background p-3 text-left hover:bg-muted/50">
                <span className="min-w-0 truncate font-medium">{localizedOperatorName(item.name, locale, catalog)}</span>
                <span className={item.missing ? "shrink-0 text-sm text-destructive" : "shrink-0 text-sm text-emerald-600"}>{item.missing ? `缺少 ${item.missing}` : "已满足"}</span>
              </button>)}
            </div>
          </section>
        </>
      ) : <div className="grid min-h-64 place-items-center border border-dashed border-border text-sm text-muted-foreground">导入 MAA 作业后显示对比结果。</div>}

      <Dialog open={Boolean(selected)} onOpenChange={(open) => { if (!open) setSelected(null); }}>
        <DialogContent className="sm:max-w-md"><DialogHeader><DialogTitle>{selected ? localizedOperatorName(selected.name, locale, catalog) : "干员"}</DialogTitle><DialogDescription>该干员在作业中的需求与当前 Box 状态。</DialogDescription></DialogHeader>{selected ? <div className="grid gap-2 p-4 text-sm"><div className="flex justify-between"><span>作业需求</span><strong>{selected.required} 个位置</strong></div><div className="flex justify-between"><span>Box 可用</span><strong>{selected.available} 名</strong></div><div className="flex justify-between"><span>缺少</span><strong className={selected.missing ? "text-destructive" : "text-emerald-600"}>{selected.missing} 名</strong></div></div> : null}<DialogFooter><Button type="button" variant="outline" onClick={() => setSelected(null)}>关闭</Button></DialogFooter></DialogContent>
      </Dialog>
    </section>
  );
}

function Metric({ label, value, accent = false }: { label: string; value: number; accent?: boolean }) {
  return <div className="border border-border bg-muted/20 p-4"><p className="text-xs text-muted-foreground">{label}</p><strong className={accent ? "mt-1 block text-2xl text-destructive" : "mt-1 block text-2xl"}>{value}</strong></div>;
}
