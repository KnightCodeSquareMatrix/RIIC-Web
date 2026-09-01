"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ADMIN_SOLVER_METRICS_REFRESH_INTERVAL_SECONDS } from "@/solver-metrics";
import type { AdminSolverMetricsData } from "@/types";

const PERCENT_FORMATTER = new Intl.NumberFormat("zh-CN", {
  style: "percent",
  minimumFractionDigits: 1,
  maximumFractionDigits: 2,
});
const TIME_FORMATTER = new Intl.DateTimeFormat("zh-CN", {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

type MetricsResponse = {
  data?: AdminSolverMetricsData;
  error?: { message?: string };
};

function percentage(value: number | null): string {
  return value === null ? "暂无样本" : PERCENT_FORMATTER.format(value);
}

export function AdminSolverMetrics() {
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
      if (!response.ok || !body.data) throw new Error(body.error?.message ?? "无法读取求解指标");
      setMetrics(body.data);
      setError(null);
    } catch (caught) {
      if (!(caught instanceof DOMException && caught.name === "AbortError")) {
        setError(caught instanceof Error ? caught.message : "无法读取求解指标");
      }
    } finally {
      if (requestRef.current === controller) {
        requestRef.current = null;
        setRefreshing(false);
      }
    }
  }, []);

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

  return (
    <section className="rounded-xl border p-4" data-admin-solver-metrics>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="font-medium">实时求解指标</h2>
            <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <span
                className={`size-1.5 rounded-full ${error ? "bg-destructive" : metrics ? "bg-emerald-500" : "animate-pulse bg-amber-500"}`}
                aria-hidden="true"
              />
              每 {ADMIN_SOLVER_METRICS_REFRESH_INTERVAL_SECONDS} 秒刷新
            </span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {metrics ? `数据生成于 ${TIME_FORMATTER.format(new Date(metrics.generatedAt))}` : "正在读取最近的求解数据…"}
          </p>
        </div>
        <Button type="button" size="sm" variant="outline" disabled={refreshing} onClick={() => void load()}>
          <RefreshCw aria-hidden="true" className={`size-3.5 ${refreshing ? "animate-spin" : ""}`} />
          {refreshing ? "刷新中" : "刷新"}
        </Button>
      </div>

      {metrics ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <article className="rounded-lg bg-muted/40 p-4" data-solver-error-rate={metrics.solver.errorRate ?? "unavailable"}>
            <p className="text-xs font-medium text-muted-foreground">最近 {metrics.solver.windowMinutes} 分钟求解错误率</p>
            <p className="mt-2 text-3xl font-semibold tabular-nums">{percentage(metrics.solver.errorRate)}</p>
            <p className="mt-2 text-xs text-muted-foreground">
              失败 {metrics.solver.failureCount} / 已完成 {metrics.solver.completedCount}，成功 {metrics.solver.successCount}
            </p>
            <p className="mt-3 border-t pt-3 text-xs leading-5 text-muted-foreground">
              仅统计已实际完成并写入记录的求解，不含排队、限流等 429 拒绝。
            </p>
          </article>

          <article className="rounded-lg bg-muted/40 p-4" data-cache-hit-rate={metrics.cache.hitRate ?? "unavailable"}>
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-medium text-muted-foreground">当前有效缓存池命中率</p>
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${metrics.cache.enabled ? "bg-emerald-50 text-emerald-700" : "bg-muted text-muted-foreground"}`}>
                {metrics.cache.enabled ? "已启用" : "未启用"}
              </span>
            </div>
            <p className="mt-2 text-3xl font-semibold tabular-nums">
              {metrics.cache.enabled ? percentage(metrics.cache.hitRate) : "未启用"}
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              命中 {metrics.cache.hitCount} / 可缓存访问 {metrics.cache.lookupCount} · 有效缓存项 {metrics.cache.readyEntryCount}
              {metrics.cache.fillingEntryCount ? ` · 填充中 ${metrics.cache.fillingEntryCount}` : ""}
            </p>
            <p className="mt-3 border-t pt-3 text-xs leading-5 text-muted-foreground">
              每个有效缓存项的首次填充计为未命中；森空岛求解按设计绕过缓存。
            </p>
          </article>
        </div>
      ) : null}

      {error ? (
        <p className="mt-3 text-sm text-destructive" role="status">
          {metrics ? `实时刷新失败，当前保留上次数据：${error}` : error}
        </p>
      ) : null}
    </section>
  );
}
