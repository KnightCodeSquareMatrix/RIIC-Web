"use client";
import { useLocale, useTranslations } from "next-intl";
import { useState, type ChangeEvent, type DragEvent } from "react";
import { Upload } from "lucide-react";
import { Label } from "@/components/ui/label";
import { messageRecord } from "@/i18n/translate";
import { cn } from "@/lib/utils";

export function FileDrop({
  fileName,
  onFile,
}: {
  fileName: string | null;
  onFile: (file: File) => void;
}) {
  const intl = useTranslations();
  const locale = useLocale();
  const en = locale === "en";
  const [dragActive, setDragActive] = useState(false);

  function importFirstFile(files: FileList | null) {
    const file = files?.[0];
    if (file) onFile(file);
  }

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    importFirstFile(event.target.files);
    event.currentTarget.value = "";
  }

  function handleDragEnter(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    if (event.dataTransfer.types.includes("Files")) setDragActive(true);
  }

  function handleDragLeave(event: DragEvent<HTMLLabelElement>) {
    if (event.currentTarget.contains(event.relatedTarget as Node)) return;
    setDragActive(false);
  }

  function handleDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setDragActive(false);
    importFirstFile(event.dataTransfer.files);
  }

  return (
    <Label
      pressable
      className={cn(
        "flex min-h-32 cursor-pointer flex-col items-center justify-center gap-2 rounded-[4px] border border-dashed bg-background px-4 py-5 text-center transition-[color,background-color,border-color] duration-[var(--motion-duration-state)] ease-[var(--motion-ease-out)] hover:border-primary/40 hover:bg-muted/40",
        dragActive && "border-primary bg-primary/10 text-primary ring-2 ring-primary/25 ring-offset-2",
      )}
      aria-label={intl("components.dropOrSelectAnOperatorDataFile")}
      data-slot="file-drop"
      data-dragging={dragActive || undefined}
      onDragEnter={handleDragEnter}
      onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "copy"; }}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <Upload className="size-5 text-primary" />
      <span className="font-medium text-foreground">
        {dragActive ? (intl("components.dropToImport")) : fileName ?? (intl("components.uploadRosterJsonXlsx"))}
      </span>
      <span className="flex flex-wrap items-center justify-center gap-1.5 text-xs" role="list" aria-label={intl("components.supportedMaaJsonLanguages")}>
        {(messageRecord(en, "components_labels")).map((language) => (
          <span key={language} role="listitem" className="rounded-full border border-border bg-muted/70 px-2 py-0.5 font-medium text-foreground">
            {language}
          </span>
        ))}
      </span>
      <span className="text-xs leading-relaxed text-muted-foreground">
        {intl("components.dropAFileOrChooseOneNamesAreConverted")}
      </span>
      <input className="sr-only" type="file" accept=".json,.xlsx,.xls" onChange={handleChange} />
    </Label>
  );
}
