"use client";

import { ArrowRight, TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useLanguageDemo } from "@/language-demo";
import type { ManualScheduleDraft } from "@/manual-schedule";

export function ManualDraftReplaceDialog({
  draft,
  onCancel,
  onConfirm,
}: {
  draft: ManualScheduleDraft | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const { locale } = useLanguageDemo();
  const en = locale === "en";
  const sourceLabel = draft?.source?.variant === "progression-adjusted"
    ? (en ? "progression-adjusted plan" : "练度调整后方案")
    : (en ? "original plan" : "原方案");

  return (
    <Dialog open={Boolean(draft)} onOpenChange={(open) => { if (!open) onCancel(); }}>
      <DialogContent className="gap-5 max-sm:px-4 sm:max-w-md sm:p-6" data-manual-draft-replace-dialog>
        <DialogHeader className="gap-2 px-1 sm:px-2">
          <div className="mb-1 flex size-10 items-center justify-center rounded-full bg-amber-100 text-amber-800" aria-hidden="true">
            <TriangleAlert className="size-5" />
          </div>
          <DialogTitle className="text-lg font-semibold">
            {en ? "Replace the existing manual draft?" : "替换现有手动草稿？"}
          </DialogTitle>
          <DialogDescription className="text-sm leading-6">
            {en
              ? `Creating a manual schedule from the ${sourceLabel} will replace your saved manual draft. This cannot be undone automatically.`
              : `基于「${sourceLabel}」创建手动排班会替换你已保存的手动草稿，且无法自动撤销。`}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" onClick={onCancel}>
            {en ? "Keep existing draft" : "保留现有草稿"}
          </Button>
          <Button type="button" onClick={onConfirm}>
            {en ? "Replace and continue" : "替换并进入"}<ArrowRight />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
