"use client";

import { ArrowLeft, Download, Search, Settings2, Sparkles, Trash2, Upload, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import type { FactoryRecipe, TradeOrder } from "@/blueprint";
import { filterOperators, ROOM_SKILL_TAGS, type BuildingRoomPrefix } from "@/building-rooms";
import { OperatorSlot, ScheduleBoard, ShiftTabs } from "@/components";
import { FiammettaTargetChip } from "@/components/FiammettaTargetChip";
import { Pagination } from "@/components/skill-query/Pagination";
import { SkillRoomTagBar } from "@/components/skill-query/SkillRoomTagBar";
import { SkillTagBar } from "@/components/skill-query/SkillTagBar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { TooltipProvider } from "@/components/ui/tooltip";
import { downloadJson } from "@/download";
import { demoOperatorName, demoRoomTitle, useLanguageDemo } from "@/language-demo";
import {
  assignManualOperator,
  clearManualRoom,
  clearManualShift,
  createManualScheduleDraft,
  createManualScheduleDraftFromCalculator,
  formatManualShiftDuration,
  layoutFromMaaSchedule,
  loadManualScheduleDraft,
  manualShiftTimeRanges,
  manualScheduleToMaa,
  normalizeMaaScheduleForManualImport,
  parseMaaScheduleText,
  persistManualScheduleDraft,
  reconcileManualScheduleDraft,
  resizeManualScheduleDraft,
  setManualDormAutofill,
  setManualDroneTarget,
  type ManualOperatorConflict,
  type ManualScheduleDraft,
  type ManualScheduleMode,
} from "@/manual-schedule";
import { BUILDING_SKILL_CATALOG, OPERATOR_CATALOG, operatorPortraitFor, operatorPresentationFor } from "@/operatorPortraits";
import { addOperatorPresentations } from "@/schedule-presentation";
import { planToRows, type RoomRow } from "@/schedule";
import type { BaseBlueprint, MaaJson, MaaOperatorSlot, MaaRoom, OperBoxEntry } from "@/types";

export interface ManualSchedulePageProps {
  layout: BaseBlueprint;
  operbox: OperBoxEntry[] | null;
  sourceName: string | null;
  shiftDurations: number[];
  shiftStartTime: string;
  scheduleMode: ManualScheduleMode;
  fiammettaEnabled: boolean;
  initialDraft: ManualScheduleDraft | null;
  onInitialDraftConsumed: () => void;
  onOpenCalculator: () => void;
  onShiftDurationsChange: (durations: number[]) => void;
  onShiftStartTimeChange: (startTime: string) => void;
  onScheduleModeChange: (mode: ManualScheduleMode) => void;
  onImportedLayoutChange: (layout: BaseBlueprint) => void;
  onFiammettaEnabledChange: (enabled: boolean) => void;
  onOpenSetup: () => void;
  onFactoryRecipeChange: (roomId: string, recipe: FactoryRecipe) => void;
  onTradeOrderChange: (roomId: string, order: TradeOrder) => void;
}

type PickerTarget =
  | { kind: "slot"; roomId: string; slotIndex: number }
  | { kind: "fiammetta" };

type PendingMove = {
  operator: string;
  target: Extract<PickerTarget, { kind: "slot" }>;
  conflict: ManualOperatorConflict;
};

type MaaImportPreview = {
  fileName: string;
  draft: ManualScheduleDraft;
  layout: BaseBlueprint;
  sourceShiftCount: number;
  importedShiftCount: number;
  sourceAssignmentCount: number;
  importedAssignmentCount: number;
};
const MANUAL_PICKER_PAGE_SIZE = 18;
const OPERATOR_RARITIES = [6, 5, 4, 3, 2, 1] as const;

const ROOM_GROUP_TO_SKILL_PREFIX: Readonly<Record<RoomRow["group"], BuildingRoomPrefix>> = {
  control: "control",
  power: "power",
  manufacture: "manu",
  trading: "trade",
  dormitory: "dorm",
  hire: "hire",
  meeting: "meet",
  training: "train",
  processing: "workshop",
};

const OPERATOR_CATALOG_BY_ID = new Map(OPERATOR_CATALOG.map((operator) => [operator.id, operator]));
const OPERATOR_CATALOG_BY_NAME = new Map(OPERATOR_CATALOG.map((operator) => [operator.name, operator]));

function countDraftAssignments(draft: ManualScheduleDraft): number {
  return draft.shifts.reduce((total, shift) => total + Object.values(shift.rooms).reduce(
    (roomTotal, room) => roomTotal + room.operators.filter(Boolean).length,
    0,
  ), 0);
}

function countMaaAssignments(maa: MaaJson): number {
  return maa.plans.reduce((total, plan) => total + Object.values(plan.rooms).reduce(
    (roomTotal, rooms) => roomTotal + ((rooms ?? []) as MaaRoom[]).reduce(
      (groupTotal: number, room: MaaRoom) => groupTotal + (room.operators ?? []).filter((operator: string | MaaOperatorSlot | null) => (
        typeof operator === "string" ? operator.trim().length > 0 : Boolean(operator?.name?.trim())
      )).length,
      0,
    ),
    0,
  ), 0);
}

function ManualOperatorChoice({
  operator,
  selected,
  assignmentLabel,
  en,
  tooltipDisabled,
  onChoose,
}: {
  operator: OperBoxEntry;
  selected: boolean;
  assignmentLabel?: string;
  en: boolean;
  tooltipDisabled: boolean;
  onChoose: () => void;
}) {
  const presentation = operatorPresentationFor({ name: operator.name, id: operator.id });
  return (
    <div
      className="flex min-h-[calc(clamp(70px,7.3vw,80px)+2.5rem)] flex-col items-center justify-start rounded-[4px] border border-transparent p-2 transition-colors hover:border-border hover:bg-muted/45 max-sm:min-h-[calc(clamp(56px,16vw,76px)+2.5rem)]"
      data-manual-operator-choice
      data-current-selection={selected ? "" : undefined}
    >
      <span className={`mb-1 block h-4 max-w-full truncate text-center text-[11px] font-medium leading-4 ${assignmentLabel ? "text-popover-foreground" : "invisible"}`}>
        {assignmentLabel ?? (en ? "Unassigned" : "未入驻")}
      </span>
      <OperatorSlot
        slot={{
          name: operator.name,
          label: demoOperatorName(operator.name, en ? "en" : "zh"),
          ...(presentation.portrait ? { portrait: presentation.portrait } : {}),
          ...(typeof presentation.operator?.profession === "number" ? { profession: presentation.operator.profession } : {}),
        }}
        elite={operator.elite}
        operatorLevel={operator.level}
        showSkillTooltip
        selectionMode
        tooltipDisabled={tooltipDisabled}
        onActivate={onChoose}
      />
    </div>
  );
}

export function ManualSchedulePage({
  layout,
  operbox,
  sourceName,
  shiftDurations,
  shiftStartTime,
  scheduleMode,
  fiammettaEnabled,
  initialDraft,
  onInitialDraftConsumed,
  onOpenCalculator,
  onShiftDurationsChange,
  onShiftStartTimeChange,
  onScheduleModeChange,
  onImportedLayoutChange,
  onFiammettaEnabledChange,
  onOpenSetup,
  onFactoryRecipeChange,
  onTradeOrderChange,
}: ManualSchedulePageProps) {
  const { locale } = useLanguageDemo();
  const en = locale === "en";
  const [draft, setDraft] = useState<ManualScheduleDraft>(() => createManualScheduleDraft(shiftDurations, shiftStartTime, scheduleMode));
  const [restored, setRestored] = useState(false);
  const [picker, setPicker] = useState<PickerTarget | null>(null);
  const [pickerQuery, setPickerQuery] = useState("");
  const [pickerRoomFilter, setPickerRoomFilter] = useState<BuildingRoomPrefix | null>(null);
  const [pickerSkillTag, setPickerSkillTag] = useState<string | null>(null);
  const [pickerRarity, setPickerRarity] = useState<number | null>(null);
  const [pickerPage, setPickerPage] = useState(1);
  const [maaImportPreview, setMaaImportPreview] = useState<MaaImportPreview | null>(null);
  const [maaImportError, setMaaImportError] = useState<string | null>(null);
  const [pendingMove, setPendingMove] = useState<PendingMove | null>(null);
  const [clearShiftConfirmationOpen, setClearShiftConfirmationOpen] = useState(false);
  const [storageWarning, setStorageWarning] = useState<string | null>(null);
  const [scheduleQuery, setScheduleQuery] = useState("");
  const [pickerScrolling, setPickerScrolling] = useState(false);
  const pickerScrollTimer = useRef<number | null>(null);
  const pickerScrollContainerRef = useRef<HTMLDivElement>(null);
  const pickerResultsRef = useRef<HTMLDivElement>(null);
  const maaImportInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => () => {
    if (pickerScrollTimer.current !== null) window.clearTimeout(pickerScrollTimer.current);
  }, []);

  const ownedOperators = useMemo(() => (
    (operbox ?? []).filter((entry) => entry.own).sort((left, right) => left.name.localeCompare(right.name, "zh-CN"))
  ), [operbox]);
  const canPersistDraft = ownedOperators.length > 0;
  const ownedFingerprint = ownedOperators.map((operator) => operator.name).join("\0");
  const eliteByOperator = useMemo(() => new Map(
    ownedOperators.map((operator) => [operator.name, operator.elite]),
  ), [ownedOperators]);
  const levelByOperator = useMemo(() => new Map(
    ownedOperators.map((operator) => [operator.name, operator.level]),
  ), [ownedOperators]);

  useEffect(() => {
    if (restored) return;
    try {
      const saved = initialDraft ?? loadManualScheduleDraft(window.localStorage);
      if (saved) {
        const reconciled = reconcileManualScheduleDraft(saved, layout, operbox);
        setDraft(reconciled);
        onShiftDurationsChange(reconciled.shifts.map((shift) => shift.durationHours));
        onShiftStartTimeChange(reconciled.startTime);
        onScheduleModeChange(reconciled.scheduleMode);
        onFiammettaEnabledChange(reconciled.fiammettaEnabled);
      }
    } catch {
      setStorageWarning(en ? "The manual draft could not be restored." : "无法恢复浏览器中的手动排班草稿。");
    }
    if (initialDraft) onInitialDraftConsumed();
    setRestored(true);
  }, [en, initialDraft, layout, onFiammettaEnabledChange, onInitialDraftConsumed, onScheduleModeChange, onShiftDurationsChange, onShiftStartTimeChange, operbox, restored]);

  useEffect(() => {
    if (!restored) return;
    setDraft((current) => current.fiammettaEnabled === fiammettaEnabled
      ? current
      : { ...current, fiammettaEnabled });
  }, [fiammettaEnabled, restored]);

  useEffect(() => {
    if (!restored) return;
    setDraft((current) => current.scheduleMode === scheduleMode ? current : { ...current, scheduleMode });
  }, [restored, scheduleMode]);

  useEffect(() => {
    if (!restored) return;
    setDraft((current) => reconcileManualScheduleDraft(
      resizeManualScheduleDraft(current, shiftDurations, shiftStartTime),
      layout,
      operbox,
    ));
  }, [layout, operbox, ownedFingerprint, restored, shiftDurations, shiftStartTime]);

  useEffect(() => {
    if (!restored || !canPersistDraft) return;
    try {
      persistManualScheduleDraft(window.localStorage, draft);
      setStorageWarning(null);
    } catch {
      setStorageWarning(en ? "Changes remain available for this visit but could not be saved locally." : "本次访问仍可继续编辑，但无法在浏览器中保存草稿。");
    }
  }, [canPersistDraft, draft, en, restored]);

  const activeShift = Math.min(draft.activeShift, Math.max(0, draft.shifts.length - 1));
  const shiftRanges = manualShiftTimeRanges(draft.startTime, draft.shifts.map((shift) => shift.durationHours));
  const maa = useMemo(() => manualScheduleToMaa(draft, layout, fiammettaEnabled), [draft, fiammettaEnabled, layout]);
  const activePlan = maa.plans[activeShift];
  const trainingRoom = layout.rooms.find((room) => room.kind === "training_room");
  const trainingAssignment = trainingRoom ? draft.shifts[activeShift]?.rooms[trainingRoom.id] : undefined;
  const activeTrainingRoomShift = useMemo(() => trainingRoom ? {
    trainee: trainingAssignment?.operators[0] ?? null,
    trainer: trainingAssignment?.operators[1] ?? null,
  } : undefined, [trainingAssignment?.operators, trainingRoom]);
  const rows = useMemo(
    () => addOperatorPresentations(planToRows(activePlan, undefined, layout, activeTrainingRoomShift).map((row) => {
      const assignment = draft.shifts[activeShift]?.rooms[row.roomId];
      return {
        ...row,
        ...(row.positionSlots ? {} : {
          slotAssignments: assignment?.operators.map((name) => name ? { name, label: name } : undefined),
        }),
        ...(row.group === "dormitory" ? { autofill: Boolean(assignment?.autofill) } : {}),
      };
    })),
    [activePlan, activeShift, activeTrainingRoomShift, draft.shifts, layout],
  );
  const selectedRoom = picker?.kind === "slot" ? rows.find((row) => row.roomId === picker.roomId) : undefined;
  const selectedAssignment = picker?.kind === "slot" ? draft.shifts[activeShift]?.rooms[picker.roomId] : undefined;
  const selectedOperator = picker?.kind === "slot" ? selectedAssignment?.operators[picker.slotIndex] ?? null : null;
  const filteredOperators = useMemo(() => {
    const filterableOwnedOperators = ownedOperators.map((operator) => {
      const catalog = OPERATOR_CATALOG_BY_ID.get(operator.id) ?? OPERATOR_CATALOG_BY_NAME.get(operator.name);
      return {
        box: operator,
        name: operator.name,
        order: catalog?.order ?? 0,
        buildingSkills: catalog?.buildingSkills ?? [],
      };
    });
    return filterOperators(
      filterableOwnedOperators,
      pickerRoomFilter,
      pickerSkillTag,
      pickerQuery,
      (skillId) => BUILDING_SKILL_CATALOG[skillId],
    )
      .filter((operator) => pickerRarity === null || operator.box.rarity === pickerRarity)
      .map((operator) => operator.box);
  }, [ownedOperators, pickerQuery, pickerRarity, pickerRoomFilter, pickerSkillTag]);
  const pickerPageCount = Math.max(1, Math.ceil(filteredOperators.length / MANUAL_PICKER_PAGE_SIZE));
  const visibleOperators = filteredOperators.slice(
    (pickerPage - 1) * MANUAL_PICKER_PAGE_SIZE,
    pickerPage * MANUAL_PICKER_PAGE_SIZE,
  );
  const emptyOperatorChoiceCount = MANUAL_PICKER_PAGE_SIZE - visibleOperators.length;
  const availableSkillTags = pickerRoomFilter ? ROOM_SKILL_TAGS[pickerRoomFilter] : [];
  const activeAssignmentRoomByOperator = useMemo(() => {
    const assignments = new Map<string, string>();
    for (const row of rows) {
      const room = draft.shifts[activeShift]?.rooms[row.roomId];
      for (const name of room?.operators ?? []) {
        if (name) assignments.set(name, demoRoomTitle(row.title, row.group, locale));
      }
    }
    return assignments;
  }, [activeShift, draft.shifts, locale, rows]);

  function setActiveShift(index: number) {
    setDraft((current) => ({ ...current, activeShift: index }));
  }

  function openSlotPicker(row: RoomRow, slotIndex: number) {
    setPickerScrolling(false);
    setPickerQuery("");
    setPickerRoomFilter(ROOM_GROUP_TO_SKILL_PREFIX[row.group]);
    setPickerSkillTag(null);
    setPickerRarity(null);
    setPickerPage(1);
    setPicker({ kind: "slot", roomId: row.roomId, slotIndex });
  }

  function changePickerRoomFilter(next: BuildingRoomPrefix | null) {
    setPickerRoomFilter(next);
    setPickerSkillTag(null);
    setPickerPage(1);
  }

  function changePickerSkillTag(next: string | null) {
    setPickerSkillTag(next);
    setPickerPage(1);
  }

  function changePickerPage(next: number) {
    setPickerPage(next);
    window.requestAnimationFrame(() => {
      const container = pickerScrollContainerRef.current;
      const results = pickerResultsRef.current;
      if (!container || !results) return;
      const top = container.scrollTop + results.getBoundingClientRect().top - container.getBoundingClientRect().top;
      container.scrollTo({
        top,
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
      });
    });
  }

  function handlePickerScroll() {
    setPickerScrolling(true);
    if (pickerScrollTimer.current !== null) window.clearTimeout(pickerScrollTimer.current);
    pickerScrollTimer.current = window.setTimeout(() => {
      pickerScrollTimer.current = null;
      setPickerScrolling(false);
    }, 150);
  }

  function chooseOperator(operator: string | null) {
    if (!picker) return;
    if (picker.kind === "fiammetta") {
      setDraft((current) => {
        const next = structuredClone(current);
        if (next.shifts[activeShift]) next.shifts[activeShift]!.fiammettaTarget = operator;
        return next;
      });
      setPicker(null);
      return;
    }
    const result = assignManualOperator({
      draft,
      layout,
      shiftIndex: activeShift,
      roomId: picker.roomId,
      slotIndex: picker.slotIndex,
      operator,
    });
    if (result.conflict && operator) {
      setPendingMove({ operator, target: picker, conflict: result.conflict });
      setPicker(null);
      return;
    }
    setDraft(result.draft);
    setPicker(null);
  }

  function confirmMove() {
    if (!pendingMove) return;
    setDraft((current) => assignManualOperator({
      draft: current,
      layout,
      shiftIndex: activeShift,
      roomId: pendingMove.target.roomId,
      slotIndex: pendingMove.target.slotIndex,
      operator: pendingMove.operator,
      moveExisting: true,
    }).draft);
    setPendingMove(null);
  }

  function clearRoom(row: RoomRow) {
    setDraft((current) => clearManualRoom(current, layout, activeShift, row.roomId));
    if (picker?.kind === "slot" && picker.roomId === row.roomId) setPicker(null);
  }

  function clearCurrentShift() {
    setDraft((current) => clearManualShift(current, layout, activeShift));
    setPicker(null);
    setClearShiftConfirmationOpen(false);
  }

  function setDormAutofill(row: RoomRow, enabled: boolean) {
    setDraft((current) => setManualDormAutofill(
      current,
      layout,
      activeShift,
      row.roomId,
      enabled,
    ));
  }

  function toggleDroneTarget(row: RoomRow) {
    setDraft((current) => setManualDroneTarget(
      current,
      layout,
      activeShift,
      current.shifts[activeShift]?.droneTargetRoomId === row.roomId ? null : row.roomId,
    ));
  }

  function exportMaa() {
    downloadJson("arknights-infra-schedule-maa.json", maa);
  }

  async function prepareMaaImport(file: File) {
    setMaaImportError(null);
    if (file.size > 5 * 1024 * 1024) {
      setMaaImportError(en ? "The schedule file must be 5 MB or smaller." : "排版文件不能超过 5 MB。");
      return;
    }
    try {
      const sourceMaa = parseMaaScheduleText(await file.text());
      const importedMaa = normalizeMaaScheduleForManualImport(sourceMaa);
      const importedLayout = layoutFromMaaSchedule(importedMaa, layout);
      const fiammettaImported = importedMaa.plans.some((plan) => plan.Fiammetta?.enable === true);
      const converted = createManualScheduleDraftFromCalculator({
        layout: importedLayout,
        maa: importedMaa,
        fallbackDurations: [],
        fiammettaEnabled: fiammettaImported,
        preferMaaTiming: true,
        preserveExternalOperators: true,
      });
      const reconciled = reconcileManualScheduleDraft(converted, importedLayout, operbox);
      setMaaImportPreview({
        fileName: file.name,
        draft: reconciled,
        layout: importedLayout,
        sourceShiftCount: sourceMaa.plans.length,
        importedShiftCount: reconciled.shifts.length,
        sourceAssignmentCount: Math.max(countMaaAssignments(sourceMaa), countDraftAssignments(reconciled)),
        importedAssignmentCount: countDraftAssignments(reconciled),
      });
    } catch (error) {
      setMaaImportError(en
        ? "Could not import this MAA schedule file. Check that it contains a valid plans array."
        : error instanceof Error ? error.message : "无法导入该 MAA 排版文件。");
    }
  }

  function confirmMaaImport() {
    if (!maaImportPreview) return;
    const imported = maaImportPreview.draft;
    onImportedLayoutChange(maaImportPreview.layout);
    setDraft(imported);
    onShiftDurationsChange(imported.shifts.map((shift) => shift.durationHours));
    onShiftStartTimeChange(imported.startTime);
    onScheduleModeChange(imported.scheduleMode);
    onFiammettaEnabledChange(imported.fiammettaEnabled);
    setMaaImportPreview(null);
    setMaaImportError(null);
  }

  if (!operbox?.some((operator) => operator.own)) {
    return (
      <section className="flex min-h-[calc(100svh-9rem)] items-center justify-center py-8" aria-labelledby="manual-schedule-empty-title" data-manual-schedule-empty>
        <div className="w-full max-w-2xl border border-[#313131]/15 bg-[#F3F1EA] px-6 py-12 text-center shadow-[0_18px_45px_rgb(49_49_49/0.08)] sm:px-10">
          <span className="mx-auto grid size-12 place-items-center bg-[#313131] text-[#FFD800]" aria-hidden="true"><Sparkles /></span>
          <h1 id="manual-schedule-empty-title" className="mt-5 text-2xl font-semibold tracking-tight">{en ? "Build a manual schedule" : "创建手动基建排班"}</h1>
          <p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-muted-foreground">{en ? "Choose an operator Box, base layout and consecutive shift times before filling each room." : "先配置干员 Box、基建布局和连续换班时间，再逐个填写设施。"}</p>
          <Button type="button" size="lg" className="mt-7 min-h-11" onClick={onOpenSetup}><Settings2 />{en ? "Configure Box & layout" : "配置 Box 与布局"}</Button>
        </div>
      </section>
    );
  }

  const fiammettaTarget = draft.shifts[activeShift]?.fiammettaTarget;
  const fiammettaPortrait = fiammettaTarget ? operatorPortraitFor(fiammettaTarget) : null;
  const sourceVariantLabel = draft.source?.variant === "progression-adjusted"
    ? (en ? "Progression-adjusted plan" : "练度调整后方案")
    : (en ? "Original plan" : "原方案");
  const previousRoomTitle = pendingMove ? rows.find((row) => row.roomId === pendingMove.conflict.roomId)?.title ?? pendingMove.conflict.roomId : "";
  const nextRoomTitle = pendingMove ? rows.find((row) => row.roomId === pendingMove.target.roomId)?.title ?? pendingMove.target.roomId : "";

  return (
    <div className="min-h-[calc(100svh-9rem)] py-2" data-manual-schedule-page>
      <header className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[240px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input value={scheduleQuery} onChange={(event) => setScheduleQuery(event.target.value)} className="pl-9" aria-label={en ? "Search this manual schedule" : "搜索手动排班中的干员或房间"} placeholder={en ? "Search operators or rooms" : "搜索排班中的干员或房间"} />
        </div>
        {draft.source ? (
          <Button type="button" variant="ghost" size="sm" onClick={onOpenCalculator}>
            <ArrowLeft />{en ? "Back to calculation" : "返回计算结果"}
          </Button>
        ) : null}
        <Button type="button" variant="outline" size="sm" onClick={onOpenSetup}><Settings2 />{en ? "Configure Box & layout" : "配置 Box 与布局"}</Button>
        <Button type="button" variant="outline" size="sm" onClick={() => maaImportInputRef.current?.click()}><Upload />{en ? "Import schedule file" : "导入排版文件"}</Button>
        <input
          ref={maaImportInputRef}
          type="file"
          accept="application/json,.json"
          className="sr-only"
          aria-label={en ? "Choose an MAA schedule JSON file" : "选择 MAA 排版 JSON 文件"}
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            if (file) void prepareMaaImport(file);
            event.currentTarget.value = "";
          }}
        />
        <Button type="button" size="sm" onClick={exportMaa}><Download />{en ? "Export MAA" : "导出到 MAA"}</Button>
      </header>

      {maaImportError ? <p className="mb-3 text-sm text-destructive" role="alert">{maaImportError}</p> : null}

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-y border-border/70 bg-muted/25 px-3 py-3">
        <div className="min-w-0">
          <p className="text-sm font-medium">{en ? "Manual draft" : "手动排班草稿"} · <span className="font-number">{layout.template}</span></p>
          <p className="mt-1 truncate text-xs text-muted-foreground" data-manual-draft-source={draft.source?.variant ?? "standalone"}>
            {draft.source ? (en ? `Based on ${sourceVariantLabel}` : `基于「${sourceVariantLabel}」创建`) : null}
            {draft.source ? " · " : null}
            {sourceName ?? (en ? "Current operator Box" : "当前干员 Box")} · {ownedOperators.length} {en ? "owned" : "名已拥有干员"}
          </p>
        </div>
      </div>

      {storageWarning ? <p className="mb-3 text-sm text-amber-700" role="status">{storageWarning}</p> : null}

      <ScheduleBoard
        rows={rows}
        layout={layout}
        planRevision={`manual-${activeShift}`}
        eliteByOperator={eliteByOperator}
        levelByOperator={levelByOperator}
        activeShift={activeShift}
        activePlan={activePlan}
        searchQuery={scheduleQuery}
        viewModeActionSlot={(
          <Button type="button" variant="outline" size="sm" onClick={() => setClearShiftConfirmationOpen(true)}>
            <Trash2 />{en ? "Clear every facility in this shift" : "清空当前班次所有设施"}
          </Button>
        )}
        shiftInfoSlot={(
          <div className="flex flex-wrap items-center justify-end gap-2 max-sm:w-full max-sm:justify-between" data-shift-actions data-manual-shift-actions>
            {fiammettaEnabled ? (
            <FiammettaTargetChip
                target={fiammettaTarget}
                portrait={fiammettaPortrait}
                onClick={() => {
                  setPickerQuery("");
                  setPickerRoomFilter(null);
                  setPickerSkillTag(null);
                  setPickerRarity(null);
                  setPickerPage(1);
                  setPicker({ kind: "fiammetta" });
                }}
              />
            ) : null}
            <ShiftTabs
              maaJson={maa}
              durations={draft.shifts.map((shift) => shift.durationHours)}
              labels={draft.scheduleMode === "period" ? shiftRanges.map((range, index) => ({
                content: <>
                  {en ? `Shift ${index + 1}` : `班次 ${index + 1}`}
                  {" · "}<span className="font-number">{range.startTime}–{range.endTime}</span>
                  {en ? ` (${formatManualShiftDuration(range.durationMinutes, true)})` : `（${formatManualShiftDuration(range.durationMinutes, false)}）`}
                </>,
                ariaLabel: en
                  ? `Shift ${index + 1}, ${range.startTime} to ${range.endTime}, ${formatManualShiftDuration(range.durationMinutes, true)}`
                  : `班次 ${index + 1}，${range.startTime}至${range.endTime}，${formatManualShiftDuration(range.durationMinutes, false)}`,
              })) : undefined}
              wrap
              active={activeShift}
              onChange={setActiveShift}
            />
          </div>
        )}
        onSlotClick={openSlotPicker}
        onClearRoom={clearRoom}
        onDormAutofillChange={setDormAutofill}
        droneTargetRoomId={draft.shifts[activeShift]?.droneTargetRoomId}
        onDroneTargetChange={toggleDroneTarget}
        onFactoryRecipeChange={onFactoryRecipeChange}
        onTradeOrderChange={onTradeOrderChange}
      />

      <Dialog open={clearShiftConfirmationOpen} onOpenChange={setClearShiftConfirmationOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{en ? "Clear every facility in this shift?" : "清空当前班次所有设施？"}</DialogTitle>
            <DialogDescription>
              {en
                ? `Every operator assignment, dormitory autofill setting and drone target in shift ${activeShift + 1} will be cleared. Other shifts will not change.`
                : `将清空班次 ${activeShift + 1} 的全部干员、宿舍自动补位和无人机目标，其他班次不会改变。`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setClearShiftConfirmationOpen(false)}>{en ? "Cancel" : "取消"}</Button>
            <Button type="button" variant="destructive" onClick={clearCurrentShift}><Trash2 />{en ? "Clear current shift" : "清空当前班次"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(picker)} onOpenChange={(open) => { if (!open) setPicker(null); }}>
        <DialogContent className="grid max-h-[min(820px,calc(100svh-1rem))] w-[calc(100vw-1rem)] max-w-[calc(100vw-1rem)] grid-rows-[auto_minmax(0,1fr)] overflow-hidden sm:w-[calc(100vw-2rem)] sm:max-w-[min(960px,calc(100vw-2rem))]">
          <DialogHeader>
            <DialogTitle>{picker?.kind === "fiammetta" ? (en ? "Fiammetta morale target" : "选择菲亚梅塔换心情目标") : (en ? `Assign ${selectedRoom?.title ?? "room"}` : `安排${selectedRoom?.title ?? "设施"}干员`)}</DialogTitle>
            <DialogDescription>{picker?.kind === "fiammetta" ? (en ? "This target is stored only for the active shift." : "该目标只应用于当前班次。") : (en ? "Only owned operators in the current Box are shown." : "这里只显示当前 Box 中已拥有的干员。")}</DialogDescription>
          </DialogHeader>
          <div ref={pickerScrollContainerRef} className="min-h-0 overflow-y-auto px-5 pb-5 sm:px-7 sm:pb-6" data-manual-operator-picker onScroll={handlePickerScroll}>
            {picker?.kind === "slot" ? (
              <>
                <SkillRoomTagBar selected={pickerRoomFilter} onChange={changePickerRoomFilter} />
                <SkillTagBar tags={availableSkillTags} selected={pickerSkillTag} onChange={changePickerSkillTag} />
              </>
            ) : null}

            <div className={picker?.kind === "slot" ? "mt-3" : ""} role="group" aria-label={en ? "Rarity filters" : "星级筛选"}>
              <div className="mb-1.5 text-xs font-medium text-muted-foreground">{en ? "Rarity" : "星级"}</div>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant={pickerRarity === null ? "secondary" : "outline"} size="sm" className={pickerRarity === null ? "border border-[#FFD800] bg-[#FFD800]/15" : ""} aria-pressed={pickerRarity === null} onClick={() => { setPickerRarity(null); setPickerPage(1); }}>
                  {en ? "All" : "全部"}
                </Button>
                {OPERATOR_RARITIES.map((rarity) => (
                  <Button key={rarity} type="button" variant={pickerRarity === rarity ? "secondary" : "outline"} size="sm" className={`font-number ${pickerRarity === rarity ? "border border-[#FFD800] bg-[#FFD800]/15" : ""}`} aria-pressed={pickerRarity === rarity} onClick={() => { setPickerRarity(rarity); setPickerPage(1); }}>
                    {rarity}★
                  </Button>
                ))}
              </div>
            </div>

            <div className="relative mt-3">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <Input autoFocus value={pickerQuery} onChange={(event) => { setPickerQuery(event.target.value); setPickerPage(1); }} className="pl-9" placeholder={en ? "Search operator, skill name, or effect" : "搜索干员名称/技能名称/技能效果"} aria-label={en ? "Search selectable operators and skills" : "搜索可选干员或基建技能"} />
            </div>

            <div className="mt-3 flex items-center justify-between gap-3">
              {picker?.kind === "slot" ? <Button type="button" variant="outline" className="min-w-0 justify-center" onClick={() => chooseOperator(null)}><X />{en ? "Leave empty" : "保持空置"}</Button> : <span />}
              <span className="font-number text-xs text-muted-foreground">{filteredOperators.length} {en ? "operators" : "名干员"}</span>
            </div>

            <TooltipProvider delay={0} timeout={0}>
              <div ref={pickerResultsRef} className="relative mt-3 grid scroll-mt-2 grid-cols-3 gap-3 min-[430px]:grid-cols-4 sm:grid-cols-6 sm:gap-4">
                {visibleOperators.map((operator) => (
                  <ManualOperatorChoice key={operator.id} operator={operator} selected={selectedOperator === operator.name || (picker?.kind === "fiammetta" && fiammettaTarget === operator.name)} assignmentLabel={activeAssignmentRoomByOperator.get(operator.name)} en={en} tooltipDisabled={pickerScrolling} onChoose={() => chooseOperator(operator.name)} />
                ))}
                {Array.from({ length: emptyOperatorChoiceCount }, (_, index) => (
                  <div
                    key={`empty-${index}`}
                    className="invisible min-h-[calc(clamp(70px,7.3vw,80px)+2.5rem)] max-sm:min-h-[calc(clamp(56px,16vw,76px)+2.5rem)]"
                    aria-hidden="true"
                    data-manual-operator-placeholder
                  />
                ))}
                {visibleOperators.length === 0 ? <p className="pointer-events-none absolute inset-0 flex items-center justify-center text-center text-sm text-muted-foreground">{en ? "No matching operators." : "没有匹配的干员。"}</p> : null}
              </div>
            </TooltipProvider>

            <div className="mt-4 border-t border-border/60 pt-3">
              <Pagination page={pickerPage} pageCount={pickerPageCount} onPageChange={changePickerPage} alwaysVisible />
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(maaImportPreview)} onOpenChange={(open) => { if (!open) setMaaImportPreview(null); }}>
        <DialogContent className="max-w-[min(520px,calc(100vw-2rem))]">
          <DialogHeader>
            <DialogTitle>{en ? "Import this MAA schedule?" : "导入这个 MAA 排版？"}</DialogTitle>
            <DialogDescription>
              {en ? "Confirming replaces the current manual draft with assignments that fit the current Box and layout." : "确认后会使用与当前 Box 和布局匹配的排班，替换现在的手动草稿。"}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2 px-5 py-2 text-sm sm:px-7">
            <p className="truncate"><span className="text-muted-foreground">{en ? "File: " : "文件："}</span>{maaImportPreview?.fileName}</p>
            <p>
              <span className="text-muted-foreground">{en ? "Shifts: " : "班次："}</span>
              <span className="font-number">{maaImportPreview?.importedShiftCount}</span>
              {maaImportPreview && maaImportPreview.sourceShiftCount !== maaImportPreview.importedShiftCount ? (
                <span className="ml-2 text-muted-foreground">
                  {en ? `(expanded from ${maaImportPreview.sourceShiftCount} plans)` : `（由 ${maaImportPreview.sourceShiftCount} 个计划按时间展开）`}
                </span>
              ) : null}
            </p>
            <p>
              <span className="text-muted-foreground">{en ? "Assignments: " : "干员位置："}</span>
              <span className="font-number">{maaImportPreview?.importedAssignmentCount}</span>
              <span className="text-muted-foreground"> / </span>
              <span className="font-number">{maaImportPreview?.sourceAssignmentCount}</span>
              {maaImportPreview && maaImportPreview.sourceAssignmentCount > maaImportPreview.importedAssignmentCount ? (
                <span className="ml-2 text-amber-700">
                  {en
                    ? `${maaImportPreview.sourceAssignmentCount - maaImportPreview.importedAssignmentCount} could not be mapped.`
                    : `${maaImportPreview.sourceAssignmentCount - maaImportPreview.importedAssignmentCount} 个位置无法映射。`}
                </span>
              ) : null}
            </p>
            <p className="text-xs leading-5 text-muted-foreground">
              {en
                ? "Timed plans are expanded into a continuous 24-hour cycle. Operators outside the current Box are preserved. Facility arrays provided by the file replace matching layout counts; omitted facility types and current product settings remain unchanged."
                : "时间计划会展开为连续覆盖 24 小时的班次；当前 Box 以外的干员也会保留。文件明确提供的设施数组会覆盖对应布局数量，未提供的设施类型及当前产物设置保持不变。"}
            </p>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setMaaImportPreview(null)}>{en ? "Cancel" : "取消"}</Button>
            <Button type="button" onClick={confirmMaaImport}><Upload />{en ? "Replace draft" : "导入并替换草稿"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(pendingMove)} onOpenChange={(open) => { if (!open) setPendingMove(null); }}>
        <DialogContent className="max-w-[min(480px,calc(100vw-2rem))]">
          <DialogHeader><DialogTitle>{en ? "Move this operator?" : "移动该干员？"}</DialogTitle><DialogDescription>{en ? `${pendingMove?.operator} is already assigned to ${previousRoomTitle}. Move them to ${nextRoomTitle} and leave the previous slot empty?` : `${pendingMove?.operator ?? "该干员"}已经在${previousRoomTitle}工作。是否移动到${nextRoomTitle}，并将原位置留空？`}</DialogDescription></DialogHeader>
          <DialogFooter><Button type="button" variant="ghost" onClick={() => setPendingMove(null)}>{en ? "Cancel" : "取消"}</Button><Button type="button" onClick={confirmMove}>{en ? "Move operator" : "移动干员"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}
