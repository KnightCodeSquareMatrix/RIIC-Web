"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ADMIN_SOLVER_METRICS_REFRESH_INTERVAL_SECONDS } from "@/solver-metrics-config";
import type { AdminSolverMetricsData } from "@/types";
import { useLanguageDemo } from "@/language-demo";

function MetricsChartLoading() {
  const { locale } = useLanguageDemo();
  return <div className="h-[280px] animate-pulse rounded-xl bg-muted/45 sm:h-[320px]" aria-label={locale === "en" ? "Loading solver trend chart" : "正在加载求解趋势图"} />;
}

const AdminSolverMetricsChart = dynamic(
  () => import("./solver-metrics-chart").then((module) => module.AdminSolverMetricsChart),
  {
    ssr: false,
    loading: () => <MetricsChartLoading />,
  },
);

const PERCENT_FORMATTER = new Intl.NumberFormat("zh-CN", {
  style: "percent",
  minimumFractionDigits: 1,
  maximumFractionDigits: 2,
});
const DECIMAL_FORMATTER = new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 2 });
const TIME_FORMATTER = new Intl.DateTimeFormat("zh-CN", {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

type MetricsResponse = {
  data?: AdminSolverMetricsData;
  error?: { message?: string };
};

function percentage(value: number | null, en = false): string {
  return value === null ? (en ? "No samples" : "暂无样本") : PERCENT_FORMATTER.format(value);
}

function duration(value: number | null, en = false): string {
  if (value === null) return en ? "No samples" : "暂无样本";
  return value < 1_000 ? `${value} ms` : `${DECIMAL_FORMATTER.format(value / 1_000)} s`;
}

function Metric({ label, value, detail, dataAttribute }: {
  label: string;
  value: string;
  detail: string;
  dataAttribute?: Record<string, string | number>;
}) {
  return (
    <div className="min-w-0 px-4 py-4 first:pt-0 last:pb-0 md:py-1 md:first:pt-1 md:last:pb-1" {...dataAttribute}>
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-2 text-2xl font-semibold tracking-tight tabular-nums sm:text-3xl">{value}</p>
      <p className="mt-1.5 text-xs leading-5 text-muted-foreground">{detail}</p>
    </div>
  );
}

export function AdminSolverMetrics() {
  const { locale } = useLanguageDemo();
  const en = locale === "en";
  const [metrics, setMetrics] = useState<AdminSolverMetricsData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const requestRef = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    if (requestRef.current) return;
    const controller = new AbortController();
    requestRef.current = controller;
    setRefreshing(true);
    try {
      const response = await fetch("/api/admin/solver-metrics", {
        cache: "no-store",
        signal: controller.signal,
      });
      const body = await response.json() as MetricsResponse;
      if (!response.ok || !body.data) throw new Error(body.error?.message ?? (en ? "Could not load solver metrics" : "无法读取求解指标"));
      setMetrics(body.data);
      setError(null);
    } catch (caught) {
      if (!(caught instanceof DOMException && caught.name === "AbortError")) {
        setError(caught instanceof Error ? caught.message : (en ? "Could not load solver metrics" : "无法读取求解指标"));
      }
    } finally {
      if (requestRef.current === controller) {
        requestRef.current = null;
        setRefreshing(false);
      }
    }
  }, [en]);

  useEffect(() => {
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") void load();
    };
    refreshWhenVisible();
    const interval = window.setInterval(
      refreshWhenVisible,
      ADMIN_SOLVER_METRICS_REFRESH_INTERVAL_SECONDS * 1_000,
    );
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
      const activeRequest = requestRef.current;
      requestRef.current = null;
      activeRequest?.abort();
    };
  }, [load]);

  const hasTrendData = metrics?.solver.trend.some((point) => point.completedCount > 0) ?? false;

  return (
    <section id="solver-metrics" className="scroll-mt-24 overflow-hidden rounded-2xl border bg-card" data-admin-solver-metrics>
      <header className="flex flex-wrap items-start justify-between gap-4 border-b px-5 py-5 sm:px-6">
        <div className="flex gap-3">
          <span className="pt-0.5 font-mono text-xs text-muted-foreground" aria-hidden="true">02</span>
          <div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <h2 className="text-lg font-semibold tracking-tight">{en ? "Live solver metrics" : "实时求解指标"}</h2>
              <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className={`size-1.5 rounded-full ${error ? "bg-destructive" : metrics ? "bg-emerald-500" : "animate-pulse bg-amber-500"}`} aria-hidden="true" />
                {en ? `Refreshes every ${ADMIN_SOLVER_METRICS_REFRESH_INTERVAL_SECONDS} seconds` : `每 ${ADMIN_SOLVER_METRICS_REFRESH_INTERVAL_SECONDS} 秒刷新`}
              </span>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {metrics ? (en ? `Updated ${TIME_FORMATTER.format(new Date(metrics.generatedAt))}` : `更新于 ${TIME_FORMATTER.format(new Date(metrics.generatedAt))}`) : (en ? "Loading recent solver data…" : "正在读取最近的求解数据…")}
            </p>
          </div>
        </div>
        <Button type="button" size="sm" variant="outline" disabled={refreshing} onClick={() => void load()}>
          <RefreshCw aria-hidden="true" className={`size-3.5 ${refreshing ? "animate-spin" : ""}`} />
          {refreshing ? (en ? "Refreshing" : "刷新中") : (en ? "Refresh" : "刷新")}
        </Button>
      </header>

      {metrics ? (
        <div>
          <div className="grid divide-y px-5 py-5 md:grid-cols-4 md:divide-x md:divide-y-0 md:px-2 sm:px-6">
            <Metric
              label={en ? `Error rate · last ${metrics.solver.windowMinutes} min` : `最近 ${metrics.solver.windowMinutes} 分钟错误率`}
              value={percentage(metrics.solver.errorRate, en)}
              detail={en ? `Failed ${metrics.solver.failureCount} / completed ${metrics.solver.completedCount}` : `失败 ${metrics.solver.failureCount} / 完成 ${metrics.solver.completedCount}`}
              dataAttribute={{ "data-solver-error-rate": metrics.solver.errorRate ?? "unavailable" }}
            />
            <Metric
              label={en ? "Completion throughput" : "完成吞吐"}
              value={`${DECIMAL_FORMATTER.format(metrics.solver.throughputPerMinute)} / min`}
              detail={en ? `Succeeded ${metrics.solver.successCount}, failed ${metrics.solver.failureCount}` : `成功 ${metrics.solver.successCount}，失败 ${metrics.solver.failureCount}`}
            />
            <Metric
              label={en ? "Solver compute time" : "求解器纯计算耗时"}
              value={duration(metrics.solver.averageSolverDurationMs, en)}
              detail={en ? `P95 ${duration(metrics.solver.p95SolverDurationMs, en)} · average worker end-to-end ${duration(metrics.solver.averageWorkerDurationMs, en)}` : `P95 ${duration(metrics.solver.p95SolverDurationMs)} · Worker 全链路平均 ${duration(metrics.solver.averageWorkerDurationMs)}`}
            />
            <Metric
              label={en ? "Current task queue" : "当前任务队列"}
              value={en ? `${metrics.queue.pendingCount} queued` : `${metrics.queue.pendingCount} 排队`}
              detail={en ? `Candidates ${metrics.queue.bufferedCount} · running ${metrics.queue.runningCount} · average wait ${duration(metrics.queue.averageWaitMs, en)}` : `候选 ${metrics.queue.bufferedCount} · 执行中 ${metrics.queue.runningCount} · 平均等待 ${duration(metrics.queue.averageWaitMs)}`}
              dataAttribute={{ "data-pending-task-count": metrics.queue.pendingCount }}
            />
          </div>

          <div className="border-t px-5 py-5 sm:px-6">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div>
                <h3 className="font-medium">{en ? "Completion trend" : "完成量趋势"}</h3>
                <p className="mt-1 text-xs text-muted-foreground">{en ? `Last ${metrics.solver.trendWindowMinutes} min · ${metrics.solver.trendBucketMinutes}-minute buckets` : `过去 ${metrics.solver.trendWindowMinutes} 分钟 · 每 ${metrics.solver.trendBucketMinutes} 分钟聚合`}</p>
              </div>
              {!hasTrendData ? <span className="text-xs text-muted-foreground">{en ? "No completed solves in this window" : "当前窗口暂无完成求解"}</span> : null}
            </div>
            <div className="mt-4">
              <AdminSolverMetricsChart trend={metrics.solver.trend} />
            </div>
          </div>

          <div className="grid border-t lg:grid-cols-[0.8fr_0.8fr_1.4fr] lg:divide-x">
            <div className="px-5 py-5 sm:px-6">
              <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{en ? "Sources · 15 minutes" : "来源构成 · 15 分钟"}</h3>
              <dl className="mt-3 grid grid-cols-3 gap-3">
                <div><dt className="text-xs text-muted-foreground">MAA</dt><dd className="mt-1 text-lg font-semibold tabular-nums">{metrics.solver.sourceCounts.maa}</dd></div>
                <div><dt className="text-xs text-muted-foreground">{en ? "Skland" : "森空岛"}</dt><dd className="mt-1 text-lg font-semibold tabular-nums">{metrics.solver.sourceCounts.skland}</dd></div>
                <div><dt className="text-xs text-muted-foreground">{en ? "Sample" : "示例"}</dt><dd className="mt-1 text-lg font-semibold tabular-nums">{metrics.solver.sourceCounts.sample}</dd></div>
              </dl>
            </div>

            <div className="border-t px-5 py-5 sm:px-6 lg:border-t-0">
              <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{en ? "Queue wait · 15 minutes" : "队列等待 · 15 分钟"}</h3>
              <p className="mt-3 text-lg font-semibold tabular-nums">{duration(metrics.queue.averageWaitMs, en)}</p>
              <p className="mt-1 text-xs text-muted-foreground">P95 {duration(metrics.queue.p95WaitMs, en)}</p>
            </div>

            <div className="border-t px-5 py-5 sm:px-6 lg:border-t-0" data-cache-hit-rate={metrics.cache.hitRate ?? "unavailable"}>
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{en ? "Current active cache pool" : "当前有效缓存池"}</h3>
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${metrics.cache.enabled ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300" : "bg-muted text-muted-foreground"}`}>
                  {metrics.cache.enabled ? (en ? "Enabled" : "已启用") : (en ? "Disabled" : "未启用")}
                </span>
              </div>
              <p className="mt-3 text-2xl font-semibold tabular-nums">{metrics.cache.enabled ? percentage(metrics.cache.hitRate, en) : (en ? "Disabled" : "未启用")}</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                {en ? `Hits ${metrics.cache.hitCount} / cacheable lookups ${metrics.cache.lookupCount} · ready entries ${metrics.cache.readyEntryCount}` : `命中 ${metrics.cache.hitCount} / 可缓存访问 ${metrics.cache.lookupCount} · 有效项 ${metrics.cache.readyEntryCount}`}
                {metrics.cache.fillingEntryCount ? (en ? ` · filling ${metrics.cache.fillingEntryCount}` : ` · 填充中 ${metrics.cache.fillingEntryCount}`) : ""}
              </p>
            </div>
          </div>

          <p className="border-t px-5 py-3 text-xs leading-5 text-muted-foreground sm:px-6">
            {en ? "The error rate covers recorded solver runs only; it excludes rate limits and admission rejection. Queue figures cover asynchronous tasks only. Cache hits and misses use the task’s actual execution source, and Skland solves bypass the cache by design." : "错误率只统计已写入记录的实际求解，不含限流或准入拒绝；队列数字只统计异步任务。缓存命中与未命中按任务实际执行来源统计，森空岛求解按设计绕过缓存。"}
          </p>
        </div>
      ) : (
        <div className="grid gap-4 px-5 py-5 sm:px-6" aria-hidden="true">
          <div className="grid gap-3 md:grid-cols-4">
            {Array.from({ length: 4 }, (_, index) => <div key={index} className="h-24 animate-pulse rounded-xl bg-muted/45" />)}
          </div>
          <div className="h-[280px] animate-pulse rounded-xl bg-muted/45" />
        </div>
      )}

      {error ? (
        <p className="border-t px-5 py-3 text-sm text-destructive sm:px-6" role="status">
          {metrics ? (en ? `Live refresh failed; showing the last data: ${error}` : `实时刷新失败，当前保留上次数据：${error}`) : error}
        </p>
      ) : null}
    </section>
  );
}
