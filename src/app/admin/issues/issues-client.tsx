"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Bug,
  Check,
  ChevronDown,
  ChevronUp,
  Clipboard,
  Download,
  Inbox,
  Loader2,
  RefreshCw,
  Trash2,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { rotationDescription } from "@/rotation-settings";
import type {
  AdminFeedbackDeleteData,
  AdminFeedbackDetailData,
  AdminFeedbackFacility,
  AdminFeedbackListData,
  AdminFeedbackRecordData,
  AdminFeedbackStatus,
  AdminPlanRunDetailData,
  AdminPlanRunListData,
  AdminPlanRunRecordData,
  AdminReproductionData,
  AdminReproductionUnavailableReason,
  ApiResponse,
} from "@/types";

const PAGE_SIZE = 50;

const STATUS_LABELS: Record<AdminFeedbackStatus, string> = {
  unreviewed: "未审阅",
  reproduced: "已复现",
  fixed: "已修复",
};

const FACILITY_LABELS: Record<AdminFeedbackFacility, string> = {
  trading: "贸易站",
  manufacture: "制造站",
  power: "发电站",
  control: "控制中枢",
  dormitory: "宿舍",
  meeting: "会客室",
  hire: "办公室",
  processing: "加工站",
  training: "训练室",
  solver: "求解器整体",
  unknown: "其他设施",
};

const FACILITY_FILTERS = Object.keys(FACILITY_LABELS) as AdminFeedbackFacility[];

const REPRODUCTION_UNAVAILABLE_MESSAGES: Record<AdminReproductionUnavailableReason, string> = {
  expired: "私有运行资料已达到 30 天保留期限；下方只显示仍可用的摘要。",
  cache_hit: "该记录使用了排班缓存，没有生成新的私有求解制品；下方只显示仍可用的摘要。",
  finalizing: "私有求解制品仍在整理中，请稍后刷新后重试。",
  finalization_failed: "私有求解制品整理失败；运行摘要仍在，请检查 Worker 日志和持久化目录。",
  not_recorded: "该记录没有保存对应的私有求解制品；下方只显示仍可用的摘要。",
  missing: "数据库摘要仍在，但服务器未找到对应制品；它可能已被旧保留策略清理，或持久化存储需要检查。",
  invalid: "私有制品目录存在，但结果索引损坏或与诊断编号不匹配。",
  incomplete: "私有制品仍在，但缺少或无法读取布局、Box、轮换或菲亚梅塔状态。",
};

type DetailState = {
  loading: boolean;
  error: string | null;
  reproduction: AdminReproductionData | null;
};

async function requestData<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: "no-store", ...init });
  const body = await response.json() as ApiResponse<T>;
  if (!response.ok || !body.success) {
    throw new Error(body.success ? "请求失败" : body.error.message);
  }
  return body.data;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

function statusClass(status: AdminFeedbackStatus): string {
  if (status === "fixed") return "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/45 dark:text-emerald-300";
  if (status === "reproduced") return "bg-amber-50 text-amber-800 dark:bg-amber-950/45 dark:text-amber-300";
  return "bg-muted text-muted-foreground";
}

function downloadReproduction(reproduction: AdminReproductionData): void {
  if (!reproduction.available || !reproduction.layout || !reproduction.operbox || !reproduction.rotation) return;
  const payload = {
    diagnosticId: reproduction.diagnosticId,
    layout: reproduction.layout,
    operbox: reproduction.operbox,
    rotation: reproduction.rotation,
    fiammetta_enable: reproduction.fiammettaEnabled,
  };
  const href = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }));
  const anchor = document.createElement("a");
  anchor.href = href;
  anchor.download = `solver-reproduction-${reproduction.diagnosticId}.json`;
  anchor.click();
  URL.revokeObjectURL(href);
}

