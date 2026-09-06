"use client";
import { useTranslations } from "next-intl";

import { WebsiteAccountPanel } from "@/components/auth/WebsiteAccountPanel";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

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
  const intl = useTranslations();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        data-website-account-dialog
        finalFocus={false}
        className="max-h-[calc(100dvh-1rem)] overflow-y-auto sm:max-w-[min(880px,calc(100vw-2rem))]"
      >
        <DialogHeader className="sr-only">
          <DialogTitle>{intl("components_auth_WebsiteAccountDialog.websiteAccountSignIn")}</DialogTitle>
          <DialogDescription>{intl("components_auth_WebsiteAccountDialog.signInToManageYourWebsiteAccount")}</DialogDescription>
        </DialogHeader>
        <div className="relative z-[1]">
          <WebsiteAccountPanel loadingMode="dialog" onSessionChanged={onSessionChanged} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
