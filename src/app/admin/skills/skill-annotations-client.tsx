"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { Check, Loader2, Pencil, Plus, Search, Trash2, X } from "lucide-react";

import { RichText } from "@/components/RichText";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useLanguageDemo } from "@/language-demo";
import {
  BUILDING_SKILL_CATALOG,
  OPERATOR_CATALOG,
  type OperatorAssetRecord,
} from "@/operatorPortraits";
import {
  SKILL_ANNOTATION_MAX_LENGTH,
  indexSkillAnnotations,
  skillAnnotationKey,
} from "@/skill-annotations";
import type {
  AdminSkillAnnotationData,
  AdminSkillAnnotationListData,
  AdminSkillAnnotationMutationData,
  ApiResponse,
} from "@/types";

type EditorState = {
  mode: "create" | "edit";
  annotationId: string | null;
  operatorId: string;
  skillId: string;
  note: string;
};

const EMPTY_EDITOR: EditorState = {
  mode: "create",
  annotationId: null,
  operatorId: "",
  skillId: "",
  note: "",
};

const operatorById = new Map(OPERATOR_CATALOG.map((operator) => [operator.id, operator]));

async function requestData<T>(url: string, init: RequestInit | undefined, fallback: string): Promise<T> {
  const response = await fetch(url, { cache: "no-store", ...init });
  let body: ApiResponse<T>;
  try {
    body = await response.json() as ApiResponse<T>;
  } catch {
    throw new Error(fallback);
  }
  if (!response.ok || !body.success) {
    throw new Error(body.success ? fallback : body.error.message || fallback);
  }
  return body.data;
}

function operatorSearchText(operator: OperatorAssetRecord): string {
  return [
    operator.name,
    operator.id,
    ...operator.buildingSkills.flatMap((ref) => {
      const skill = BUILDING_SKILL_CATALOG[ref.id];
      return skill ? [skill.name, skill.description] : [];
    }),
  ].join("\n").toLocaleLowerCase("zh-CN");
}

function OperatorIdentity({ operator }: { operator: OperatorAssetRecord }) {
  return (
    <span className="flex min-w-0 items-center gap-3">
      <span className="grid size-11 shrink-0 place-items-end overflow-hidden rounded-lg bg-muted">
        <img src={operator.portrait} alt="" className="h-full w-full object-cover object-top" aria-hidden="true" />
      </span>
      <span className="min-w-0">
        <span className="block truncate font-medium">{operator.name}</span>
        <span className="block truncate font-mono text-[11px] text-muted-foreground">{operator.id}</span>
      </span>
    </span>
  );
}