function ReproductionPanel({ state }: { state: DetailState }) {
  const [copied, setCopied] = useState(false);
  if (state.loading) {
    return <p role="status" className="flex items-center gap-2 py-4 text-sm text-muted-foreground"><Loader2 className="animate-spin" />正在读取复现资料…</p>;
  }
  if (state.error) return <p role="alert" className="py-4 text-sm text-destructive">{state.error}</p>;
  const reproduction = state.reproduction;
  if (!reproduction) return null;
  const operatorNames = reproduction.operbox?.map((operator) => operator.name).filter(Boolean) ?? [];
  return (
    <div className="grid gap-4 border-t border-border/70 pt-4">
      {!reproduction.available ? (
        <p role="status" className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2.5 text-sm text-amber-900 dark:bg-amber-950/35 dark:text-amber-200">
          <AlertTriangle className="mt-0.5 shrink-0" aria-hidden="true" />
          {REPRODUCTION_UNAVAILABLE_MESSAGES[reproduction.unavailableReason ?? "incomplete"]}
        </p>
      ) : null}

      <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <div><dt className="text-xs text-muted-foreground">基建布局</dt><dd className="mt-1 font-medium">{reproduction.layout?.template ?? "不可用"}</dd></div>
        <div><dt className="text-xs text-muted-foreground">干员 Box</dt><dd className="font-number mt-1 font-medium">{reproduction.operbox ? `${reproduction.operbox.length} 名干员` : "不可用"}</dd></div>
        <div><dt className="text-xs text-muted-foreground">轮换次数</dt><dd className="font-number mt-1 font-medium">{reproduction.rotationCount ?? "不可用"}</dd></div>
        <div><dt className="text-xs text-muted-foreground">菲亚梅塔</dt><dd className="mt-1 font-medium">{reproduction.fiammettaEnabled === null ? "不可用" : reproduction.fiammettaEnabled ? "启用" : "关闭"}</dd></div>
      </dl>
      {reproduction.rotation ? <p className="text-xs text-muted-foreground">轮换配置：{rotationDescription(reproduction.rotation)}</p> : null}

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" disabled={!reproduction.available} onClick={() => downloadReproduction(reproduction)}>
          <Download aria-hidden="true" />下载复现 JSON
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={async () => {
            await navigator.clipboard.writeText(reproduction.diagnosticId);
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1200);
          }}
        >
          {copied ? <Check aria-hidden="true" /> : <Clipboard aria-hidden="true" />}
          {copied ? "已复制" : "复制诊断编号"}
        </Button>
      </div>

      {operatorNames.length ? (
        <details className="rounded-lg bg-muted/55 px-3 py-2.5 text-sm">
          <summary className="min-h-10 cursor-pointer py-2 font-medium">查看 Box 干员名单</summary>
          <p className="break-words pb-2 leading-6 text-muted-foreground">{operatorNames.join("、")}</p>
        </details>
      ) : null}
      {reproduction.error ? (
        <div>
          <h4 className="text-sm font-medium">求解错误</h4>
          <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded-lg bg-neutral-950 p-3 text-xs leading-5 text-neutral-100">{reproduction.error}</pre>
        </div>
      ) : null}
      {reproduction.stderrExcerpt ? (
        <details className="rounded-lg bg-muted/55 px-3 py-2.5 text-sm">
          <summary className="min-h-10 cursor-pointer py-2 font-medium">查看 stderr 末尾</summary>
          <pre className="max-h-72 overflow-auto whitespace-pre-wrap pb-2 text-xs leading-5 text-muted-foreground">{reproduction.stderrExcerpt}</pre>
        </details>
      ) : null}
      {reproduction.stdoutExcerpt ? (
        <details className="rounded-lg bg-muted/55 px-3 py-2.5 text-sm">
          <summary className="min-h-10 cursor-pointer py-2 font-medium">查看 stdout 末尾</summary>
          <pre className="max-h-72 overflow-auto whitespace-pre-wrap pb-2 text-xs leading-5 text-muted-foreground">{reproduction.stdoutExcerpt}</pre>
        </details>
      ) : null}
    </div>
  );
}

