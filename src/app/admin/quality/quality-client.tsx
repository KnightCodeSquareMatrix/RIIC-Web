"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { useLocale } from "next-intl";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ManualOperboxPicker } from "@/components/setup/ManualOperboxPicker";
import { RotationSettings } from "@/components/RotationSettings";
import { CompactScheduleView } from "@/components/CompactScheduleView";
import { PRESETS, maxRoomLevel, updateRoomLevel, updateFactoryRecipe, updateTradeOrder, factoryRecipeFor, tradeOrderFor } from "@/blueprint";
import { planToRows } from "@/schedule";
import { parseReproductionPackage, reproductionInputKey, type ReproductionPackage } from "@/reproduction-package";
import type { QualityDraftData, QualityBatchData, QualityVersion } from "@/quality";
import type { ApiResponse, MaaJson, RotationJson } from "@/types";

async function api<T>(query = "", body?: unknown): Promise<T> {
  const response = await fetch(`/api/admin/quality${query}`, body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : { cache: "no-store" });
  const envelope = await response.json() as ApiResponse<T>;
  if (!envelope.success) throw new Error(envelope.error.message);
  return envelope.data;
}
type PreviewEntry = { id: string; name: string; error: string | null };
type Overview = { versions: QualityVersion[]; batches: Omit<QualityBatchData, "cases">[]; drafts: Omit<QualityDraftData, "input" | "original">[]; isAdmin: boolean; worker: { at: string; syncError?: string } | null };
function download(name: string, value: unknown) {
  const href = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }));
  const link = document.createElement("a"); link.href = href; link.download = name; link.click(); URL.revokeObjectURL(href);
}

