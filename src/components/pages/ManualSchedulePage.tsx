"use client";
import { localize as localize_components_pages_ManualSchedulePage } from "../../i18n/helpers/components_pages_ManualSchedulePage.ts";
import { useTranslations, useLocale } from "next-intl";

import { ArrowLeft, Download, Search, Settings2, Sparkles, Trash2, Upload, X } from "lucide-react";
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";

import type { FactoryRecipe, TradeOrder } from "@/blueprint";
import { loadClientFeature } from "@/client-lazy-loader";
import { ScheduleBoard, ShiftTabs } from "@/components";
import { FiammettaTargetChip } from "@/components/FiammettaTargetChip";
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
import { localizedOperatorName } from "@/i18n/game-data";
import { useGameCatalog } from "@/i18n/game-data-client";
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
import { operatorPortraitFor } from "@/operatorPortraits";
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

const OperatorSkillTooltip = lazy(() => loadClientFeature("operatorSkillTooltip").then((module) => ({
  default: module.OperatorSkillTooltip,
})));

type MaaImportPreview = {
  fileName: string;
  draft: ManualScheduleDraft;
  layout: BaseBlueprint;
  sourceShiftCount: number;
  importedShiftCount: number;
  sourceAssignmentCount: number;
  importedAssignmentCount: number;
};

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
  en,
  tooltipDisabled,
  onChoose,
}: {
  operator: OperBoxEntry;
  selected: boolean;
  en: boolean;
  tooltipDisabled: boolean;
  onChoose: () => void;
}) {
  const gameCatalog = useGameCatalog();
  const displayName = localizedOperatorName(operator.name, en ? "en" : "zh", gameCatalog);
  const portrait = operatorPortraitFor(operator.name, operator.id);
  const card = (
    <button
      type="button"
      aria-pressed={selected}
      className={`flex min-w-0 items-center gap-3 rounded-[4px] border bg-background p-3 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[#FFD800] focus-visible:ring-offset-2 ${selected ? "border-[#FFD800] bg-[#FFF9D8]" : "border-border/80 hover:border-foreground/45 hover:bg-muted/45"}`}
      onClick={onChoose}
      data-manual-operator-choice
    >
      <span className="size-12 shrink-0 overflow-hidden border border-border bg-muted sm:size-14">
        {portrait ? (
          <img src={portrait} alt={localize_components_pages_ManualSchedulePage.text(en, "portrait", { displayName })} className="size-full object-cover" loading="lazy" decoding="async" />
        ) : null}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold">{displayName}</span>
        <span className="font-number mt-1 block text-xs text-muted-foreground">
          {operator.rarity}★ · {localize_components_pages_ManualSchedulePage.text(en, "eLv", { elite: operator.elite, level: operator.level })}
        </span>
        <span className="mt-1 block text-[11px] text-muted-foreground/80">{localize_components_pages_ManualSchedulePage.text(en, "hoverForInfrastructureSkills")}</span>
      </span>
    </button>
  );
  return (
    <Suspense fallback={card}>
      <OperatorSkillTooltip name={operator.name} trigger={card} delay={300} disabled={tooltipDisabled} />
    </Suspense>
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
  const intl = useTranslations();
  const locale = useLocale();
  const en = locale === "en";
  const [draft, setDraft] = useState<ManualScheduleDraft>(() => createManualScheduleDraft(shiftDurations, shiftStartTime, scheduleMode));
  const [restored, setRestored] = useState(false);
  const [picker, setPicker] = useState<PickerTarget | null>(null);
  const [pickerQuery, setPickerQuery] = useState("");
  const [maaImportPreview, setMaaImportPreview] = useState<MaaImportPreview | null>(null);
  const [maaImportError, setMaaImportError] = useState<string | null>(null);
  const [pendingMove, setPendingMove] = useState<PendingMove | null>(null);
  const [clearShiftConfirmationOpen, setClearShiftConfirmationOpen] = useState(false);
  const [storageWarning, setStorageWarning] = useState<string | null>(null);
  const [scheduleQuery, setScheduleQuery] = useState("");
  const [pickerScrolling, setPickerScrolling] = useState(false);
  const pickerScrollTimer = useRef<number | null>(null);
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
      setStorageWarning(intl("components_pages_ManualSchedulePage.theManualDraftCouldNotBeRestored"));
    }
    if (initialDraft) onInitialDraftConsumed();
    setRestored(true);
  }, [intl, initialDraft, layout, onFiammettaEnabledChange, onInitialDraftConsumed, onScheduleModeChange, onShiftDurationsChange, onShiftStartTimeChange, operbox, restored]);

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
      setStorageWarning(intl("components_pages_ManualSchedulePage.changesRemainAvailableForThisVisitButCouldNot"));
    }
  }, [intl, canPersistDraft, draft, en, restored]);

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
  const normalizedQuery = pickerQuery.trim().toLocaleLowerCase("zh-CN");
  const visibleOperators = normalizedQuery
    ? ownedOperators.filter((operator) => operator.name.toLocaleLowerCase("zh-CN").includes(normalizedQuery))
    : ownedOperators;

  function setActiveShift(index: number) {
    setDraft((current) => ({ ...current, activeShift: index }));
  }

  function openSlotPicker(row: RoomRow, slotIndex: number) {
    setPickerScrolling(false);
    setPickerQuery("");
    setPicker({ kind: "slot", roomId: row.roomId, slotIndex });
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
      setMaaImportError(intl("components_pages_ManualSchedulePage.scheduleFileTooLarge"));
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
        ? intl("components_pages_ManualSchedulePage.invalidMaaSchedule")
        : error instanceof Error ? error.message : intl("components_pages_ManualSchedulePage.invalidMaaSchedule"));
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
          <h1 id="manual-schedule-empty-title" className="mt-5 text-2xl font-semibold tracking-tight">{intl("components_pages_ManualSchedulePage.buildAManualSchedule")}</h1>
          <p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-muted-foreground">{intl("components_pages_ManualSchedulePage.chooseAnOperatorBoxBaseLayoutShiftCountAnd")}</p>
          <Button type="button" size="lg" className="mt-7 min-h-11" onClick={onOpenSetup}><Settings2 />{intl("components_pages_ManualSchedulePage.configureBoxLayout")}</Button>
        </div>
      </section>
    );
  }

  const fiammettaTarget = draft.shifts[activeShift]?.fiammettaTarget;
  const fiammettaPortrait = fiammettaTarget ? operatorPortraitFor(fiammettaTarget) : null;
  const sourceVariantLabel = draft.source?.variant === "progression-adjusted"
    ? (intl("components_pages_ManualSchedulePage.progressionAdjustedPlan"))
    : (intl("components_pages_ManualSchedulePage.originalPlan"));
  const previousRoomTitle = pendingMove ? rows.find((row) => row.roomId === pendingMove.conflict.roomId)?.title ?? pendingMove.conflict.roomId : "";
  const nextRoomTitle = pendingMove ? rows.find((row) => row.roomId === pendingMove.target.roomId)?.title ?? pendingMove.target.roomId : "";

  return (
    <div className="min-h-[calc(100svh-9rem)] py-2" data-manual-schedule-page>
      <header className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[240px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input value={scheduleQuery} onChange={(event) => setScheduleQuery(event.target.value)} className="pl-9" aria-label={intl("components_pages_ManualSchedulePage.searchThisManualSchedule")} placeholder={intl("components_pages_ManualSchedulePage.searchOperatorsOrRooms")} />
        </div>
        {draft.source ? (
          <Button type="button" variant="ghost" size="sm" onClick={onOpenCalculator}>
            <ArrowLeft />{intl("components_pages_ManualSchedulePage.backToCalculation")}
          </Button>
        ) : null}
        <Button type="button" variant="outline" size="sm" onClick={onOpenSetup}><Settings2 />{intl("components_pages_ManualSchedulePage.configureBoxLayout")}</Button>
        <Button type="button" variant="outline" size="sm" onClick={() => maaImportInputRef.current?.click()}><Upload />{intl("components_pages_ManualSchedulePage.importScheduleFile")}</Button>
        <input
          ref={maaImportInputRef}
          type="file"
          accept="application/json,.json"
          className="sr-only"
          aria-label={intl("components_pages_ManualSchedulePage.chooseMaaScheduleFile")}
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            if (file) void prepareMaaImport(file);
            event.currentTarget.value = "";
          }}
        />
        <Button type="button" size="sm" onClick={exportMaa}><Download />{intl("components_pages_ManualSchedulePage.exportMaa")}</Button>
      </header>

      {maaImportError ? <p className="mb-3 text-sm text-destructive" role="alert">{maaImportError}</p> : null}

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-y border-border/70 bg-muted/25 px-3 py-3">
        <div className="min-w-0">
          <p className="text-sm font-medium">{intl("components_pages_ManualSchedulePage.manualDraft")} · <span className="font-number">{layout.template}</span></p>
          <p className="mt-1 truncate text-xs text-muted-foreground" data-manual-draft-source={draft.source?.variant ?? "standalone"}>
            {draft.source ? (intl("components_pages_ManualSchedulePage.basedOn", { sourceVariantLabel: sourceVariantLabel })) : null}
            {draft.source ? " · " : null}
            {sourceName ?? (intl("components_pages_ManualSchedulePage.currentOperatorBox"))} · {ownedOperators.length} {intl("components_pages_ManualSchedulePage.owned")}
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
            <Trash2 />{intl("components_pages_ManualSchedulePage.clearEveryFacilityInShift")}
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
                  setPicker({ kind: "fiammetta" });
                }}
              />
            ) : null}
            <ShiftTabs
              maaJson={maa}
              durations={draft.shifts.map((shift) => shift.durationHours)}
              labels={draft.scheduleMode === "period" ? shiftRanges.map((range, index) => ({
                content: <>
                  {intl("components_pages_ManualSchedulePage.shift", { shift: index + 1 })}
                  {" · "}<span className="font-number">{range.startTime}–{range.endTime}</span>
                  {intl("components_pages_ManualSchedulePage.durationParenthetical", { duration: formatManualShiftDuration(range.durationMinutes, en) })}
                </>,
                ariaLabel: intl("components_pages_ManualSchedulePage.shiftRange", {
                  shift: index + 1,
                  startTime: range.startTime,
                  endTime: range.endTime,
                  duration: formatManualShiftDuration(range.durationMinutes, en),
                }),
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
            <DialogTitle>{intl("components_pages_ManualSchedulePage.clearEveryFacilityQuestion")}</DialogTitle>
            <DialogDescription>
              {intl("components_pages_ManualSchedulePage.clearShiftDescription", { shift: activeShift + 1 })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setClearShiftConfirmationOpen(false)}>{intl("components_pages_ManualSchedulePage.cancel")}</Button>
            <Button type="button" variant="destructive" onClick={clearCurrentShift}><Trash2 />{intl("components_pages_ManualSchedulePage.clearCurrentShift")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(picker)} onOpenChange={(open) => { if (!open) setPicker(null); }}>
        <DialogContent className="max-h-[min(720px,calc(100svh-2rem))] max-w-[min(760px,calc(100vw-2rem))] overflow-hidden">
          <DialogHeader>
            <DialogTitle>{picker?.kind === "fiammetta" ? (intl("components_pages_ManualSchedulePage.fiammettaMoraleTarget")) : (intl("components_pages_ManualSchedulePage.assign", { value1: (en) ? (selectedRoom?.title ?? "room") : "", value2: (en) ? "" : (selectedRoom?.title ?? "设施") }))}</DialogTitle>
            <DialogDescription>{picker?.kind === "fiammetta" ? (intl("components_pages_ManualSchedulePage.thisTargetIsStoredOnlyForTheActiveShift")) : (intl("components_pages_ManualSchedulePage.onlyOwnedOperatorsInTheCurrentBoxAreShown"))}</DialogDescription>
          </DialogHeader>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input autoFocus value={pickerQuery} onChange={(event) => setPickerQuery(event.target.value)} className="pl-9" placeholder={intl("components_pages_ManualSchedulePage.searchOperators")} aria-label={intl("components_pages_ManualSchedulePage.searchSelectableOperators")} />
          </div>
          <div className="grid max-h-[52svh] grid-cols-1 gap-2 overflow-y-auto pr-1 sm:grid-cols-2" data-manual-operator-picker onScroll={handlePickerScroll}>
            <TooltipProvider delay={300} timeout={100}>
              {picker?.kind === "slot" ? (
                <div className="col-span-full">
                  <Button type="button" variant="outline" className="min-w-0 justify-center" onClick={() => chooseOperator(null)}><X />{intl("components_pages_ManualSchedulePage.leaveEmpty")}</Button>
                </div>
              ) : null}
              {visibleOperators.map((operator) => (
                <ManualOperatorChoice
                  key={operator.id}
                  operator={operator}
                  selected={selectedOperator === operator.name || (picker?.kind === "fiammetta" && fiammettaTarget === operator.name)}
                  en={en}
                  tooltipDisabled={pickerScrolling}
                  onChoose={() => chooseOperator(operator.name)}
                />
              ))}
              {visibleOperators.length === 0 ? <p className="col-span-full py-8 text-center text-sm text-muted-foreground">{intl("components_pages_ManualSchedulePage.noMatchingOperators")}</p> : null}
            </TooltipProvider>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(maaImportPreview)} onOpenChange={(open) => { if (!open) setMaaImportPreview(null); }}>
        <DialogContent className="max-w-[min(520px,calc(100vw-2rem))]">
          <DialogHeader>
            <DialogTitle>{intl("components_pages_ManualSchedulePage.importMaaScheduleQuestion")}</DialogTitle>
            <DialogDescription>
              {intl("components_pages_ManualSchedulePage.importMaaScheduleDescription")}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2 px-5 py-2 text-sm sm:px-7">
            <p className="truncate"><span className="text-muted-foreground">{intl("components_pages_ManualSchedulePage.fileLabel")}</span>{maaImportPreview?.fileName}</p>
            <p>
              <span className="text-muted-foreground">{intl("components_pages_ManualSchedulePage.shiftsLabel")}</span>
              <span className="font-number">{maaImportPreview?.importedShiftCount}</span>
              {maaImportPreview && maaImportPreview.sourceShiftCount !== maaImportPreview.importedShiftCount ? (
                <span className="ml-2 text-muted-foreground">
                  {intl("components_pages_ManualSchedulePage.expandedFromPlans", { count: maaImportPreview.sourceShiftCount })}
                </span>
              ) : null}
            </p>
            <p>
              <span className="text-muted-foreground">{intl("components_pages_ManualSchedulePage.assignmentsLabel")}</span>
              <span className="font-number">{maaImportPreview?.importedAssignmentCount}</span>
              <span className="text-muted-foreground"> / </span>
              <span className="font-number">{maaImportPreview?.sourceAssignmentCount}</span>
              {maaImportPreview && maaImportPreview.sourceAssignmentCount > maaImportPreview.importedAssignmentCount ? (
                <span className="ml-2 text-amber-700">
                  {intl("components_pages_ManualSchedulePage.unmappedAssignments", { count: maaImportPreview.sourceAssignmentCount - maaImportPreview.importedAssignmentCount })}
                </span>
              ) : null}
            </p>
            <p className="text-xs leading-5 text-muted-foreground">
              {intl("components_pages_ManualSchedulePage.importMaaScheduleDetails")}
            </p>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setMaaImportPreview(null)}>{intl("components_pages_ManualSchedulePage.cancel")}</Button>
            <Button type="button" onClick={confirmMaaImport}><Upload />{intl("components_pages_ManualSchedulePage.replaceDraft")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(pendingMove)} onOpenChange={(open) => { if (!open) setPendingMove(null); }}>
        <DialogContent className="max-w-[min(480px,calc(100vw-2rem))]">
          <DialogHeader><DialogTitle>{intl("components_pages_ManualSchedulePage.moveThisOperator")}</DialogTitle><DialogDescription>{intl("components_pages_ManualSchedulePage.isAlreadyAssignedToMoveThemToAndLeave", { value1: (en) ? (pendingMove?.operator ?? "") : "", previousRoomTitle: previousRoomTitle, nextRoomTitle: nextRoomTitle, value4: (en) ? "" : (pendingMove?.operator ?? "该干员") })}</DialogDescription></DialogHeader>
          <DialogFooter><Button type="button" variant="ghost" onClick={() => setPendingMove(null)}>{intl("components_pages_ManualSchedulePage.cancel")}</Button><Button type="button" onClick={confirmMove}>{intl("components_pages_ManualSchedulePage.moveOperator")}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}
