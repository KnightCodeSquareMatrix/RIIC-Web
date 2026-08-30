"use client";

import { LoaderCircle } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface WebsiteAccountDialogLoadingProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function WebsiteAccountLoadingStatus() {
  return (
    <div
      className="grid min-h-72 place-items-center px-6 py-12 text-center"
      role="status"
      aria-live="polite"
      aria-busy="true"
      data-website-account-loading
    >
      <div className="grid justify-items-center gap-3">
        <LoaderCircle
          className="size-8 animate-spin text-muted-foreground motion-reduce:animate-none"
          aria-hidden="true"
          data-website-account-loading-spinner
        />
        <p className="text-sm text-muted-foreground">正在加载登录界面…</p>
      </div>
    </div>
  );
}

export function WebsiteAccountDialogLoading({
  open,
  onOpenChange,
}: WebsiteAccountDialogLoadingProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        data-website-account-dialog
        data-website-account-dialog-loading
        aria-busy="true"
        finalFocus={false}
        className="max-h-[calc(100dvh-1rem)] overflow-y-auto sm:max-w-[min(880px,calc(100vw-2rem))]"
      >
        <DialogHeader className="sr-only">
          <DialogTitle>登录网站账号</DialogTitle>
          <DialogDescription>登录界面正在加载。</DialogDescription>
        </DialogHeader>
        <div className="relative z-[1]">
          <WebsiteAccountLoadingStatus />
        </div>
      </DialogContent>
    </Dialog>
  );
}
