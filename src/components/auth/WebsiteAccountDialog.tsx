"use client";

import { WebsiteAccountPanel } from "@/components/auth/WebsiteAccountPanel";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useLanguageDemo } from "@/language-demo";

interface WebsiteAccountDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSessionChanged: (authenticated: boolean) => void | Promise<void>;
}

export function WebsiteAccountDialog({
  open,
  onOpenChange,
  onSessionChanged,
}: WebsiteAccountDialogProps) {
  const { locale } = useLanguageDemo();
  const en = locale === "en";
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        data-website-account-dialog
        finalFocus={false}
        className="max-h-[calc(100dvh-1rem)] overflow-y-auto sm:max-w-[min(880px,calc(100vw-2rem))]"
      >
        <DialogHeader className="sr-only">
          <DialogTitle>{en ? "Website account sign-in" : "登录网站账号"}</DialogTitle>
          <DialogDescription>{en ? "Sign in to manage your website account." : "登录后进入账号管理。"}</DialogDescription>
        </DialogHeader>
        <div className="relative z-[1]">
          <WebsiteAccountPanel loadingMode="dialog" onSessionChanged={onSessionChanged} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
