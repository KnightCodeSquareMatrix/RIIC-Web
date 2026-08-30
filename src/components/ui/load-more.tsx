"use client";

/*
 * Interaction adapted from interior.dev by Dominic Doemann.
 * Source: https://github.com/ddoemonn/interior/blob/main/components/interior/load-more.tsx
 * Licensed under the MIT License: https://github.com/ddoemonn/interior/blob/main/LICENSE
 */

import { AlertCircle, Check, ChevronDown, LoaderCircle } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

type LoadMoreStatus = "idle" | "loading" | "error" | "end";

export function LoadMore({
  onLoad,
  hasMore,
  auto = true,
  rootMargin = "500px 0px",
  maxAutoLoads = 3,
  className,
}: {
  onLoad: () => boolean | Promise<boolean>;
  hasMore: boolean;
  auto?: boolean;
  rootMargin?: string;
  maxAutoLoads?: number;
  className?: string;
}) {
  const [phase, setPhase] = useState<Exclude<LoadMoreStatus, "end">>("idle");
  const sentinelRef = useRef<HTMLDivElement>(null);
  const busyRef = useRef(false);
  const autoRunsRef = useRef(0);
  const mountedRef = useRef(true);
  const reducedMotion = useReducedMotion();
  const status: LoadMoreStatus = hasMore ? phase : "end";

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const load = useCallback((manual: boolean) => {
    if (!hasMore || busyRef.current) return;
    if (!manual && autoRunsRef.current >= maxAutoLoads) return;
    if (manual) autoRunsRef.current = 0;
    else autoRunsRef.current += 1;
    busyRef.current = true;
    setPhase("loading");
    void Promise.resolve(onLoad()).then(
      () => {
        busyRef.current = false;
        if (mountedRef.current) setPhase("idle");
      },
      () => {
        busyRef.current = false;
        if (mountedRef.current) setPhase("error");
      },
    );
  }, [hasMore, maxAutoLoads, onLoad]);

  useEffect(() => {
    if (!auto || !hasMore || typeof IntersectionObserver === "undefined") return;
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry?.isIntersecting) load(false);
      else autoRunsRef.current = 0;
    }, { rootMargin, threshold: 0 });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [auto, hasMore, load, rootMargin]);

  const presentation = {
    idle: { label: "加载更多", icon: ChevronDown },
    loading: { label: "正在加载", icon: LoaderCircle },
    error: { label: "加载失败，点击重试", icon: AlertCircle },
    end: { label: "已显示全部结果", icon: Check },
  }[status];
  const inert = status === "loading" || status === "end";

  return (
    <div className={cn("relative flex min-h-12 w-full items-center justify-center", className)} data-load-more data-load-more-status={status}>
      <div ref={sentinelRef} className="pointer-events-none absolute inset-x-0 top-0 h-px" aria-hidden="true" />
      <button
        type="button"
        aria-busy={status === "loading" || undefined}
        aria-disabled={inert || undefined}
        onClick={() => { if (!inert) load(true); }}
        className={cn(
          "relative inline-grid min-h-11 min-w-40 place-items-center overflow-hidden px-4 text-xs font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[#FFD501] focus-visible:ring-offset-2",
          inert ? "cursor-default text-muted-foreground" : "cursor-pointer text-foreground hover:bg-[#313131]/5",
          status === "error" && "text-destructive",
        )}
      >
        {(["idle", "loading", "error", "end"] as LoadMoreStatus[]).map((item) => (
          <motion.span
            key={item}
            className="col-start-1 row-start-1 flex items-center gap-2 whitespace-nowrap"
            initial={false}
            animate={item === status ? { opacity: 1, y: 0, filter: "blur(0px)" } : { opacity: 0, y: 3, filter: "blur(3px)" }}
            transition={reducedMotion ? { duration: 0 } : { type: "spring", stiffness: 260, damping: 34, mass: 0.8 }}
            aria-hidden={item !== status}
          >
            <IconForStatus status={item} spinning={item === "loading" && status === "loading" && !reducedMotion} />
            {{ idle: "加载更多", loading: "正在加载", error: "加载失败，点击重试", end: "已显示全部结果" }[item]}
          </motion.span>
        ))}
        <span className="sr-only">{presentation.label}</span>
      </button>
      <span role="status" aria-live="polite" className="sr-only">{status === "error" || status === "end" ? presentation.label : ""}</span>
    </div>
  );
}

function IconForStatus({ status, spinning }: { status: LoadMoreStatus; spinning: boolean }) {
  const Icon = status === "idle" ? ChevronDown : status === "loading" ? LoaderCircle : status === "error" ? AlertCircle : Check;
  return <Icon className={cn("size-3.5", spinning && "animate-spin")} aria-hidden="true" />;
}
