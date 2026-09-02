"use client";

import Link from "next/link";
import { ArrowLeft, ArrowRight, Check } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type ImportGuidePage = {
  id: string;
  title: string;
  summary: string;
  content: ReactNode;
};

type ImportGuidePagerProps = {
  pages: ImportGuidePage[];
};

function clampPage(value: number, totalPages: number) {
  return Math.min(Math.max(value, 0), Math.max(totalPages - 1, 0));
}

export function ImportGuidePager({ pages }: ImportGuidePagerProps) {
  const [pageIndex, setPageIndex] = useState(0);
  const pageTitleRef = useRef<HTMLHeadingElement | null>(null);
  const stepNavigationRef = useRef<HTMLDivElement | null>(null);
  const stepButtonRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const focusPageRef = useRef(false);
  const currentPage = pages[pageIndex] ?? pages[0];
  const progress = ((pageIndex + 1) / pages.length) * 100;

  useEffect(() => {
    const syncFromUrl = () => {
      const url = new URL(window.location.href);
      const params = url.searchParams;
      const requestedPage = Number.parseInt(params.get("step") ?? "1", 10) - 1;
      const normalizedPage = clampPage(Number.isFinite(requestedPage) ? requestedPage : 0, pages.length);
      let needsReplace = false;

      if (params.has("step") && requestedPage !== normalizedPage) {
        url.searchParams.set("step", String(normalizedPage + 1));
        needsReplace = true;
      }

      if (needsReplace) window.history.replaceState({}, "", url);
      setPageIndex(normalizedPage);
    };

    const handlePopState = () => {
      focusPageRef.current = true;
      syncFromUrl();
    };

    syncFromUrl();
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [pages.length]);

  useEffect(() => {
    if (!focusPageRef.current) return;
    focusPageRef.current = false;
    pageTitleRef.current?.focus({ preventScroll: true });
  }, [pageIndex]);

  useEffect(() => {
    const container = stepNavigationRef.current;
    const activeStep = stepButtonRefs.current[pageIndex];
    if (!container || !activeStep) return;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const left = activeStep.offsetLeft - (container.clientWidth - activeStep.clientWidth) / 2;
    container.scrollTo({ behavior: reduceMotion ? "auto" : "smooth", left: Math.max(0, left) });
  }, [pageIndex]);

  function writeUrl(nextPage: number, mode: "push" | "replace") {
    const url = new URL(window.location.href);
    url.searchParams.set("step", String(nextPage + 1));
    window.history[mode === "push" ? "pushState" : "replaceState"]({}, "", url);
  }

  function goToPage(nextPage: number) {
    const clamped = clampPage(nextPage, pages.length);

    if (clamped === pageIndex) {
      pageTitleRef.current?.focus({ preventScroll: true });
      return;
    }

    focusPageRef.current = true;
    setPageIndex(clamped);
    writeUrl(clamped, "push");
  }

  return (
    <div className="rounded-[4px] border border-border bg-background" data-help-import-step={pageIndex + 1}>
      <section aria-label="教程进度" className="border-b border-border bg-muted/20 px-4 py-5 sm:px-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-3 sm:gap-4">
            <span className="font-number grid size-10 shrink-0 place-items-center bg-foreground text-sm font-semibold text-background sm:size-11">
              {String(pageIndex + 1).padStart(2, "0")}
            </span>
            <div className="min-w-0">
              <p className="font-number text-xs font-semibold tracking-[0.12em] text-muted-foreground">
                第 {pageIndex + 1} 步 · 共 {pages.length} 步
              </p>
              <h2
                className="mt-1 text-lg font-semibold tracking-tight outline-none focus-visible:ring-2 focus-visible:ring-ring sm:text-xl"
                ref={pageTitleRef}
                tabIndex={-1}
              >
                {currentPage.title}
              </h2>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base sm:leading-7">{currentPage.summary}</p>
            </div>
          </div>
          <span className="font-number inline-flex min-h-8 items-center text-xs font-semibold text-muted-foreground">
            {Math.round(progress)}% 完成
          </span>
        </div>

        <div
          aria-label={`教程进度：第 ${pageIndex + 1} 页，共 ${pages.length} 页`}
          aria-valuemax={pages.length}
          aria-valuemin={1}
          aria-valuenow={pageIndex + 1}
          className="mt-5 h-1.5 overflow-hidden bg-border/70"
          role="progressbar"
        >
          <div className="h-full bg-[#FFD800] transition-[width] duration-200 motion-reduce:transition-none" style={{ width: `${progress}%` }} />
        </div>

        <nav aria-label="教程步骤导航" className="mt-5" data-help-step-navigation>
          <p className="sr-only">步骤导航，可点击直接跳转；窄屏可以左右滑动。</p>
          <p aria-hidden="true" className="mb-2 text-xs font-medium text-muted-foreground lg:hidden">左右滑动查看全部步骤</p>
          <div
            className="max-w-full snap-x snap-proximity overflow-x-auto overscroll-x-contain pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            data-help-step-navigation-scroll
            ref={stepNavigationRef}
          >
            <ol className="grid min-w-max grid-flow-col gap-2.5 lg:min-w-0 lg:grid-flow-row lg:grid-cols-5">
              {pages.map((page, index) => {
                const isCurrent = index === pageIndex;
                const isComplete = index < pageIndex;

                return (
                  <li className="w-52 snap-center lg:w-auto" key={page.id}>
                    <button
                      aria-label={`第 ${index + 1} 步：${page.title}。${page.summary}`}
                      aria-current={isCurrent ? "step" : undefined}
                      className={cn(
                        "group relative flex min-h-20 w-full cursor-pointer items-start gap-3 overflow-hidden rounded-[4px] border p-3 text-left outline-none transition-[background-color,border-color,transform] duration-200 focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transform-none motion-reduce:transition-none",
                        isCurrent
                          ? "border-foreground bg-foreground text-background"
                          : "border-border bg-background hover:-translate-y-0.5 hover:border-foreground/30 hover:bg-muted/60",
                      )}
                      data-help-step-target={index + 1}
                      onClick={() => goToPage(index)}
                      ref={(element) => {
                        stepButtonRefs.current[index] = element;
                      }}
                      type="button"
                    >
                      <span
                        className={cn(
                          "font-number mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-[2px] text-xs font-semibold",
                          isCurrent
                            ? "bg-background/15 text-background"
                            : isComplete
                              ? "bg-amber-300 text-black"
                              : "bg-muted text-muted-foreground",
                        )}
                      >
                        {isComplete ? <Check className="size-3.5" aria-hidden="true" /> : index + 1}
                      </span>
                      <span className="min-w-0">
                        <strong className={cn("block text-sm leading-5 sm:text-base sm:leading-6", isCurrent ? "text-background" : "text-foreground")}>{page.title}</strong>
                        <span className="sr-only">{page.summary}</span>
                        {isCurrent ? <span className="mt-1 block text-[10px] font-semibold tracking-[0.14em] text-background/60">正在查看</span> : null}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ol>
          </div>
        </nav>
      </section>

      <div className="px-4 py-6 sm:px-5 sm:py-7" data-help-import-page={currentPage.id}>
        {currentPage.content}
      </div>

      <nav aria-label="教程翻页" className="flex items-center justify-between gap-3 border-t border-border bg-muted/20 px-4 py-4 sm:px-5">
        <Button type="button" variant="outline" size="lg" disabled={pageIndex === 0} onClick={() => goToPage(pageIndex - 1)}>
          <ArrowLeft className="size-4" aria-hidden="true" />
          上一页
        </Button>
        <span className="hidden text-sm text-muted-foreground sm:inline">第 {pageIndex + 1} / {pages.length} 页</span>
        {pageIndex === pages.length - 1 ? (
          <Link
            className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground outline-none hover:bg-primary/80 focus-visible:ring-3 focus-visible:ring-ring/50"
            href="/"
          >
            完成并返回计算器
            <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        ) : (
          <Button type="button" size="lg" onClick={() => goToPage(pageIndex + 1)}>
            下一页
            <ArrowRight className="size-4" aria-hidden="true" />
          </Button>
        )}
      </nav>
    </div>
  );
}
