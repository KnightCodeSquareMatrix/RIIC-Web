"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Toggle } from "@/components/ui/toggle";
import { useLanguageDemo } from "@/language-demo";
import type { ReleaseDraft, ReleaseSection, ReleaseText } from "@/releases/types";
import { RELEASE_KINDS, RELEASE_LIMITS } from "@/releases/validation";
import { RELEASE_SECTION_LABELS } from "@/releases/presentation";

export function ReleaseEditor({ draft, onChange, versionLocked, disabled }: {
  draft: ReleaseDraft; onChange: (draft: ReleaseDraft) => void; versionLocked: boolean; disabled: boolean;
}) {
  const { locale } = useLanguageDemo();
  const en = locale === "en";
  const [language, setLanguage] = useState<"zh" | "en">("zh");
  function setItems(kind: ReleaseSection["kind"], items: ReleaseText[]) {
    const sections = RELEASE_KINDS.flatMap((candidate) => {
      const values = candidate === kind ? items : draft.sections.find((section) => section.kind === candidate)?.items ?? [];
      return values.length ? [{ kind: candidate, items: values }] : [];
    });
    onChange({ ...draft, sections });
  }
  return (
    <fieldset disabled={disabled} className="min-w-0 space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="release-version">{en ? "Version" : "版本号"}</Label>
          <Input id="release-version" className="h-11" value={draft.version} placeholder="0.6.1" maxLength={20}
            readOnly={versionLocked} aria-describedby={versionLocked ? "version-lock-hint" : undefined}
            onChange={(event) => onChange({ ...draft, version: event.target.value })} />
          {versionLocked ? <p id="version-lock-hint" className="text-xs text-muted-foreground">{en ? "Published versions cannot be renamed." : "发布过的版本号不可更改。"}</p> : null}
        </div>
        <div className="space-y-2">
          <Label htmlFor="release-date">{en ? "Release date" : "发布日期"}</Label>
          <Input id="release-date" type="date" className="h-11" value={draft.date}
            onChange={(event) => onChange({ ...draft, date: event.target.value })} />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Toggle variant="outline" pressed={draft.notify} onPressedChange={(notify) => onChange({ ...draft, notify })}
          className="h-11 px-4" aria-label={en ? "Notify in popup" : "弹窗通知"}>
          {draft.notify ? (en ? "Popup notification on" : "弹窗通知：开") : (en ? "Popup notification off" : "弹窗通知：关")}
        </Toggle>
        <p className="text-xs leading-5 text-muted-foreground">{en ? "Publishing text edits does not notify readers again." : "同版本的文字修正不会重复通知已读用户。"}</p>
      </div>
      <Tabs value={language} onValueChange={(value) => setLanguage(value as "zh" | "en")}>
        <TabsList aria-label={en ? "Content language" : "编辑内容语言"} className="h-11">
          <TabsTrigger value="zh">{en ? "Chinese" : "中文"}</TabsTrigger>
          <TabsTrigger value="en">{en ? "English (optional)" : "英文（可选）"}</TabsTrigger>
        </TabsList>
      <TabsContent value={language} className="space-y-6 pt-3">
      {language === "en" ? <p className="text-xs text-muted-foreground">{en ? "Blank English fields display Chinese instead." : "英文留空时，前台显示对应的中文内容。"}</p> : null}
      <div className="space-y-2">
        <Label htmlFor="release-title">{en ? "Update title" : "更新标题"}</Label>
        <Input id="release-title" value={draft.title[language]} className="h-11" maxLength={RELEASE_LIMITS.title}
          placeholder={en ? "What is the main change?" : "例如：专精规划上线"}
          onChange={(event) => onChange({ ...draft, title: { ...draft.title, [language]: event.target.value } })} />
      </div>
      {RELEASE_KINDS.map((kind) => {
        const items = draft.sections.find((section) => section.kind === kind)?.items ?? [];
        return (
          <section key={kind} className="space-y-3 border-t border-border/70 pt-5" aria-label={RELEASE_SECTION_LABELS[kind][en ? "en" : "zh"]}>
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold">{RELEASE_SECTION_LABELS[kind][en ? "en" : "zh"]}</h3>
              <Button type="button" variant="outline" disabled={items.length >= RELEASE_LIMITS.itemsPerSection} onClick={() => setItems(kind, [...items, { zh: "", en: "" }])}>
                {en ? "Add item" : "添加条目"}
              </Button>
            </div>
            {!items.length ? <p className="text-xs text-muted-foreground">{en ? "No items in this category." : "此分类暂无条目。"}</p> : null}
            {items.map((item, index) => (
              <div key={index} className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor={`release-${kind}-${index}`}>{RELEASE_SECTION_LABELS[kind][en ? "en" : "zh"]} {index + 1}</Label>
                  <Button type="button" variant="ghost" size="sm" onClick={() => setItems(kind, items.filter((_, itemIndex) => index !== itemIndex))}
                    aria-label={en ? `Remove ${kind} item ${index + 1}` : `移除${RELEASE_SECTION_LABELS[kind].zh}第 ${index + 1} 条`}>{en ? "Remove" : "移除"}</Button>
                </div>
                <Textarea id={`release-${kind}-${index}`} value={item[language]} maxLength={RELEASE_LIMITS.item} className="min-h-24"
                  onChange={(event) => setItems(kind, items.map((entry, itemIndex) => index === itemIndex ? { ...entry, [language]: event.target.value } : entry))} />
              </div>
            ))}
          </section>
        );
      })}
      </TabsContent>
      </Tabs>
    </fieldset>
  );
}
