"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AppMotionProvider } from "@/components/MotionProvider";
import { ReleaseDialog } from "@/components/changelog/ReleaseDialog";
import { ReleaseEntry } from "@/components/changelog/ReleaseEntry";
import { useLanguageDemo } from "@/language-demo";
import { requestAdminData } from "@/lib/admin-request";
import type { AdminRelease, AdminReleaseList, ReleaseDraft } from "@/releases/types";
import { RELEASE_ENVIRONMENT_LABELS } from "@/releases/presentation";
import { parseReleaseDraft } from "@/releases/validation";
import { ReleaseEditor } from "./release-editor";

function emptyDraft(): ReleaseDraft {
  return { version: "", date: new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10), title: { zh: "", en: "" }, notify: true, sections: [] };
}
type Confirmation = { action: "publish" | "withdraw" | "delete"; release: AdminRelease }
  | { action: "discard"; target: AdminRelease | null };

export function ChangelogManager() {
  const { locale } = useLanguageDemo();
  const en = locale === "en";
  const [data, setData] = useState<AdminReleaseList | null>(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<AdminRelease | null>(null);
  const [draft, setDraft] = useState<ReleaseDraft>(emptyDraft);
  const [initial, setInitial] = useState(() => JSON.stringify(draft));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [preview, setPreview] = useState<{ mode: "page" | "popup"; draft: ReleaseDraft } | null>(null);
  const dirty = JSON.stringify(draft) !== initial;
  const environment = data ? RELEASE_ENVIRONMENT_LABELS[data.environment][en ? "en" : "zh"] : "";
  const load = useCallback(async () => {
    setLoading(true);
    try { setData(await requestAdminData<AdminReleaseList>("/api/admin/releases", undefined, "无法加载更新日志，请重试。")); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "无法加载更新日志。"); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!dirty) return;
    const preventLoss = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener("beforeunload", preventLoss);
    return () => window.removeEventListener("beforeunload", preventLoss);
  }, [dirty]);
  function edit(record: AdminRelease | null) {
    const next = record ? structuredClone(record.draft) : emptyDraft();
    setSelected(record); setDraft(next); setInitial(JSON.stringify(next));
    setError(""); setMessage("");
  }
  function choose(record: AdminRelease | null) {
    if (dirty) setConfirmation({ action: "discard", target: record });
    else edit(record);
  }
  function updateRecord(record: AdminRelease | null, deletedId?: string) {
    setData((current) => current ? { ...current, releases: record
      ? [record, ...current.releases.filter((entry) => entry.id !== record.id)]
      : current.releases.filter((entry) => entry.id !== deletedId) } : current);
    edit(record);
  }
  async function save() {
    setError(""); setMessage("");
    let value: ReleaseDraft;
    try { value = parseReleaseDraft(draft); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "请检查日志内容。"); return; }
    setBusy(true);
    try {
      const result = await requestAdminData<{ release: AdminRelease }>(selected ? `/api/admin/releases/${selected.id}` : "/api/admin/releases", {
        method: selected ? "PATCH" : "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(selected ? { action: "save", revision: selected.revision, draft: value } : value),
      }, "保存失败，请刷新列表确认状态后再试。");
      updateRecord(result.release);
      setMessage(en ? "Draft saved. Public content is unchanged." : "草稿已保存，前台内容尚未改变。");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "保存失败。"); }
    finally { setBusy(false); }
  }
  async function confirmAction() {
    if (!confirmation) return;
    if (confirmation.action === "discard") { edit(confirmation.target); setConfirmation(null); return; }
    const { action, release } = confirmation;
    setBusy(true); setError(""); setMessage("");
    try {
      const result = await requestAdminData<{ release: AdminRelease | null }>(`/api/admin/releases/${release.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, revision: release.revision }),
      }, "操作失败，请刷新列表确认状态后再试。");
      updateRecord(result.release, release.id);
      setMessage(action === "publish" ? (en ? "Published. No deployment needed." : "已发布，无需重新部署网页。")
        : action === "withdraw" ? (en ? "Withdrawn from the public feed." : "已撤回，前台不再显示这条日志。") : (en ? "Draft deleted." : "草稿已删除。"));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "操作失败。"); }
    finally { setBusy(false); setConfirmation(null); }
  }
  function showPreview(mode: "page" | "popup") {
    try { setPreview({ mode, draft: parseReleaseDraft(draft) }); setError(""); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "请先填写日志。"); }
  }
  const filtered = data?.releases.filter((record) => `${record.draft.version} ${record.draft.title.zh} ${record.draft.title.en}`.toLowerCase().includes(query.trim().toLowerCase())) ?? [];
  const publishChanged = selected?.published && JSON.stringify(selected.draft) !== JSON.stringify(selected.published);
  return (
    <AppMotionProvider>
      <main id="admin-content" className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6 lg:px-8" data-admin-changelog>
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-3"><h1 className="text-2xl font-semibold">{en ? "Changelog" : "更新日志"}</h1>{data ? <Badge variant="outline">{environment}</Badge> : null}</div>
            <p className="text-sm leading-6 text-muted-foreground">{en ? "Save a draft, preview it, then publish when the feature is live. Other environments are unaffected." : "先保存草稿、预览，功能上线后再发布。操作仅影响当前环境。"}</p>
          </div>
          <Button disabled={busy || !data} onClick={() => choose(null)}>{en ? "New release" : "新建日志"}</Button>
        </header>
        {error ? <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</p> : null}
        {message ? <p role="status" className="text-sm">{message}</p> : null}
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(260px,1fr)_minmax(0,2fr)]">
          <section className="min-w-0 space-y-3" aria-label={en ? "Release list" : "日志列表"}>
            <div className="flex gap-2">
              <Input aria-label={en ? "Search releases" : "搜索更新日志"} placeholder={en ? "Version or title" : "搜索版本号或标题"} value={query} onChange={(event) => setQuery(event.target.value)} className="h-11" />
              <Button variant="outline" className="h-11" disabled={loading || busy} onClick={() => { setError(""); void load(); }}>{en ? "Refresh" : "刷新"}</Button>
            </div>
            {loading && !data ? <Skeleton className="h-52 w-full" /> : <ScrollArea className="h-80 rounded-xl border bg-background lg:h-[640px]">
              {!filtered.length ? <p className="p-5 text-sm text-muted-foreground">{en ? "No matching releases." : "暂无匹配的日志。"}</p> : filtered.map((record) => (
                <button key={record.id} disabled={busy} onClick={() => choose(record)} aria-pressed={selected?.id === record.id}
                  className="grid w-full gap-2 border-b border-border/60 p-4 text-left outline-none hover:bg-muted/60 aria-pressed:bg-muted focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
                  <span className="flex flex-wrap items-center justify-between gap-2"><span className="font-number text-lg">v{record.draft.version}</span>
                    <Badge variant={record.published ? "default" : "outline"}>{record.published ? (en ? "Published" : "已发布") : record.firstPublishedAt ? (en ? "Withdrawn" : "已撤回") : (en ? "Draft" : "草稿")}</Badge>
                  </span>
                  <span className="break-words text-sm">{record.draft.title[en ? "en" : "zh"] || record.draft.title.zh}</span>
                  {record.published && JSON.stringify(record.draft) !== JSON.stringify(record.published) ? <span className="text-xs text-muted-foreground">{en ? "Unpublished changes" : "有未发布修改"}</span> : null}
                </button>
              ))}
            </ScrollArea>}
          </section>
          <form onSubmit={(event) => { event.preventDefault(); void save(); }} className="min-w-0 space-y-6 rounded-xl border bg-background p-4 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="font-semibold">{selected ? (en ? "Edit release" : "编辑日志") : (en ? "New release" : "新建日志")}</h2>
              <span className="text-xs text-muted-foreground">{dirty ? (en ? "Unsaved changes" : "有未保存修改") : publishChanged ? (en ? "Saved, not published" : "修改已保存，尚未发布") : ""}</span>
            </div>
            <ReleaseEditor draft={draft} onChange={setDraft} versionLocked={Boolean(selected?.firstPublishedAt)} disabled={busy || !data} />
            <div className="flex flex-wrap gap-2 border-t pt-5">
              <Button type="submit" disabled={busy || !data}>{busy ? (en ? "Saving…" : "处理中…") : (en ? "Save draft" : "保存草稿")}</Button>
              <Button type="button" variant="outline" disabled={busy || !data} onClick={() => showPreview("page")}>{en ? "Preview page" : "预览日志"}</Button>
              <Button type="button" variant="outline" disabled={busy || !data} onClick={() => showPreview("popup")}>{en ? "Preview popup" : "预览弹窗"}</Button>
            </div>
            {selected ? <div className="flex flex-wrap items-center gap-2">
              <Button type="button" disabled={busy || dirty} onClick={() => setConfirmation({ action: "publish", release: selected })}>{en ? "Publish" : "发布"}</Button>
              {selected.published ? <Button type="button" variant="outline" disabled={busy || dirty} onClick={() => setConfirmation({ action: "withdraw", release: selected })}>{en ? "Withdraw" : "撤回"}</Button> : null}
              {!selected.firstPublishedAt ? <Button type="button" variant="ghost" disabled={busy} onClick={() => setConfirmation({ action: "delete", release: selected })}>{en ? "Delete draft" : "删除草稿"}</Button> : null}
              {dirty ? <p className="text-xs text-muted-foreground">{en ? "Save before publishing." : "请先保存草稿，再发布。"}</p> : null}
            </div> : null}
          </form>
        </div>
      </main>
      <Dialog open={Boolean(confirmation)} onOpenChange={(open) => { if (!open && !busy) setConfirmation(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{confirmation?.action === "publish" ? (en ? `Publish to ${environment}?` : `发布到${environment}？`)
              : confirmation?.action === "withdraw" ? (en ? "Withdraw this release?" : "撤回这条日志？")
              : confirmation?.action === "delete" ? (en ? "Delete this draft?" : "删除这份草稿？")
              : (en ? "Discard unsaved changes?" : "放弃未保存修改？")}</DialogTitle>
            <DialogDescription>{confirmation?.action === "publish" ? (en ? "The saved draft becomes public immediately. Confirm that the described features are already live." : "已保存草稿将立即公开。请确认所描述的功能已经上线；这不会部署功能代码。")
              : confirmation?.action === "withdraw" ? (en ? "Removes this update and its notification. Republishing the same version does not notify existing readers again." : "从前台移除这条日志，并停止对应弹窗提示。重新发布同版本不会重复通知已读用户。")
              : (en ? "These changes cannot be recovered automatically." : "此操作无法自动恢复，请确认后继续。")}</DialogDescription>
          </DialogHeader>
          <DialogFooter className="max-sm:flex-col-reverse">
            <Button variant="outline" size="dialog" className="max-sm:w-full" disabled={busy} onClick={() => setConfirmation(null)}>{en ? "Cancel" : "取消"}</Button>
            <Button size="dialog" className="max-sm:w-full" disabled={busy} onClick={() => void confirmAction()}>{en ? "Confirm" : "确认"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {preview?.mode === "popup" ? <ReleaseDialog release={preview.draft} open onOpenChange={(open) => { if (!open) setPreview(null); }} showHistoryLink={false} /> : null}
      <Dialog open={preview?.mode === "page"} onOpenChange={(open) => { if (!open) setPreview(null); }}>
        <DialogContent className="max-h-[calc(100dvh-2rem)] grid-rows-[auto_minmax(0,1fr)] sm:max-w-[min(920px,calc(100vw-2rem))]">
          <DialogHeader><DialogTitle>{en ? "Release preview" : "日志预览"}</DialogTitle><DialogDescription>{en ? "Preview only. Nothing has been published." : "仅预览当前草稿，不会发布或改变已读状态。"}</DialogDescription></DialogHeader>
          <ScrollArea className="min-h-0"><DialogBody>{preview ? <ReleaseEntry release={preview.draft} latest /> : null}</DialogBody></ScrollArea>
        </DialogContent>
      </Dialog>
    </AppMotionProvider>
  );
}
