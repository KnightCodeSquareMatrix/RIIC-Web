"use client";

import Link from "next/link";
import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useLanguageDemo } from "@/language-demo";
import type { ReleaseNote } from "@/releases/types";
import { ReleaseNotes } from "./ReleaseNotes";

export function ReleaseDialog({ open, onOpenChange, release: latestRelease, showHistoryLink = true }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  showHistoryLink?: boolean;
  release: ReleaseNote;
}) {
  const { locale } = useLanguageDemo();
  const en = locale === "en";
  const dismissRef = useRef<HTMLButtonElement>(null);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[calc(100dvh-2rem)] grid-rows-[auto_minmax(0,1fr)_auto] sm:max-w-[min(600px,calc(100vw-2rem))]"
        data-release-dialog
        aria-label={en ? `What's new in v${latestRelease.version}` : `本次更新 v${latestRelease.version}`}
        initialFocus={dismissRef}
      >
        <DialogHeader>
          <DialogTitle>{en ? "What's new" : "本次更新"} <span className="font-number">v{latestRelease.version}</span></DialogTitle>
          <DialogDescription>
            {latestRelease.title[en ? "en" : "zh"] || latestRelease.title.zh} · <time dateTime={latestRelease.date} className="font-number">{latestRelease.date}</time>
          </DialogDescription>
        </DialogHeader>
        <ScrollArea className="min-h-0" viewportClassName="overscroll-contain">
          <DialogBody><ReleaseNotes release={latestRelease} /></DialogBody>
        </ScrollArea>
        <DialogFooter className="max-sm:flex-col-reverse">
          {showHistoryLink ? (
            <Button variant="outline" size="dialog" nativeButton={false}
              className="max-sm:w-full"
              render={<Link prefetch={false} href={`/changelog#v${latestRelease.version}`} />}
              onClick={() => onOpenChange(false)}>
              {en ? "Full changelog" : "查看完整日志"}
            </Button>
          ) : null}
          <Button ref={dismissRef} size="dialog" className="max-sm:w-full" onClick={() => onOpenChange(false)}>
            {en ? "Got it" : "知道了"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
