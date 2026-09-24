"use client";

import { useCallback, useEffect, useState } from "react";
import { ClipboardList, Upload } from "lucide-react";

import { getGameReport, postGameReport } from "@/api";
import { FileUploadDialog } from "@/components/FileUploadDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { GAME_REPORT_KEYS, gameReportAverage, parseGameReportDays, type GameReportRecord, type GameReportSource } from "@/game-report";
import { recognizeReport } from "@/report-recognition/recognize";
import { RECOGNITION_CONFIDENT_DISTANCE, type ReportMetricKey } from "@/report-recognition/types";

const LABELS: Record<ReportMetricKey, [string, string]> = {
  experience: ["作战记录经验", "EXP"],
  goldValue: ["贵金属价值", "Gold value"],
  lmd: ["龙门币贸易", "LMD trade"],
  orderCount: ["龙门币订单数量", "LMD orders"],
  orundum: ["合成玉", "Orundum"],
};
type Draft = Record<ReportMetricKey, string>;
const blankDay = (): Draft => ({ experience: "", goldValue: "", lmd: "", orderCount: "", orundum: "" });

export function AccountHealthReportSection({ en, authenticated, onRecordChange }: { en: boolean; authenticated: boolean; onRecordChange: (value: GameReportRecord | null) => void }) {
  const [mode, setMode] = useState<GameReportSource>("screenshot");
  const [draft, setDraft] = useState<[Draft, Draft, Draft]>([blankDay(), blankDay(), blankDay()]);
  const [record, setRecord] = useState<GameReportRecord | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!authenticated) { setRecord(null); onRecordChange(null); return; }
    setLoading(true);
    try {
      const latest = await getGameReport();
      setRecord(latest);
      onRecordChange(latest);
      if (latest) {
        setDraft(latest.days.map((day) => Object.fromEntries(GAME_REPORT_KEYS.map((key) => [key, day[key] === undefined ? "" : String(day[key])]))) as [Draft, Draft, Draft]);
        setMode(latest.sourceType);
      }
      setError(null);
    } catch (cause) { setError(cause instanceof Error ? cause.message : (en ? "Could not load report" : "读取报表失败")); }
    finally { setLoading(false); }
  }, [authenticated, en, onRecordChange]);
  useEffect(() => { void load(); }, [load]);

  async function handleImage(file: File, signal: AbortSignal) {
    if (!file.type.startsWith("image/") || file.size > 15 * 1024 * 1024) throw new Error(en ? "Choose a PNG or JPEG under 15 MB." : "请选择小于 15 MB 的 PNG 或 JPEG 图片。");
    const bitmap = await createImageBitmap(file);
    try {
      if (signal.aborted) return;
      if (bitmap.width * bitmap.height > 16_000_000) throw new Error(en ? "Image is too large." : "图片像素过大。");
      const canvas = document.createElement("canvas");
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) throw new Error(en ? "Image cannot be decoded." : "无法解码图片。");
      context.drawImage(bitmap, 0, 0);
      const result = recognizeReport(context.getImageData(0, 0, bitmap.width, bitmap.height));
      if (signal.aborted) return;
      if ("ok" in result) throw new Error(en ? "Report panels were not found. Upload a complete screenshot." : "未找到简报面板，请上传完整原图。");
      if (result.kind === "single-day") {
        setDraft([blankDay(), blankDay(), blankDay()]);
        setNotice(en ? "Please submit a three-day report." : "请提交三日报表。");
        setError(null);
        return;
      }
      const uncertain: string[] = [];
      const needsManualReading = file.type === "image/jpeg" || result.warnings.includes("low-resolution") || result.warnings.includes("odd-aspect-ratio");
      const next = result.days.map((day, index) => {
        const item = blankDay();
        for (const key of GAME_REPORT_KEYS) {
          const found = day[key];
          if (found && !needsManualReading && found.maxDistance <= RECOGNITION_CONFIDENT_DISTANCE) item[key] = String(found.value);
          else uncertain.push(`${index + 1}: ${en ? LABELS[key][1] : LABELS[key][0]}`);
        }
        return item;
      }) as [Draft, Draft, Draft];
      setDraft(next);
      setMode("screenshot");
      setNotice(uncertain.length || result.warnings.length || file.type === "image/jpeg"
        ? (en ? "Check the screenshot values and fill any empty fields before saving." : "请核对识别数值，补齐空白项后再保存。")
        : (en ? "Recognition complete. Check all values before saving." : "识别完成，请核对全部数值后保存。"));
      setError(null);
    } finally { bitmap.close(); }
  }

  function update(day: number, key: ReportMetricKey, value: string) {
    if (!/^\d{0,8}$/.test(value)) return;
    setDraft((current) => current.map((item, index) => index === day ? { ...item, [key]: value } : item) as [Draft, Draft, Draft]);
  }

  const parsed = parseGameReportDays(draft.map((day) => Object.fromEntries(GAME_REPORT_KEYS.map((key) => [key, day[key] === "" ? null : Number(day[key])]))), true);
  async function save() {
    if (!parsed || !authenticated) return;
    setSaving(true);
    try {
      const saved = await postGameReport(parsed, mode);
      setRecord(saved);
      onRecordChange(saved);
      setError(null);
      setNotice(en ? "Three-day report saved." : "三日报表已保存。");
    } catch (cause) { setError(cause instanceof Error ? cause.message : (en ? "Could not save report" : "保存报表失败")); }
    finally { setSaving(false); }
  }
  const average = record ? gameReportAverage(record.days) : null;

  return <section className="min-w-0 rounded-[4px] border border-border bg-card p-4 sm:p-5" aria-labelledby="game-report-title" data-game-report-section>
    <h2 id="game-report-title" className="flex items-center gap-2 text-base font-semibold"><ClipboardList className="size-4" aria-hidden="true" />{en ? "Three-day base report" : "基建三日报表"}</h2>
    <Tabs value={mode} onValueChange={(value) => setMode(value as GameReportSource)} className="mt-4">
      <TabsList aria-label={en ? "Report entry method" : "报表录入方式"}><TabsTrigger value="screenshot">{en ? "Screenshot" : "上传截图识别"}</TabsTrigger><TabsTrigger value="manual">{en ? "Manual" : "手动填写"}</TabsTrigger></TabsList>
      <TabsContent value="screenshot" className="pt-4"><FileUploadDialog title={en ? "Upload base report" : "上传基建三日报表"} description={en ? "Use a complete, original screenshot." : "请上传完整原图。"} extensions={[".png", ".jpg", ".jpeg"]} onFiles={([file], signal) => handleImage(file!, signal)} trigger={<Button type="button" variant="outline"><Upload />{en ? "Choose screenshot" : "选择截图"}</Button>} /></TabsContent>
      <TabsContent value="manual" className="pt-4"><p className="text-sm text-muted-foreground">{en ? "Enter the three days from left to right, oldest first." : "按游戏画面从左到右填写三天数据，最右侧为最新一天。"}</p></TabsContent>
    </Tabs>
    {notice ? <p className="mt-3 text-sm text-amber-700 dark:text-amber-300" role="status">{notice}</p> : null}
    {error ? <p className="mt-3 text-sm text-destructive" role="alert">{error}</p> : null}
    <div className="mt-4 max-w-full overflow-x-auto"><table className="w-full min-w-[580px] border-collapse text-sm"><thead><tr className="border-b border-border"><th className="py-2 text-left font-medium">{en ? "Metric" : "指标"}</th>{[0, 1, 2].map((day) => <th key={day} className="px-2 py-2 text-left font-medium">{en ? `Day ${day + 1}` : `第 ${day + 1} 天`}</th>)}</tr></thead><tbody>{GAME_REPORT_KEYS.map((key) => <tr key={key} className="border-b border-border/60"><th scope="row" className="py-2 pr-3 text-left font-normal text-muted-foreground">{en ? LABELS[key][1] : LABELS[key][0]}</th>{draft.map((day, index) => <td key={index} className="px-2 py-2"><Input inputMode="numeric" pattern="[0-9]*" value={day[key]} onChange={(event) => update(index, key, event.target.value)} aria-label={`${en ? LABELS[key][1] : LABELS[key][0]} ${en ? `day ${index + 1}` : `第 ${index + 1} 天`}`} className="h-10 min-w-0" /></td>)}</tr>)}</tbody></table></div>
    <div className="mt-4 flex flex-wrap items-center gap-3"><Button type="button" disabled={!parsed || saving || !authenticated} onClick={() => void save()}>{saving ? (en ? "Saving…" : "保存中…") : (en ? "Confirm and save" : "确认并保存")}</Button>{!authenticated ? <p className="text-sm text-muted-foreground">{en ? "Sign in to save this report." : "登录网站账号后可保存报表。"}</p> : null}</div>
    {record ? <div className="mt-6 border-t border-border/70 pt-4" data-game-report-average><p className="text-sm font-medium">{en ? "Latest saved report · daily average" : "最近保存的报表 · 三日日均"}</p><dl className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-5">{GAME_REPORT_KEYS.map((key) => <div key={key}><dt className="text-muted-foreground">{en ? LABELS[key][1] : LABELS[key][0]}</dt><dd className="mt-1 font-number text-lg tabular-nums">{average?.[key] === undefined ? "—" : Math.round(average[key]!)}</dd></div>)}</dl><p className="mt-3 text-xs text-muted-foreground">{new Date(record.createdAt).toLocaleString(en ? "en-US" : "zh-CN")} · {record.sourceType === "screenshot" ? (en ? "Screenshot" : "截图识别") : (en ? "Manual" : "手动填写")}</p></div> : loading ? <p className="mt-4 text-sm text-muted-foreground">{en ? "Loading saved report…" : "正在读取已存报表…"}</p> : null}
  </section>;
}
