"use client";

import { Badge } from "@/components/ui/badge";
import { useLanguageDemo } from "@/language-demo";
import type { ReleaseNote } from "@/releases/types";
import { RELEASE_SECTION_LABELS as sectionLabels } from "@/releases/presentation";

/** Shared by the public release history and the what's-new dialog. */
export function ReleaseNotes({ release }: { release: ReleaseNote }) {
  const { locale } = useLanguageDemo();
  const language = locale === "en" ? "en" : "zh";
  return (
    <div className="grid gap-6" data-release-notes={release.version}>
      {release.sections.map((section) => (
        <section key={section.kind} className="grid gap-2.5">
          <h3><Badge variant="outline">{sectionLabels[section.kind][language]}</Badge></h3>
          <ul className="list-disc space-y-2.5 pl-4 text-sm leading-7 marker:text-muted-foreground">
            {section.items.map((item, index) => <li key={index} className="pl-1 whitespace-pre-wrap break-words">{item[language] || item.zh}</li>)}
          </ul>
        </section>
      ))}
    </div>
  );
}