function FeedbackRow({
  item,
  selected,
  busy,
  detail,
  expanded,
  onSelect,
  onStatus,
  onToggleDetail,
}: {
  item: AdminFeedbackRecordData;
  selected: boolean;
  busy: boolean;
  detail?: DetailState;
  expanded: boolean;
  onSelect: (selected: boolean) => void;
  onStatus: (status: AdminFeedbackStatus) => void;
  onToggleDetail: () => void;
}) {
  return (
    <article className="rounded-xl bg-background p-4 shadow-[var(--shadow-border)] sm:p-5">
      <div className="flex items-start gap-3">
        <label className="grid min-h-11 min-w-11 shrink-0 cursor-pointer place-items-center" aria-label={`选择反馈 ${item.id}`}>
          <input type="checkbox" checked={selected} onChange={(event) => onSelect(event.target.checked)} className="size-4 accent-foreground" />
        </label>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-medium">{item.room?.title ?? FACILITY_LABELS[item.facility]}</h3>
            <Badge className={statusClass(item.status)}>{STATUS_LABELS[item.status]}</Badge>
            <span className="font-number text-xs text-muted-foreground">{formatDate(item.createdAt)}</span>
          </div>
          <p className="mt-2 break-words whitespace-pre-wrap text-sm leading-6">{item.note}</p>
          {item.room?.operators.length ? <p className="mt-2 break-words text-xs leading-5 text-muted-foreground">当前干员：{item.room.operators.join("、")}</p> : null}
          <p className="font-number mt-2 break-all text-[11px] text-muted-foreground">{item.diagnosticId}</p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border/70 pt-3">
        <div role="group" className="flex flex-wrap gap-1" aria-label="审阅状态">
          {(Object.keys(STATUS_LABELS) as AdminFeedbackStatus[]).map((status) => (
            <Button
              key={status}
              type="button"
              size="sm"
              variant={item.status === status ? "secondary" : "ghost"}
              aria-pressed={item.status === status}
              disabled={busy}
              onClick={() => onStatus(status)}
            >
              {STATUS_LABELS[status]}
            </Button>
          ))}
        </div>
        <Button type="button" size="sm" variant="outline" aria-expanded={expanded} onClick={onToggleDetail}>
          {expanded ? <ChevronUp aria-hidden="true" /> : <ChevronDown aria-hidden="true" />}
          {expanded ? "收起复现资料" : "查看复现资料"}
        </Button>
      </div>
      {expanded && detail ? <div className="mt-4"><ReproductionPanel state={detail} /></div> : null}
    </article>
  );
}

function RunRow({
  item,
  detail,
  expanded,
  onToggleDetail,
}: {
  item: AdminPlanRunRecordData;
  detail?: DetailState;
  expanded: boolean;
  onToggleDetail: () => void;
}) {
  return (
    <article className="rounded-xl bg-background p-4 shadow-[var(--shadow-border)] sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="destructive">{item.errorCode ?? "未分类错误"}</Badge>
            <span className="font-number text-xs text-muted-foreground">{formatDate(item.createdAt)}</span>
          </div>
          <p className="font-number mt-2 break-all text-xs">{item.diagnosticId}</p>
        </div>
        <Button type="button" size="sm" variant="outline" aria-expanded={expanded} onClick={onToggleDetail}>
          {expanded ? <ChevronUp aria-hidden="true" /> : <ChevronDown aria-hidden="true" />}
          {expanded ? "收起" : "复现资料与错误"}
        </Button>
      </div>
      <dl className="mt-4 grid gap-x-6 gap-y-3 border-t border-border/70 pt-4 text-sm sm:grid-cols-2 lg:grid-cols-5">
        <div><dt className="text-xs text-muted-foreground">布局</dt><dd className="mt-1 font-medium">{item.layoutTemplate}</dd></div>
        <div><dt className="text-xs text-muted-foreground">干员</dt><dd className="font-number mt-1 font-medium">{item.operatorCount}</dd></div>
        <div><dt className="text-xs text-muted-foreground">轮换配置</dt><dd className="mt-1 font-medium">{item.rotation}</dd></div>
        <div><dt className="text-xs text-muted-foreground">菲亚梅塔</dt><dd className="mt-1 font-medium">{item.fiammettaEnable ? "启用" : "关闭"}</dd></div>
        <div><dt className="text-xs text-muted-foreground">求解耗时</dt><dd className="font-number mt-1 font-medium">{item.durationMs === null ? "—" : `${item.durationMs} ms`}</dd></div>
      </dl>
      {expanded && detail ? <div className="mt-4"><ReproductionPanel state={detail} /></div> : null}
    </article>
  );
}

