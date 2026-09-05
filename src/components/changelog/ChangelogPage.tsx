"use client";

import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { InfoPageLayout } from "@/components/layout/InfoPageLayout";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { AppMotionProvider } from "@/components/MotionProvider";
import { useLanguageDemo } from "@/language-demo";
import { markBrowserReleaseSeen } from "@/releases/announcement-state";
import { useReleaseFeed } from "@/releases/use-release-feed";
import { ReleaseEntry } from "./ReleaseEntry";

const ReleaseDialog = lazy(() => import("./ReleaseDialog").then((module) => ({ default: module.ReleaseDialog })));

export function ChangelogPage() {
  const { locale } = useLanguageDemo();
  const en = locale === "en";
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMounted, setDialogMounted] = useState(false);
  const { feed, loading, error, refresh } = useReleaseFeed();
  const releaseHistory = feed?.releases ?? [];
  const latest = releaseHistory[0];
  const followedAnchor = useRef(false);
  useEffect(() => {
    if (latest && feed) markBrowserReleaseSeen(latest.version, feed.environment);
  }, [latest, feed]);
  useEffect(() => {
    if (!feed || followedAnchor.current) return;
    followedAnchor.current = true;
    const anchor = window.location.hash.slice(1);
    if (/^v\d+\.\d+\.\d+$/.test(anchor)) document.getElementById(anchor)?.scrollIntoView();
  }, [feed]);

  return (
    <AppMotionProvider>
      <InfoPageLayout title={en ? "Changelog" : "更新日志"} href="/changelog" contentId="changelog-content">
        <div className="mx-auto max-w-4xl" data-changelog-page>
          <header className="flex flex-wrap items-end justify-between gap-5 border-b border-border/80 py-8 sm:py-12">
            <div className="space-y-3">
              <h1 className="font-heading text-3xl font-semibold tracking-tight sm:text-4xl">{en ? "Changelog" : "更新日志"}</h1>
              <p className="text-sm leading-6 text-muted-foreground">{en ? "New features, improvements and fixes in published releases." : "已发布版本的新功能、体验优化与问题修复。"}</p>
            </div>
            <Button variant="outline" className="h-11 px-4 text-[13px]" aria-haspopup="dialog" disabled={!latest}
              onClick={() => { setDialogMounted(true); setDialogOpen(true); }}>
              {en ? "Latest update" : "查看本次更新"}
            </Button>
          </header>
          {loading && !feed ? <div className="space-y-5 py-8" role="status" aria-label={en ? "Loading changelog" : "正在加载更新日志"}>
            <Skeleton className="h-8 w-40" /><Skeleton className="h-32 w-full" />
          </div> : error ? <div role="alert" className="space-y-4 py-8">
            <p>{en ? "Unable to load the changelog. Please try again." : "更新日志暂时无法加载，请稍后重试。"}</p>
            <Button variant="outline" onClick={() => void refresh()}>{en ? "Retry" : "重试"}</Button>
          </div> : !releaseHistory.length ? <p className="py-10 text-sm text-muted-foreground">{en ? "No published updates yet." : "暂时没有已发布的更新。"}</p> : null}
          {releaseHistory.map((release, index) => <ReleaseEntry key={release.version} release={release} latest={index === 0} />)}
          <p className="py-7 text-sm leading-7 text-muted-foreground">
            {en ? "Looking for earlier releases or technical details? " : "需要更早的版本记录或技术细节？"}
            <a className="rounded-sm text-foreground underline underline-offset-4 outline-none focus-visible:ring-2 focus-visible:ring-ring"
              href="https://github.com/KnightCodeSquareMatrix/RIIC-Web/blob/main/CHANGELOG.md" target="_blank" rel="noopener noreferrer">
              {en ? "Read the repository changelog (new tab)" : "查看仓库完整日志（新标签页）"}
            </a>
          </p>
        </div>
      </InfoPageLayout>
      {dialogMounted && latest ? <Suspense fallback={null}><ReleaseDialog release={latest} open={dialogOpen} onOpenChange={setDialogOpen} showHistoryLink={false} /></Suspense> : null}
    </AppMotionProvider>
  );
}
