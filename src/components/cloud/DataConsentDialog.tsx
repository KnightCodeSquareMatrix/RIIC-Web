"use client";

import Link from "next/link";
import { useId, useState } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
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

export function DataConsentDialog({
  open,
  saving,
  error,
  onAccept,
  onDecline,
}: {
  open: boolean;
  saving: boolean;
  error: string | null;
  onAccept: () => void;
  onDecline: () => void;
}) {
  const [terms, setTerms] = useState(false);
  const [privacy, setPrivacy] = useState(false);
  const id = useId();
  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next && !saving) onDecline(); }}>
      <DialogContent
        data-cloud-consent-dialog
        className="max-h-[calc(100dvh-1rem)] grid-rows-[auto_minmax(0,1fr)_auto] sm:max-h-[calc(100dvh-2rem)] sm:max-w-lg"
      >
        <DialogHeader>
          <DialogTitle>启用账号云端工作区</DialogTitle>
          <DialogDescription>
            同意后，本站会自动同步 MAA Box、布局、设置与最近排班。你也可以选择继续纯本地使用。
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="min-h-0 gap-4 overflow-y-auto overscroll-contain py-2 text-sm leading-6 text-muted-foreground sm:py-3">
          <ul className="list-disc space-y-1 pl-5">
            <li>MAA Box 使用每条独立密钥和 AES-256-GCM 信封加密，云端数据滚动保留 30 天。</li>
            <li>最近 5 条排班会同步；最多固定 5 条长期保留。</li>
            <li>第三方游戏账号的 UID、昵称、Box、凭据和完整状态快照不会写入业务数据库。</li>
          </ul>
          <label className="flex min-h-11 items-start gap-3" htmlFor={`${id}-terms`}>
            <input id={`${id}-terms`} type="checkbox" checked={terms} onChange={(event) => setTerms(event.target.checked)} className="mt-1 size-4 shrink-0 accent-primary" />
            <span>我已阅读并同意<Link href="/terms" target="_blank" className="mx-1 text-foreground underline underline-offset-4">服务条款</Link>。</span>
          </label>
          <label className="flex min-h-11 items-start gap-3" htmlFor={`${id}-privacy`}>
            <input id={`${id}-privacy`} type="checkbox" checked={privacy} onChange={(event) => setPrivacy(event.target.checked)} className="mt-1 size-4 shrink-0 accent-primary" />
            <span>我已阅读<Link href="/privacy" target="_blank" className="mx-1 text-foreground underline underline-offset-4">隐私政策</Link>并同意自动同步上述数据。</span>
          </label>
          {error ? <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert> : null}
        </DialogBody>
        <DialogFooter className="flex-col items-stretch border-t border-border/50 sm:flex-row sm:items-center">
          <Button className="w-full sm:w-auto" type="button" size="dialog" variant="outline" disabled={saving} onClick={onDecline}>继续纯本地模式</Button>
          <Button className="w-full sm:w-auto" type="button" size="dialog" disabled={saving || !terms || !privacy} onClick={onAccept}>{saving ? "正在启用…" : "同意并开始同步"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