export function AdminIssues() {
  const [feedback, setFeedback] = useState<AdminFeedbackListData>({ items: [], total: 0, limit: PAGE_SIZE, offset: 0 });
  const [runs, setRuns] = useState<AdminPlanRunListData>({ items: [], total: 0, limit: PAGE_SIZE, offset: 0 });
  const [feedbackOffset, setFeedbackOffset] = useState(0);
  const [runOffset, setRunOffset] = useState(0);
  const [statusFilter, setStatusFilter] = useState<AdminFeedbackStatus | "all">("all");
  const [facilityFilter, setFacilityFilter] = useState<AdminFeedbackFacility | "all">("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [details, setDetails] = useState<Record<string, DetailState>>({});
  const [expanded, setExpanded] = useState<string | null>(null);
  const [busyStatusId, setBusyStatusId] = useState<string | null>(null);
  const [loadingFeedback, setLoadingFeedback] = useState(true);
  const [loadingRuns, setLoadingRuns] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const feedbackRequestRef = useRef<AbortController | null>(null);
  const runRequestRef = useRef<AbortController | null>(null);

  const loadFeedback = useCallback(async () => {
    feedbackRequestRef.current?.abort();
    const controller = new AbortController();
    feedbackRequestRef.current = controller;
    setLoadingFeedback(true);
    setError(null);
    setSelected(new Set());
    try {
      const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(feedbackOffset) });
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (facilityFilter !== "all") params.set("facility", facilityFilter);
      setFeedback(await requestData<AdminFeedbackListData>(`/api/admin/feedback?${params}`, { signal: controller.signal }));
    } catch (loadError) {
      if (controller.signal.aborted) return;
      setError(loadError instanceof Error ? loadError.message : "无法读取反馈记录");
    } finally {
      if (feedbackRequestRef.current === controller) setLoadingFeedback(false);
    }
  }, [facilityFilter, feedbackOffset, statusFilter]);

  const loadRuns = useCallback(async () => {
    runRequestRef.current?.abort();
    const controller = new AbortController();
    runRequestRef.current = controller;
    setLoadingRuns(true);
    setError(null);
    try {
      const params = new URLSearchParams({ status: "failed", limit: String(PAGE_SIZE), offset: String(runOffset) });
      setRuns(await requestData<AdminPlanRunListData>(`/api/admin/plan-runs?${params}`, { signal: controller.signal }));
    } catch (loadError) {
      if (controller.signal.aborted) return;
      setError(loadError instanceof Error ? loadError.message : "无法读取求解错误");
    } finally {
      if (runRequestRef.current === controller) setLoadingRuns(false);
    }
  }, [runOffset]);

  useEffect(() => {
    void loadFeedback();
    return () => feedbackRequestRef.current?.abort();
  }, [loadFeedback]);
  useEffect(() => {
    void loadRuns();
    return () => runRequestRef.current?.abort();
  }, [loadRuns]);

  const visibleFeedback = feedback.items;

  const groupedFeedback = useMemo(() => {
    const groups = new Map<AdminFeedbackFacility, AdminFeedbackRecordData[]>();
    for (const item of visibleFeedback) groups.set(item.facility, [...(groups.get(item.facility) ?? []), item]);
    return [...groups.entries()];
  }, [visibleFeedback]);

  const statusCounts = useMemo(() => feedback.items.reduce<Record<AdminFeedbackStatus, number>>((counts, item) => {
    counts[item.status] += 1;
    return counts;
  }, { unreviewed: 0, reproduced: 0, fixed: 0 }), [feedback.items]);

  async function toggleDetail(key: string, url: string) {
    if (expanded === key) {
      setExpanded(null);
      return;
    }
    setExpanded(key);
    if (details[key]?.loading || details[key]?.reproduction?.available) return;
    setDetails((current) => ({ ...current, [key]: { loading: true, error: null, reproduction: null } }));
    try {
      const data = key.startsWith("feedback:")
        ? await requestData<AdminFeedbackDetailData>(url)
        : await requestData<AdminPlanRunDetailData>(url);
      setDetails((current) => ({ ...current, [key]: { loading: false, error: null, reproduction: data.reproduction } }));
    } catch (detailError) {
      setDetails((current) => ({ ...current, [key]: { loading: false, error: detailError instanceof Error ? detailError.message : "无法读取复现资料", reproduction: null } }));
    }
  }

  async function updateStatus(item: AdminFeedbackRecordData, status: AdminFeedbackStatus) {
    if (item.status === status) return;
    setBusyStatusId(item.id);
    setMessage(null);
    setError(null);
    try {
      await requestData(`/api/admin/feedback/${encodeURIComponent(item.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, note: item.adminNote ?? "" }),
      });
      setMessage(`反馈已标记为“${STATUS_LABELS[status]}”。`);
      await loadFeedback();
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "无法更新反馈状态");
    } finally {
      setBusyStatusId(null);
    }
  }

  async function deleteSelected() {
    const ids = [...selected];
    if (!ids.length) return;
    setDeleting(true);
    setMessage(null);
    setError(null);
    try {
      const result = await requestData<AdminFeedbackDeleteData>("/api/admin/feedback", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      setConfirmDelete(false);
      setSelected(new Set());
      setDetails((current) => Object.fromEntries(Object.entries(current).filter(([key]) => !result.deletedIds.some((id) => key === `feedback:${id}`))));
      setExpanded((current) => current && result.deletedIds.some((id) => current === `feedback:${id}`) ? null : current);
      setMessage(`已删除 ${result.deletedCount} 条反馈。`);
      await loadFeedback();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "无法删除反馈");
    } finally {
      setDeleting(false);
    }
  }

  const allVisibleSelected = visibleFeedback.length > 0 && visibleFeedback.every((item) => selected.has(item.id));

  return (
    <main id="admin-content" className="mx-auto grid max-w-7xl gap-6 px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="font-technical text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">SOLVER TRIAGE</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-[-0.012em]">求解器问题</h1>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">按设施审阅用户反馈，追踪求解失败，并下载足够复现的布局、Box 与轮换配置。</p>
        </div>
        <Button type="button" variant="outline" disabled={loadingFeedback || loadingRuns} onClick={() => { setDetails({}); setExpanded(null); void loadFeedback(); void loadRuns(); }}>
          <RefreshCw className={loadingFeedback || loadingRuns ? "animate-spin" : ""} aria-hidden="true" />刷新
        </Button>
      </header>

      <div role="group" className="grid overflow-hidden rounded-xl bg-background shadow-[var(--shadow-border)] sm:grid-cols-4" aria-label="当前页问题概览">
        <div className="p-4 sm:border-r sm:border-border/70"><p className="text-xs text-muted-foreground">未审阅</p><p className="font-number mt-1 text-2xl font-semibold">{statusCounts.unreviewed}</p></div>
        <div className="border-t border-border/70 p-4 sm:border-r sm:border-t-0"><p className="text-xs text-muted-foreground">已复现</p><p className="font-number mt-1 text-2xl font-semibold">{statusCounts.reproduced}</p></div>
        <div className="border-t border-border/70 p-4 sm:border-r sm:border-t-0"><p className="text-xs text-muted-foreground">已修复</p><p className="font-number mt-1 text-2xl font-semibold">{statusCounts.fixed}</p></div>
        <div className="border-t border-border/70 p-4 sm:border-t-0"><p className="text-xs text-muted-foreground">求解报错</p><p className="font-number mt-1 text-2xl font-semibold">{runs.total}</p></div>
      </div>

      {message ? <p role="status" className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:bg-emerald-950/35 dark:text-emerald-200">{message}</p> : null}
      {error ? <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p> : null}

      <Tabs defaultValue="feedback" className="gap-5">
        <TabsList variant="line" className="w-full justify-start border-b border-border/70">
          <TabsTrigger value="feedback" className="flex-none px-3 pb-2">设施反馈 <span className="font-number">{feedback.total}</span></TabsTrigger>
          <TabsTrigger value="errors" className="flex-none px-3 pb-2">求解报错 <span className="font-number">{runs.total}</span></TabsTrigger>
        </TabsList>

        <TabsContent value="feedback" className="grid gap-5">
          <section aria-labelledby="feedback-filters" className="grid gap-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 id="feedback-filters" className="font-semibold">设施反馈队列</h2>
                <p className="mt-1 text-xs text-muted-foreground">状态数量与设施数量基于当前页。</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={!visibleFeedback.length}
                  onClick={() => setSelected(allVisibleSelected ? new Set() : new Set(visibleFeedback.map((item) => item.id)))}
                >
                  {allVisibleSelected ? "取消全选" : "选择当前设施"}
                </Button>
                <Button type="button" variant="destructive" disabled={!selected.size} onClick={() => setConfirmDelete(true)}>
                  <Trash2 aria-hidden="true" />批量删除 {selected.size ? `(${selected.size})` : ""}
                </Button>
              </div>
            </div>

            <div role="group" className="flex flex-wrap gap-1" aria-label="按审阅状态筛选">
              <Button type="button" size="sm" variant={statusFilter === "all" ? "secondary" : "ghost"} aria-pressed={statusFilter === "all"} onClick={() => { setFeedbackOffset(0); setStatusFilter("all"); }}>全部</Button>
              {(Object.keys(STATUS_LABELS) as AdminFeedbackStatus[]).map((status) => (
                <Button key={status} type="button" size="sm" variant={statusFilter === status ? "secondary" : "ghost"} aria-pressed={statusFilter === status} onClick={() => { setFeedbackOffset(0); setStatusFilter(status); }}>
                  {STATUS_LABELS[status]}
                </Button>
              ))}
            </div>

            <div role="group" className="flex gap-1 overflow-x-auto pb-1" aria-label="按设施筛选">
              <Button type="button" size="sm" variant={facilityFilter === "all" ? "secondary" : "ghost"} className="shrink-0" aria-pressed={facilityFilter === "all"} onClick={() => { setFeedbackOffset(0); setFacilityFilter("all"); }}>全部设施</Button>
              {FACILITY_FILTERS.map((facility) => (
                <Button key={facility} type="button" size="sm" variant={facilityFilter === facility ? "secondary" : "ghost"} className="shrink-0" aria-pressed={facilityFilter === facility} onClick={() => { setFeedbackOffset(0); setFacilityFilter(facility); }}>
                  {FACILITY_LABELS[facility]}
                </Button>
              ))}
            </div>
          </section>

          {loadingFeedback ? <p role="status" className="flex items-center gap-2 py-12 text-sm text-muted-foreground"><Loader2 className="animate-spin" />正在读取反馈…</p> : null}
          {!loadingFeedback && !groupedFeedback.length ? (
            <div className="grid min-h-52 place-items-center rounded-xl bg-background p-6 text-center shadow-[var(--shadow-border)]">
              <div><Inbox className="mx-auto size-8 text-muted-foreground" aria-hidden="true" /><p className="mt-3 font-medium">没有匹配的反馈</p><p className="mt-1 text-sm text-muted-foreground">更换状态或设施筛选后再查看。</p></div>
            </div>
          ) : null}
          {groupedFeedback.map(([facility, items]) => (
            <section key={facility} aria-labelledby={`facility-${facility}`} className="grid gap-3">
              <div className="flex items-center gap-2">
                <h2 id={`facility-${facility}`} className="text-sm font-semibold">{FACILITY_LABELS[facility]}</h2>
                <span className="font-number text-xs text-muted-foreground">{items.length}</span>
              </div>
              {items.map((item) => {
                const key = `feedback:${item.id}`;
                return (
                  <FeedbackRow
                    key={item.id}
                    item={item}
                    selected={selected.has(item.id)}
                    busy={busyStatusId === item.id}
                    detail={details[key]}
                    expanded={expanded === key}
                    onSelect={(checked) => setSelected((current) => {
                      const next = new Set(current);
                      if (checked) next.add(item.id); else next.delete(item.id);
                      return next;
                    })}
                    onStatus={(status) => void updateStatus(item, status)}
                    onToggleDetail={() => void toggleDetail(key, `/api/admin/feedback/${encodeURIComponent(item.id)}`)}
                  />
                );
              })}
            </section>
          ))}
          <div className="flex items-center justify-between gap-3 border-t border-border/70 pt-4">
            <p className="font-number text-xs text-muted-foreground">{feedback.total ? `${feedback.offset + 1}–${Math.min(feedback.offset + feedback.items.length, feedback.total)} / ${feedback.total}` : "0 条"}</p>
            <div className="flex gap-2">
              <Button type="button" variant="outline" disabled={feedbackOffset === 0 || loadingFeedback} onClick={() => setFeedbackOffset(Math.max(0, feedbackOffset - PAGE_SIZE))}>上一页</Button>
              <Button type="button" variant="outline" disabled={feedbackOffset + feedback.items.length >= feedback.total || loadingFeedback} onClick={() => setFeedbackOffset(feedbackOffset + PAGE_SIZE)}>下一页</Button>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="errors" className="grid gap-4">
          <div>
            <h2 className="font-semibold">求解报错记录</h2>
            <p className="mt-1 text-sm text-muted-foreground">只列出失败求解。CLI 输出按现有保存情况展示，复现输入不足时会明确标记。</p>
          </div>
          {loadingRuns ? <p role="status" className="flex items-center gap-2 py-12 text-sm text-muted-foreground"><Loader2 className="animate-spin" />正在读取求解报错…</p> : null}
          {!loadingRuns && !runs.items.length ? (
            <div className="grid min-h-52 place-items-center rounded-xl bg-background p-6 text-center shadow-[var(--shadow-border)]">
              <div><Bug className="mx-auto size-8 text-muted-foreground" aria-hidden="true" /><p className="mt-3 font-medium">当前没有求解报错</p></div>
            </div>
          ) : null}
          {runs.items.map((item) => {
            const key = `run:${item.diagnosticId}`;
            return (
              <RunRow
                key={item.diagnosticId}
                item={item}
                detail={details[key]}
                expanded={expanded === key}
                onToggleDetail={() => void toggleDetail(key, `/api/admin/plan-runs/${encodeURIComponent(item.diagnosticId)}`)}
              />
            );
          })}
          <div className="flex items-center justify-between gap-3 border-t border-border/70 pt-4">
            <p className="font-number text-xs text-muted-foreground">{runs.total ? `${runs.offset + 1}–${Math.min(runs.offset + runs.items.length, runs.total)} / ${runs.total}` : "0 条"}</p>
            <div className="flex gap-2">
              <Button type="button" variant="outline" disabled={runOffset === 0 || loadingRuns} onClick={() => setRunOffset(Math.max(0, runOffset - PAGE_SIZE))}>上一页</Button>
              <Button type="button" variant="outline" disabled={runOffset + runs.items.length >= runs.total || loadingRuns} onClick={() => setRunOffset(runOffset + PAGE_SIZE)}>下一页</Button>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      <Dialog open={confirmDelete} onOpenChange={(open) => { if (!deleting) setConfirmDelete(open); }}>
        <DialogContent role="alertdialog" showCloseButton={!deleting}>
          <DialogHeader>
            <DialogTitle>删除选中的 {selected.size} 条反馈？</DialogTitle>
            <DialogDescription>反馈摘要、审阅记录和对应反馈附件会删除；关联的求解运行记录仍按原保留期保存。</DialogDescription>
          </DialogHeader>
          <DialogBody><p className="text-sm text-muted-foreground">删除后不能从管理后台恢复。</p></DialogBody>
          <DialogFooter className="flex-col sm:flex-row">
            <Button type="button" size="dialog" variant="ghost" className="w-full sm:w-auto" disabled={deleting} onClick={() => setConfirmDelete(false)}>取消</Button>
            <Button type="button" size="dialog" variant="destructive" className="w-full sm:w-auto" disabled={deleting || !selected.size} onClick={() => void deleteSelected()}>
              {deleting ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Trash2 aria-hidden="true" />}
              {deleting ? "正在删除" : "确认删除"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}