export function SkillAnnotationManager() {
  const { locale } = useLanguageDemo();
  const en = locale === "en";
  const [annotations, setAnnotations] = useState<AdminSkillAnnotationData[]>([]);
  const [query, setQuery] = useState("");
  const [operatorQuery, setOperatorQuery] = useState("");
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<AdminSkillAnnotationData | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const editorRef = useRef<HTMLElement>(null);

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError(null);
    try {
      const data = await requestData<AdminSkillAnnotationListData>(
        "/api/admin/skill-annotations",
        signal ? { signal } : undefined,
        en ? "Could not load skill notes." : "无法读取技能注释。",
      );
      setAnnotations(data.annotations);
    } catch (loadError) {
      if (signal?.aborted) return;
      setError(loadError instanceof Error ? loadError.message : (en ? "Could not load skill notes." : "无法读取技能注释。"));
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [en]);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const annotationIndex = useMemo(() => indexSkillAnnotations(annotations), [annotations]);
  const selectedOperator = editor?.operatorId ? operatorById.get(editor.operatorId) : undefined;
  const selectedSkill = editor?.skillId ? BUILDING_SKILL_CATALOG[editor.skillId] : undefined;

  const filteredAnnotations = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("zh-CN");
    if (!normalized) return annotations;
    return annotations.filter((annotation) => {
      const operator = operatorById.get(annotation.operatorId);
      const skill = BUILDING_SKILL_CATALOG[annotation.skillId];
      return [operator?.name, operator?.id, skill?.name, skill?.description, annotation.note]
        .filter(Boolean)
        .join("\n")
        .toLocaleLowerCase("zh-CN")
        .includes(normalized);
    });
  }, [annotations, query]);

  const matchingOperators = useMemo(() => {
    const normalized = operatorQuery.trim().toLocaleLowerCase("zh-CN");
    if (!normalized) return [];
    return OPERATOR_CATALOG
      .filter((operator) => operator.buildingSkills.length > 0 && operatorSearchText(operator).includes(normalized))
      .slice(0, 12);
  }, [operatorQuery]);

  function revealEditor(next: EditorState) {
    setEditor(next);
    setMessage(null);
    setError(null);
    requestAnimationFrame(() => editorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  function startCreate() {
    setOperatorQuery("");
    revealEditor({ ...EMPTY_EDITOR });
  }

  function startEdit(annotation: AdminSkillAnnotationData) {
    const operator = operatorById.get(annotation.operatorId);
    setOperatorQuery(operator?.name ?? annotation.operatorId);
    revealEditor({
      mode: "edit",
      annotationId: annotation.id,
      operatorId: annotation.operatorId,
      skillId: annotation.skillId,
      note: annotation.note,
    });
  }

  async function save() {
    if (!editor || !editor.operatorId || !editor.skillId || !editor.note.trim() || saving) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const editing = editor.mode === "edit" && Boolean(editor.annotationId);
      const data = await requestData<AdminSkillAnnotationMutationData>(
        editing
          ? `/api/admin/skill-annotations/${encodeURIComponent(editor.annotationId ?? "")}`
          : "/api/admin/skill-annotations",
        {
          method: editing ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(editing
            ? { note: editor.note }
            : { operatorId: editor.operatorId, skillId: editor.skillId, note: editor.note }),
        },
        en ? "Could not save the skill note." : "无法保存技能注释。",
      );
      setAnnotations((current) => [
        data.annotation,
        ...current.filter((annotation) => annotation.id !== data.annotation.id),
      ]);
      setEditor(null);
      setOperatorQuery("");
      setMessage(en ? "Skill note saved. It is now visible on the skill page." : "技能注释已保存，并已在技能查询页生效。");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : (en ? "Could not save the skill note." : "无法保存技能注释。"));
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete() {
    if (!deleting || saving) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      await requestData(
        `/api/admin/skill-annotations/${encodeURIComponent(deleting.id)}`,
        { method: "DELETE" },
        en ? "Could not delete the skill note." : "无法删除技能注释。",
      );
      setAnnotations((current) => current.filter((annotation) => annotation.id !== deleting.id));
      if (editor?.annotationId === deleting.id) setEditor(null);
      setDeleting(null);
      setMessage(en ? "Skill note deleted." : "技能注释已删除。");
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : (en ? "Could not delete the skill note." : "无法删除技能注释。"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <main id="admin-content" className="mx-auto grid max-w-7xl gap-6 px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b pb-5">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{en ? "Skill notes" : "技能注释"}</h1>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
            {en
              ? "Add operator-specific notes only when actual behavior differs from the source text or needs special context. These notes are stored separately from unpacked assets."
              : "仅在实际表现与原文不一致或需要特殊说明时添加。注释独立保存，不会被解包资源更新覆盖。"}
          </p>
        </div>
        <Button type="button" size="lg" onClick={startCreate} disabled={saving}>
          <Plus aria-hidden="true" />{en ? "New skill note" : "新建注释"}
        </Button>
      </header>

      {message ? <p role="status" className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:bg-emerald-950/35 dark:text-emerald-200">{message}</p> : null}
      {error ? <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p> : null}

      {editor ? (
        <AnnotationEditor
          editor={editor}
          editorRef={editorRef}
          operatorQuery={operatorQuery}
          matchingOperators={matchingOperators}
          selectedOperator={selectedOperator}
          selectedSkill={selectedSkill}
          annotationIndex={annotationIndex}
          saving={saving}
          en={en}
          onEditorChange={setEditor}
          onOperatorQueryChange={setOperatorQuery}
          onSave={() => void save()}
          onClose={() => { setEditor(null); setOperatorQuery(""); }}
        />
      ) : null}

      <section aria-labelledby="skill-note-list" className="grid gap-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="skill-note-list" className="font-semibold">{en ? "Published notes" : "已发布注释"}</h2>
            <p className="mt-1 text-xs text-muted-foreground">{en ? `${annotations.length} notes` : `共 ${annotations.length} 条`}</p>
          </div>
          <label className="relative w-full sm:w-80">
            <span className="sr-only">{en ? "Search published notes" : "搜索已发布注释"}</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input value={query} onChange={(event) => setQuery(event.target.value)} className="h-11 pl-9 pr-10" placeholder={en ? "Operator, skill, or note" : "搜索干员、技能或注释内容"} />
            {query ? (
              <button type="button" onClick={() => setQuery("")} className="absolute right-1 top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-md text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring" aria-label={en ? "Clear search" : "清空搜索"}>
                <X className="size-4" aria-hidden="true" />
              </button>
            ) : null}
          </label>
        </div>

        {loading ? <p role="status" className="flex items-center gap-2 py-12 text-sm text-muted-foreground"><Loader2 className="animate-spin" aria-hidden="true" />{en ? "Loading skill notes…" : "正在读取技能注释…"}</p> : null}
        {!loading && filteredAnnotations.length === 0 ? (
          <div className="grid min-h-52 place-items-center rounded-2xl border border-dashed bg-card/55 p-6 text-center">
            <div>
              <p className="font-medium">{query ? (en ? "No matching notes" : "没有匹配的注释") : (en ? "No skill notes yet" : "还没有技能注释")}</p>
              <p className="mt-1 text-sm text-muted-foreground">{query ? (en ? "Try another operator or skill name." : "可以换一个干员名或技能名。") : (en ? "Create the first note for a skill that needs clarification." : "为需要特殊说明的技能新建第一张注释卡片。")}</p>
              {!query ? <Button type="button" variant="outline" className="mt-4" onClick={startCreate}><Plus aria-hidden="true" />{en ? "New skill note" : "新建注释"}</Button> : null}
            </div>
          </div>
        ) : null}

        <div className="grid gap-3 lg:grid-cols-2">
          {filteredAnnotations.map((annotation) => (
            <AnnotationCard
              key={annotation.id}
              annotation={annotation}
              en={en}
              onEdit={() => startEdit(annotation)}
              onDelete={() => setDeleting(annotation)}
            />
          ))}
        </div>
      </section>

      <Dialog open={Boolean(deleting)} onOpenChange={(open) => { if (!open && !saving) setDeleting(null); }}>
        <DialogContent role="alertdialog" showCloseButton={!saving}>
          <DialogHeader>
            <DialogTitle>{en ? "Delete this skill note?" : "删除这条技能注释？"}</DialogTitle>
            <DialogDescription>{en ? "The note will immediately disappear from the public skill page." : "删除后，这条说明会立即从技能查询页消失。"}</DialogDescription>
          </DialogHeader>
          <DialogBody>
            <p className="text-sm text-muted-foreground">{deleting?.note}</p>
          </DialogBody>
          <DialogFooter>
            <Button type="button" size="dialog" variant="ghost" disabled={saving} onClick={() => setDeleting(null)}>{en ? "Keep note" : "保留注释"}</Button>
            <Button type="button" size="dialog" variant="destructive" disabled={saving} onClick={() => void confirmDelete()}>
              {saving ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Trash2 aria-hidden="true" />}
              {saving ? (en ? "Deleting" : "正在删除") : (en ? "Delete note" : "删除注释")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}

function AnnotationEditor({
  editor,
  editorRef,
  operatorQuery,
  matchingOperators,
  selectedOperator,
  selectedSkill,
  annotationIndex,
  saving,
  en,
  onEditorChange,
  onOperatorQueryChange,
  onSave,
  onClose,
}: {
  editor: EditorState;
  editorRef: RefObject<HTMLElement | null>;
  operatorQuery: string;
  matchingOperators: OperatorAssetRecord[];
  selectedOperator?: OperatorAssetRecord;
  selectedSkill?: (typeof BUILDING_SKILL_CATALOG)[string];
  annotationIndex: ReturnType<typeof indexSkillAnnotations>;
  saving: boolean;
  en: boolean;
  onEditorChange: (value: EditorState) => void;
  onOperatorQueryChange: (value: string) => void;
  onSave: () => void;
  onClose: () => void;
}) {
  const editing = editor.mode === "edit";
  const noteLength = editor.note.length;

  return (
    <section ref={editorRef} className="scroll-mt-24 overflow-hidden rounded-2xl border bg-card shadow-sm" aria-labelledby="skill-note-editor">
      <header className="flex items-start justify-between gap-3 border-b px-5 py-4 sm:px-6">
        <div>
          <h2 id="skill-note-editor" className="font-semibold">{editing ? (en ? "Edit skill note" : "编辑技能注释") : (en ? "New skill note" : "新建技能注释")}</h2>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">{en ? "Choose one operator and one exact skill card, then write the extra context shown after an asterisk." : "选择一名干员和对应技能卡片，再填写星号后的补充内容。"}</p>
        </div>
        <Button type="button" variant="ghost" size="icon" onClick={onClose} disabled={saving} aria-label={en ? "Close editor" : "关闭编辑器"}><X aria-hidden="true" /></Button>
      </header>

      <div className="grid gap-6 px-5 py-5 sm:px-6">
        <div className="grid gap-2">
          <Label htmlFor="skill-note-operator">{en ? "Operator" : "干员"}</Label>
          {selectedOperator ? (
            <div className="flex min-h-16 flex-wrap items-center justify-between gap-3 rounded-xl border bg-muted/20 px-3 py-2">
              <OperatorIdentity operator={selectedOperator} />
              {!editing ? (
                <Button type="button" variant="ghost" onClick={() => { onEditorChange({ ...editor, operatorId: "", skillId: "" }); onOperatorQueryChange(""); }}>
                  {en ? "Change operator" : "更换干员"}
                </Button>
              ) : null}
            </div>
          ) : editing ? (
            <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-3">
              <p className="text-sm font-medium text-destructive">
                {en ? "This operator is no longer in the current unpacked assets." : "当前解包资源中已找不到这名干员。"}
              </p>
              <p className="mt-1 break-all font-mono text-xs text-muted-foreground">{editor.operatorId}</p>
              <p className="mt-2 text-xs leading-5 text-muted-foreground">
                {en ? "The note was preserved. You can still edit or delete it." : "注释仍被保留，可以继续修改或删除。"}
              </p>
            </div>
          ) : (
            <div className="grid gap-2">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                <Input id="skill-note-operator" autoFocus value={operatorQuery} onChange={(event) => onOperatorQueryChange(event.target.value)} className="h-11 pl-9" placeholder={en ? "Search operator or skill" : "搜索干员名或技能名"} autoComplete="off" />
              </div>
              {operatorQuery.trim() ? (
                <div className="grid max-h-72 gap-1 overflow-y-auto rounded-xl border p-1" role="listbox" aria-label={en ? "Matching operators" : "匹配的干员"}>
                  {matchingOperators.length ? matchingOperators.map((operator) => (
                    <button
                      key={operator.id}
                      type="button"
                      role="option"
                      aria-selected="false"
                      onClick={() => { onEditorChange({ ...editor, operatorId: operator.id, skillId: "" }); onOperatorQueryChange(operator.name); }}
                      className="rounded-lg px-3 py-2 text-left outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <OperatorIdentity operator={operator} />
                    </button>
                  )) : <p className="px-3 py-8 text-center text-sm text-muted-foreground">{en ? "No matching operators." : "没有匹配的干员。"}</p>}
                </div>
              ) : null}
            </div>
          )}
        </div>

        {selectedOperator ? (
          <fieldset className="grid gap-2" disabled={editing || saving}>
            <legend className="mb-2 text-sm font-medium">{en ? "Skill card" : "技能卡片"}</legend>
            <div className="grid gap-2 md:grid-cols-2">
              {selectedOperator.buildingSkills.map((ref) => {
                const skill = BUILDING_SKILL_CATALOG[ref.id];
                if (!skill) return null;
                const existing = annotationIndex.get(skillAnnotationKey(selectedOperator.id, ref.id));
                const selected = editor.skillId === ref.id;
                const unavailable = Boolean(existing && existing.id !== editor.annotationId);
                return (
                  <button
                    key={ref.id}
                    type="button"
                    disabled={unavailable || editing || saving}
                    aria-pressed={selected}
                    onClick={() => onEditorChange({ ...editor, skillId: ref.id })}
                    className="group min-h-24 rounded-xl border bg-background p-3 text-left outline-none transition-[border-color,background-color,box-shadow] duration-150 hover:border-foreground/30 focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-55 aria-pressed:border-[#D1AE00] aria-pressed:bg-[#FFD501]/8"
                  >
                    <span className="flex items-start gap-3">
                      <img src={skill.icon} alt="" className="size-9 shrink-0 object-contain" aria-hidden="true" />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center justify-between gap-2">
                          <span className="truncate font-medium">{skill.name}</span>
                          {selected ? <Check className="size-4 shrink-0 text-[#B69600]" aria-hidden="true" /> : null}
                          {unavailable ? <span className="shrink-0 text-[11px] text-muted-foreground">{en ? "Has note" : "已有注释"}</span> : null}
                        </span>
                        <span className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">
                          {skill.descriptionRich ? <RichText text={skill.descriptionRich} /> : skill.description}
                        </span>
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </fieldset>
        ) : null}

        {editing && selectedOperator && !selectedSkill ? (
          <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-3">
            <p className="text-sm font-medium text-destructive">
              {en ? "This skill card is no longer in the current unpacked assets." : "当前解包资源中已找不到这张技能卡片。"}
            </p>
            <p className="mt-1 break-all font-mono text-xs text-muted-foreground">{editor.skillId}</p>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">
              {en ? "The note was preserved. You can still edit or delete it." : "注释仍被保留，可以继续修改或删除。"}
            </p>
          </div>
        ) : null}

        {selectedSkill || editing ? (
          <div className="grid gap-2">
            <div className="flex items-end justify-between gap-3">
              <Label htmlFor="skill-note-text">{en ? "Extra context" : "补充说明"}</Label>
              <span className={`font-mono text-xs ${noteLength > SKILL_ANNOTATION_MAX_LENGTH ? "text-destructive" : "text-muted-foreground"}`}>{noteLength}/{SKILL_ANNOTATION_MAX_LENGTH}</span>
            </div>
            <Textarea
              id="skill-note-text"
              value={editor.note}
              onChange={(event) => onEditorChange({ ...editor, note: event.target.value })}
              maxLength={SKILL_ANNOTATION_MAX_LENGTH}
              rows={4}
              className="min-h-28 resize-y"
              placeholder={en ? "Explain the observed behavior or special condition…" : "说明实际表现、特殊条件或容易误解之处……"}
              aria-describedby="skill-note-help"
            />
            <p id="skill-note-help" className="text-xs leading-5 text-muted-foreground">{en ? "Write only the added explanation; the public card automatically adds the asterisk." : "只填写补充内容；技能查询页会自动加上星号。"}</p>
            {editor.note.trim() ? (
              <div className="mt-1 border-l-2 border-[#D1AE00] bg-[#FFD501]/8 px-3 py-2 text-sm leading-6">
                <span className="mr-1.5 font-semibold text-[#B69600]" aria-hidden="true">*</span>{editor.note.trim()}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      <footer className="flex flex-col-reverse gap-2 border-t bg-muted/20 px-5 py-4 sm:flex-row sm:justify-end sm:px-6">
        <Button type="button" variant="ghost" size="lg" disabled={saving} onClick={onClose}>{en ? "Keep editing later" : "稍后再编辑"}</Button>
        <Button type="button" size="lg" disabled={saving || !editor.operatorId || !editor.skillId || !editor.note.trim() || noteLength > SKILL_ANNOTATION_MAX_LENGTH} onClick={onSave}>
          {saving ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Check aria-hidden="true" />}
          {saving ? (en ? "Saving note" : "正在保存") : (editing ? (en ? "Save changes" : "保存修改") : (en ? "Publish note" : "发布注释"))}
        </Button>
      </footer>
    </section>
  );
}

function AnnotationCard({
  annotation,
  en,
  onEdit,
  onDelete,
}: {
  annotation: AdminSkillAnnotationData;
  en: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const operator = operatorById.get(annotation.operatorId);
  const skill = BUILDING_SKILL_CATALOG[annotation.skillId];
  return (
    <article className="flex min-w-0 flex-col rounded-2xl border bg-card p-4 shadow-sm sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {operator ? <OperatorIdentity operator={operator} /> : <p className="font-mono text-xs text-destructive">{annotation.operatorId}</p>}
        </div>
        <div className="flex shrink-0 gap-1">
          <Button type="button" variant="ghost" size="icon" onClick={onEdit} aria-label={en ? "Edit skill note" : "编辑技能注释"}><Pencil aria-hidden="true" /></Button>
          <Button type="button" variant="ghost" size="icon" onClick={onDelete} aria-label={en ? "Delete skill note" : "删除技能注释"} className="text-destructive"><Trash2 aria-hidden="true" /></Button>
        </div>
      </div>
      <div className="mt-4 flex min-w-0 items-center gap-3 border-t pt-4">
        {skill ? <img src={skill.icon} alt="" className="size-9 shrink-0 object-contain" aria-hidden="true" /> : null}
        <div className="min-w-0">
          <h3 className="truncate font-medium">{skill?.name ?? annotation.skillId}</h3>
          <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">{annotation.skillId}</p>
        </div>
      </div>
      <p className="mt-3 flex flex-1 gap-1.5 border-l-2 border-[#D1AE00] bg-[#FFD501]/8 px-3 py-2 text-sm leading-6">
        <span className="shrink-0 font-semibold text-[#B69600]" aria-hidden="true">*</span>
        <span>{annotation.note}</span>
      </p>
      <p className="mt-3 text-right text-[11px] text-muted-foreground">{en ? "Updated " : "更新于 "}{new Date(annotation.updatedAt).toLocaleString(en ? "en-US" : "zh-CN")}</p>
    </article>
  );
}