export function QualityWorkbench() {
  const en = useLocale() === "en";
  const t = (zh: string, english: string) => en ? english : zh;
  const params = useSearchParams();
  const [overview, setOverview] = useState<Overview | null>(null);
  const [draft, setDraft] = useState<QualityDraftData | null>(null);
  const [input, setInput] = useState<ReproductionPackage | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [preview, setPreview] = useState<PreviewEntry[]>([]);
  const [previewToken, setPreviewToken] = useState("");
  const [excluded, setExcluded] = useState<string[]>([]);
  const [preset, setPreset] = useState("");
  const [uploadRotation, setUploadRotation] = useState("");
  const [uploadFiammetta, setUploadFiammetta] = useState(false);
  const [candidate, setCandidate] = useState("");
  const [baseline, setBaseline] = useState("");
  const [batch, setBatch] = useState<QualityBatchData | null>(null);
  const [result, setResult] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [checkedAt, setCheckedAt] = useState(0);
  const versionsInitialized = useRef(false);
  const refresh = useCallback(async () => {
    const data = await api<Overview>(); setOverview(data);
    setCheckedAt(Date.now());
    if (!versionsInitialized.current && data.versions.length) {
      setCandidate(data.versions[0].id); setBaseline(data.versions[1]?.id ?? ""); versionsInitialized.current = true;
    } else if (versionsInitialized.current) {
      setCandidate((current) => data.versions.some((version) => version.id === current) ? current : data.versions[0]?.id ?? "");
      setBaseline((current) => data.versions.some((version) => version.id === current) ? current : "");
    }
  }, []);
  useEffect(() => { void refresh().catch((error: Error) => setError(error.message)); const timer = setInterval(() => { void refresh().catch((error: Error) => setError(error.message)); }, 5000); return () => clearInterval(timer); }, [refresh]);
  const draftId = params.get("draft");
  const draftIds = params.get("drafts");
  useEffect(() => { if (draftIds) setSelected(draftIds.split(",").filter(Boolean)); }, [draftIds]);
  useEffect(() => { if (draftId) { let active = true; void api<QualityDraftData>(`?kind=draft&id=${encodeURIComponent(draftId)}`).then((data) => { if (active) { setDraft(data); setInput(data.input); setSelected([data.id]); } }).catch((error: Error) => { if (active) setError(error.message); }); return () => { active = false; }; } }, [draftId]);
  const batchId = batch?.id;
  useEffect(() => { if (batchId) { const timer = setInterval(() => { void api<QualityBatchData>(`?kind=batch&id=${batchId}`).then(setBatch).catch((error: Error) => setError(error.message)); }, 2000); return () => clearInterval(timer); } }, [batchId]);
  async function perform(action: () => Promise<void>) { setBusy(true); setError(""); setNotice(""); try { await action(); } catch (error) { setError(error instanceof Error ? error.message : "Request failed"); } finally { setBusy(false); } }
  async function importFiles(files: FileList | null) {
    if (!files?.length) return;
    const form = new FormData(); Array.from(files).forEach((file) => form.append("files", file));
    if (preset && uploadRotation) form.set("settings", JSON.stringify({ layout: PRESETS.find((entry) => entry.label === preset)!.layout, rotation: uploadRotation, fiammetta_enable: uploadFiammetta }));
    const response = await fetch("/api/admin/quality/import", { method: "POST", body: form });
    const body = await response.json() as ApiResponse<{ entries: PreviewEntry[]; token: string }>;
    if (!body.success) throw new Error(body.error.message);
    setPreview(body.data.entries); setPreviewToken(body.data.token); setExcluded([]); setSelected([]);
  }
  async function acceptPreview() {
    const included = preview.filter((entry) => !excluded.includes(entry.id));
    if (!included.length || included.some((entry) => entry.error)) throw new Error(t("请明确排除所有无效项", "Explicitly exclude all invalid entries"));
    const ids = (await api<{ id: string }[]>("", { action: "acceptImport", token: previewToken, excluded })).map((draft) => draft.id);
    await refresh();
    setSelected(ids); setPreview([]); setNotice(t(`已准备 ${ids.length} 个用例`, `${ids.length} cases ready`));
  }
  const changed = draft && input && reproductionInputKey(draft.original) !== reproductionInputKey(input);
  return <main id="admin-content" className="mx-auto grid min-w-0 max-w-7xl gap-6 px-4 py-6 [overflow-wrap:anywhere] [&>section]:min-w-0 [&>section]:max-w-full [&>section]:grid-cols-1 [&>section>*]:min-w-0 sm:px-6">
    <header><h1 className="text-2xl font-semibold">{t("测试工作台", "Quality workbench")}</h1><p className="mt-2 text-sm text-muted-foreground">{t("独立草稿与后台测试。测试结果不会自动修改反馈结论。", "Independent drafts and background runs. Results never change feedback status automatically.")}</p></header>
    {error && <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-destructive">{error}</p>}{notice && <p role="status">{notice}</p>}
    <section className="grid gap-4 rounded-xl border bg-background p-4">
      <h2 className="font-semibold">{t("导入复现", "Import reproductions")}</h2>
      <p className="text-sm text-muted-foreground">{t("每批最多 500 个 JSON，单文件 2 MiB，ZIP 解压后总量 100 MiB。以下设置仅用于纯 box 文件。", "Up to 500 JSON cases, 2 MiB per file, 100 MiB expanded. Settings below apply only to box arrays.")}</p>
      <div className="flex flex-wrap gap-3">
        <label>{t("布局", "Layout")}<select value={preset} onChange={(e) => setPreset(e.target.value)} className="ml-2 rounded border p-2"><option value="">{t("请选择", "Choose")}</option>{PRESETS.map((p) => <option key={p.label}>{p.label}</option>)}</select></label>
        <label>{t("轮换", "Rotation")}<select className="ml-2 rounded border p-2" value={uploadRotation} onChange={(e) => setUploadRotation(e.target.value)}><option value="">{t("请选择", "Choose")}</option>{["abc_12_6_6", "main_backup_12_12", "abc_12_12_12"].map((value) => <option key={value}>{value}</option>)}</select></label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={uploadFiammetta} onChange={(e) => setUploadFiammetta(e.target.checked)} />Fiammetta</label>
      </div>
      <input aria-label={t("JSON 或 ZIP 文件", "JSON or ZIP files")} type="file" accept=".json,.zip" multiple disabled={busy} onChange={(e) => void perform(() => importFiles(e.target.files))} />
      {preview.length > 0 && <><ul className="max-h-72 overflow-auto">{preview.map((entry) => <li key={entry.id} className="flex items-start gap-3 border-b py-3"><label className="flex gap-2"><input type="checkbox" checked={excluded.includes(entry.id)} onChange={(e) => setExcluded((current) => e.target.checked ? [...current, entry.id] : current.filter((id) => id !== entry.id))} />{t("排除", "Exclude")}</label><span className="min-w-0 break-all">{entry.name}<span className={entry.error ? "block text-destructive" : "block text-muted-foreground"}>{entry.error ?? t("可导入", "Ready")}</span></span></li>)}</ul><Button disabled={busy || preview.some((entry) => entry.error && !excluded.includes(entry.id))} onClick={() => void perform(acceptPreview)}>{t("确认导入有效项", "Import included entries")}</Button></>}
    </section>
    {!!overview?.drafts.length && <section className="rounded-xl border bg-background p-4"><h2 className="font-semibold">{t("团队草稿", "Team drafts")}</h2><ul className="mt-3 max-h-60 overflow-auto">{overview.drafts.map((entry) => <li key={entry.id} className="flex items-center gap-3 border-b py-2"><input type="checkbox" aria-label={`${t("选择草稿", "Select draft")} ${entry.id}`} checked={selected.includes(entry.id)} onChange={(event) => setSelected((current) => event.target.checked ? [...new Set([...current, entry.id])] : current.filter((id) => id !== entry.id))} /><Link className="min-w-0 break-all underline" href={`/admin/quality?draft=${entry.id}`}>{entry.sources.map((source) => source.name).join(", ")}</Link><span className="ml-auto shrink-0 text-xs text-muted-foreground">{t("修订", "Revision")} {entry.revision}</span></li>)}</ul></section>}
    {draft && input && <section className="grid gap-4 rounded-xl border bg-background p-4">
      <h2 className="font-semibold">{t("复现草稿", "Reproduction draft")} · {changed ? t("已修改", "Modified") : t("原始输入", "Original input")}</h2>
      <div className="flex flex-wrap gap-3">{draft.sources.filter((source) => source.feedbackId).map((source) => <Link key={source.feedbackId} href={`/admin/issues?q=${source.feedbackId}`}>{t("返回反馈", "Back to feedback")} {source.name}</Link>)}<Button variant="outline" onClick={() => download("reproduction.json", input)}>{t("导出完整复现包", "Export reproduction")}</Button><Button variant="outline" onClick={() => setInput(structuredClone(draft.original))}>{t("恢复原始输入", "Restore original")}</Button></div>
      <label>{t("替换布局", "Replace layout")}<select className="ml-2 rounded border p-2" value="" onChange={(e) => { const selected = PRESETS.find((p) => p.label === e.target.value); if (selected) setInput({ ...input, layout: structuredClone(selected.layout) }); }}><option value="">{input.layout.template}</option>{PRESETS.map((p) => <option key={p.label}>{p.label}</option>)}</select></label>
      <div className="grid gap-2 sm:grid-cols-2">{input.layout.rooms.map((room) => <div key={room.id} className="flex flex-wrap items-center gap-2"><label>{room.id}<input aria-label={`${room.id} level`} className="ml-2 w-16 rounded border p-2" type="number" min={1} max={maxRoomLevel(room.kind)} value={room.level} onChange={(e) => setInput({ ...input, layout: updateRoomLevel(input.layout, room.id, Number(e.target.value)) })} /></label>{room.kind === "factory" && <select aria-label={`${room.id} recipe`} value={factoryRecipeFor(room)} onChange={(e) => setInput({ ...input, layout: updateFactoryRecipe(input.layout, room.id, e.target.value as "gold" | "battle_record" | "originium") })}>{["gold", "battle_record", "originium"].map((v) => <option key={v}>{v}</option>)}</select>}{room.kind === "trade_post" && <select aria-label={`${room.id} order`} value={tradeOrderFor(room)} onChange={(e) => setInput({ ...input, layout: updateTradeOrder(input.layout, room.id, e.target.value as "gold" | "originium") })}><option>gold</option><option>originium</option></select>}</div>)}</div>
      <RotationSettings value={input.rotation} onChange={(rotation) => setInput({ ...input, rotation })} /><p className="text-xs">{input.rotation}</p>
      <label className="flex items-center gap-2"><input type="checkbox" checked={input.fiammetta_enable} onChange={(e) => setInput({ ...input, fiammetta_enable: e.target.checked })} />Fiammetta</label>
      <details><summary className="cursor-pointer py-3">{t("编辑干员练度", "Edit operators")}</summary><ManualOperboxPicker operbox={input.operbox} onApply={(operbox) => setInput({ ...input, operbox })} compact /></details>
      {changed && <details><summary>{t("查看输入差异", "View input changes")}</summary><pre className="max-h-72 overflow-auto text-xs">{JSON.stringify({ original: draft.original, modified: input }, null, 2)}</pre></details>}
      <Button disabled={busy} onClick={() => void perform(async () => { const next = await api<QualityDraftData>("", { action: "edit", id: draft.id, revision: draft.revision, input: parseReproductionPackage(input) }); setDraft(next); setInput(next.input); setSelected((current) => [...new Set([...current, next.id])]); setNotice(t("草稿已保存", "Draft saved")); })}>{t("保存草稿并加入批次", "Save draft and include")}</Button>
    </section>}
    <section className="grid gap-4 rounded-xl border bg-background p-4">
      <h2 className="font-semibold">{t("运行测试批次", "Run batch")} ({selected.length})</h2>
      <p className="text-sm">{overview?.worker && checkedAt - Date.parse(overview.worker.at) < 15_000 ? t("Worker 就绪", "Worker ready") : t("Worker 未就绪，任务将等待后台服务", "Worker unavailable; jobs will remain queued")}</p>
      {overview?.worker?.syncError && <p role="alert">{overview.worker.syncError}</p>}
      <div className="flex flex-wrap gap-3"><label>{t("基线", "Baseline")}<select className="ml-2 max-w-60 rounded border p-2" value={baseline} onChange={(e) => setBaseline(e.target.value)}><option value="">{t("单版本执行", "Single version")}</option>{overview?.versions.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}</select></label><label>{t("测试版本", "Test version")}<select className="ml-2 max-w-60 rounded border p-2" value={candidate} onChange={(e) => setCandidate(e.target.value)}><option value="">{t("暂无已验证版本", "No verified versions")}</option>{overview?.versions.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}</select></label></div>
      <div className="flex flex-wrap gap-3"><Button disabled={busy || !selected.length || !candidate || baseline === candidate || (!!draft && !!input && reproductionInputKey(input) !== reproductionInputKey(draft.input))} onClick={() => void perform(async () => { setBatch(await api<QualityBatchData>("", { action: "batch", ids: selected, bundleIds: baseline ? [baseline, candidate] : [candidate], label: t("反馈复现批次", "Feedback reproduction batch") })); await refresh(); })}>{t("提交后台运行", "Queue batch")}</Button>{overview?.isAdmin && <Button variant="outline" disabled={busy} onClick={() => void perform(async () => { await api("", { action: "sync" }); setNotice(t("已请求从生产产物同步，后台校验通过后可选", "Production sync requested; available after verification")); })}>{t("同步生产求解器", "Sync production solver")}</Button>}</div>
    </section>
    <section className="grid gap-3"><h2 className="font-semibold">{t("团队批次", "Team batches")}</h2>{overview?.batches.map((item) => <Button key={item.id} variant="outline" className="justify-between" onClick={() => void perform(async () => { setBatch(await api(`?kind=batch&id=${item.id}`)); setResult(null); })}>{item.label} · {item.createdAt.slice(0, 16)} · {item.status}</Button>)}</section>
    {batch && <section className="grid gap-3 rounded-xl border bg-background p-4"><h2 className="font-semibold">{batch.label} · {batch.status}</h2><p>{batch.cases.filter((item) => ["completed", "failed", "cancelled"].includes(item.status)).length} / {batch.cases.length}</p><div className="flex gap-3"><Button variant="outline" disabled={busy || !["queued", "running"].includes(batch.status)} onClick={() => void perform(async () => { await api("", { action: "cancel", id: batch.id }); setBatch(await api(`?kind=batch&id=${batch.id}`)); })}>{t("取消", "Cancel")}</Button><Button variant="outline" disabled={busy || batch.status !== "failed"} onClick={() => void perform(async () => { await api("", { action: "retry", id: batch.id }); setBatch(await api(`?kind=batch&id=${batch.id}`)); })}>{t("仅重跑失败项", "Retry failed cases")}</Button></div>{batch.cases.map((item) => <article key={item.id} className="grid gap-2 border-t py-3"><p>{item.sources.map((source) => source.name).join(" · ")} · {item.status}</p><div className="flex flex-wrap gap-2">{item.sources.filter((s) => s.feedbackId).map((s) => <Link key={s.feedbackId} href={`/admin/issues?q=${s.feedbackId}`}>{t("回填结论", "Record conclusion")}</Link>)}{item.attempts.map((attempt, i) => <Button key={attempt.id} variant="ghost" disabled={attempt.status === "running"} onClick={() => void perform(async () => setResult(await api(`?kind=result&id=${batch.id}&attempt=${attempt.id}`)))}>{i + 1}: {attempt.status}</Button>)}</div></article>)}</section>}
    {result != null && <section className="grid gap-3 rounded-xl border bg-background p-4"><h2 className="font-semibold">{t("执行结果", "Execution result")}</h2><p className="text-sm text-muted-foreground">{t("耗时差异仅供参考，不自动判断回归。", "Timing differences are informational and do not automatically indicate regressions.")}</p><Button variant="outline" onClick={() => download("quality-result.json", result)}>{t("下载结果", "Download result")}</Button><ResultView result={result} /><details><summary>{t("完整结果", "Full result")}</summary><pre className="max-h-96 overflow-auto whitespace-pre-wrap text-xs">{JSON.stringify(result, null, 2)}</pre></details></section>}
  </main>;
}
function ResultView({ result }: { result: unknown }) {
  const [shift, setShift] = useState(0);
  const en = useLocale() === "en";
  const data = result as { results?: { bundleId: string; ok: boolean; valid: boolean; elapsedMs: number; error?: string; summary?: { daily: { trade: number | null; manu: number | null; power: number | null } } | null; response?: { result?: { maa: MaaJson; rotation: RotationJson } } }[]; input?: ReproductionPackage; comparison?: { scheduleChanged: boolean; dailyDelta: { trade: number | null; manu: number | null; power: number | null }; elapsedDeltaMs: number } | null };
  return <>
    <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr>{(en ? ["Version", "Execution", "Valid", "Trade / Manufacture / Power", "Elapsed (ms)"] : ["版本", "执行", "有效性", "贸易 / 制造 / 发电收益", "耗时 (ms)"]).map((label) => <th className="p-2" key={label}>{label}</th>)}</tr></thead><tbody>{data.results?.map((item) => <tr key={item.bundleId}><td className="p-2" title={item.bundleId}>{item.bundleId.slice(0, 12)}</td><td className="p-2">{item.ok ? (en ? "Success" : "成功") : (en ? "Failed" : "失败")}{item.error && <p role="alert">{item.error}</p>}</td><td className="p-2">{item.valid ? (en ? "Valid" : "有效") : (en ? "Invalid" : "无效")}</td><td className="p-2">{[item.summary?.daily.trade, item.summary?.daily.manu, item.summary?.daily.power].map((value) => value ?? "—").join(" / ")}</td><td className="p-2">{Math.round(item.elapsedMs)}</td></tr>)}</tbody></table></div>
    {data.comparison && <p>{en ? "Schedule changed" : "排班变化"}：{data.comparison.scheduleChanged ? (en ? "Yes" : "有") : (en ? "No" : "无")} · {en ? "Daily deltas (trade / manufacture / power)" : "日收益变化（贸易 / 制造 / 发电）"}：{[data.comparison.dailyDelta.trade, data.comparison.dailyDelta.manu, data.comparison.dailyDelta.power].map((value) => value ?? "—").join(" / ")}</p>}
    {data.results?.map((item) => { const payload = item.response?.result; if (!payload?.maa?.plans?.length || !data.input) return null; const active = Math.min(shift, payload.maa.plans.length - 1); const plan = payload.maa.plans[active]; return <div key={item.bundleId}><h3 className="mb-2 font-medium">{item.bundleId.slice(0, 12)}</h3><select value={active} onChange={(e) => setShift(Number(e.target.value))} aria-label={en ? "Shift" : "班次"}>{payload.maa.plans.map((_, i) => <option key={i} value={i}>{i + 1}</option>)}</select><CompactScheduleView layout={data.input.layout} rows={planToRows(plan, payload.rotation?.shifts?.[active], data.input.layout)} activeShift={active} activePlan={plan} shiftDirection={0} feedbackDisabled /></div>; })}
  </>;
}
