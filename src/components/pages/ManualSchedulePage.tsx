"use client";

import { Download, HeartPulse, Search, Settings2, Sparkles, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import type { FactoryRecipe, TradeOrder } from "@/blueprint";
import { ScheduleBoard } from "@/components";
import { OperatorSkillTooltip } from "@/components/OperatorSkillTooltip";
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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TooltipProvider } from "@/components/ui/tooltip";
import { downloadJson } from "@/download";
import { demoOperatorName, useLanguageDemo } from "@/language-demo";
import {
  assignManualOperator,
  createManualScheduleDraft,
  loadManualScheduleDraft,
  manualScheduleToMaa,
  persistManualScheduleDraft,
  reconcileManualScheduleDraft,
  resizeManualScheduleDraft,
  setManualDormAutofill,
  type ManualOperatorConflict,
  type ManualScheduleDraft,
} from "@/manual-schedule";
import { operatorPortraitFor } from "@/operatorPortraits";
import { addOperatorPresentations } from "@/schedule-presentation";
import { planToRows, type RoomRow } from "@/schedule";
import type { BaseBlueprint, OperBoxEntry } from "@/types";

export interface ManualSchedulePageProps {
  layout: BaseBlueprint;
  operbox: OperBoxEntry[] | null;
  sourceName: string | null;
  shiftDurations: number[];
  fiammettaEnabled: boolean;
  initialDraft: ManualScheduleDraft | null;
  onInitialDraftConsumed: () => void;
  onShiftDurationsChange: (durations: number[]) => void;
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

function compactNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/\.?0+$/, "");
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
  const displayName = demoOperatorName(operator.name, en ? "en" : "zh");
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
          <img src={portrait} alt={en ? `${displayName} portrait` : `${displayName}头像`} className="size-full object-cover" loading="lazy" decoding="async" />
        ) : null}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold">{displayName}</span>
        <span className="font-number mt-1 block text-xs text-muted-foreground">
          {operator.rarity}★ · {en ? `E${operator.elite} Lv.${operator.level}` : `精${operator.elite} Lv.${operator.level}`}
        </span>
        <span className="mt-1 block text-[11px] text-muted-foreground/80">{en ? "Hover for infrastructure skills" : "悬浮查看基建技能"}</span>
      </span>
    </button>
  );
  return <OperatorSkillTooltip name={operator.name} trigger={card} delay={1_500} disabled={tooltipDisabled} />;
}

export function ManualSchedulePage({
  layout,
  operbox,
  sourceName,
  shiftDurations,
  fiammettaEnabled,
  initialDraft,
  onInitialDraftConsumed,
  onShiftDurationsChange,
  onFiammettaEnabledChange,
  onOpenSetup,
  onFactoryRecipeChange,
  onTradeOrderChange,
}: ManualSchedulePageProps) {
  const { locale } = useLanguageDemo();
  const en = locale === "en";
  const [draft, setDraft] = useState<ManualScheduleDraft>(() => createManualScheduleDraft(shiftDurations));
  const [restored, setRestored] = useState(false);
  const [picker, setPicker] = useState<PickerTarget | null>(null);
  const [pickerQuery, setPickerQuery] = useState("");
  const [pendingMove, setPendingMove] = useState<PendingMove | null>(null);
  const [storageWarning, setStorageWarning] = useState<string | null>(null);
  const [scheduleQuery, setScheduleQuery] = useState("");
  const [pickerScrolling, setPickerScrolling] = useState(false);
  const pickerScrollTimer = useRef<number | null>(null);

  useEffect(() => () => {
    if (pickerScrollTimer.current !== null) window.clearTimeout(pickerScrollTimer.current);
  }, []);

  const ownedOperators = useMemo(() => (
    (operbox ?? []).filter((entry) => entry.own).sort((left, right) => left.name.localeCompare(right.name, "zh-CN"))
  ), [operbox]);
  const canPersistDraft = ownedOperators.length > 0;
  const ownedFingerprint = ownedOperators.map((operator) => operator.name).join("\0");

  useEffect(() => {
    if (restored) return;
    try {
      const saved = initialDraft ?? loadManualScheduleDraft(window.localStorage);
      if (saved) {
        const reconciled = reconcileManualScheduleDraft(saved, layout, operbox);
        setDraft(reconciled);
        onShiftDurationsChange(reconciled.shifts.map((shift) => shift.durationHours));
        onFiammettaEnabledChange(reconciled.fiammettaEnabled);
      }
    } catch {
      setStorageWarning(en ? "The manual draft could not be restored." : "无法恢复浏览器中的手动排班草稿。");
    }
    if (initialDraft) onInitialDraftConsumed();
    setRestored(true);
  }, [en, initialDraft, layout, onFiammettaEnabledChange, onInitialDraftConsumed, onShiftDurationsChange, operbox, restored]);

  useEffect(() => {
    if (!restored) return;
    setDraft((current) => current.fiammettaEnabled === fiammettaEnabled
      ? current
      : { ...current, fiammettaEnabled });
  }, [fiammettaEnabled, restored]);

  useEffect(() => {
    if (!restored) return;
    setDraft((current) => reconcileManualScheduleDraft(
      resizeManualScheduleDraft(current, shiftDurations),
      layout,
      operbox,
    ));
  }, [layout, operbox, ownedFingerprint, restored, shiftDurations]);

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

  function enableDormAutofill() {
    if (!picker || picker.kind !== "slot" || selectedRoom?.group !== "dormitory") return;
    setDraft((current) => setManualDormAutofill(
      current,
      layout,
      activeShift,
      picker.roomId,
      true,
    ));
    setPicker(null);
  }

  function exportMaa() {
    downloadJson("arknights-infra-schedule-maa.json", maa);
  }

  if (!operbox?.some((operator) => operator.own)) {
    return (
      <section className="flex min-h-[calc(100svh-9rem)] items-center justify-center py-8" aria-labelledby="manual-schedule-empty-title" data-manual-schedule-empty>
        <div className="w-full max-w-2xl border border-[#313131]/15 bg-[#F3F1EA] px-6 py-12 text-center shadow-[0_18px_45px_rgb(49_49_49/0.08)] sm:px-10">
          <span className="mx-auto grid size-12 place-items-center bg-[#313131] text-[#FFD800]" aria-hidden="true"><Sparkles /></span>
          <h1 id="manual-schedule-empty-title" className="mt-5 text-2xl font-semibold tracking-tight">{en ? "Build a manual schedule" : "创建手动基建排班"}</h1>
          <p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-muted-foreground">{en ? "Choose an operator Box, base layout, shift count and independent durations before filling each room." : "先配置干员 Box、基建布局、班次数量和每班时长，再逐个填写设施。"}</p>
          <Button type="button" size="lg" className="mt-7 min-h-11" onClick={onOpenSetup}><Settings2 />{en ? "Configure Box & layout" : "配置 Box 与布局"}</Button>
        </div>
      </section>
    );
  }

  const fiammettaTarget = draft.shifts[activeShift]?.fiammettaTarget;
  const previousRoomTitle = pendingMove ? rows.find((row) => row.roomId === pendingMove.conflict.roomId)?.title ?? pendingMove.conflict.roomId : "";
  const nextRoomTitle = pendingMove ? rows.find((row) => row.roomId === pendingMove.target.roomId)?.title ?? pendingMove.target.roomId : "";

  return (
    <div className="min-h-[calc(100svh-9rem)] py-2" data-manual-schedule-page>
      <header className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[240px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input value={scheduleQuery} onChange={(event) => setScheduleQuery(event.target.value)} className="pl-9" aria-label={en ? "Search this manual schedule" : "搜索手动排班中的干员或房间"} placeholder={en ? "Search operators or rooms" : "搜索排班中的干员或房间"} />
        </div>
        <Button type="button" variant="outline" size="sm" onClick={onOpenSetup}><Settings2 />{en ? "Configure Box & layout" : "配置 Box 与布局"}</Button>
        <Button type="button" size="sm" onClick={exportMaa}><Download />{en ? "Export MAA" : "导出到 MAA"}</Button>
      </header>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-y border-border/70 bg-muted/25 px-3 py-3">
        <div className="min-w-0">
          <p className="text-sm font-medium">{en ? "Manual draft" : "手动排班草稿"} · <span className="font-number">{layout.template}</span></p>
          <p className="mt-1 truncate text-xs text-muted-foreground">{sourceName ?? (en ? "Current operator Box" : "当前干员 Box")} · {ownedOperators.length} {en ? "owned" : "名已拥有干员"}</p>
        </div>
        {fiammettaEnabled ? (
          <Button type="button" variant="outline" size="sm" onClick={() => { setPickerQuery(""); setPicker({ kind: "fiammetta" }); }}>
            <HeartPulse className="text-[#016E65]" />
            {fiammettaTarget ? (en ? `Target: ${fiammettaTarget}` : `换心情：${fiammettaTarget}`) : (en ? "Choose morale target" : "选择换心情目标")}
          </Button>
        ) : null}
      </div>

      {storageWarning ? <p className="mb-3 text-sm text-amber-700" role="status">{storageWarning}</p> : null}

      <div className="mb-4 max-w-full overflow-hidden">
        <Tabs value={String(activeShift)} onValueChange={(value) => setActiveShift(Number(value))}>
          <TabsList className="max-w-full justify-start overflow-x-auto overflow-y-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" data-manual-shift-tabs>
            {draft.shifts.map((shift, index) => (
              <TabsTrigger key={index} value={String(index)}>{en ? `Shift ${index + 1}` : `班次 ${index + 1}`} · <span className="font-number">{compactNumber(shift.durationHours)}h</span></TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      <ScheduleBoard
        rows={rows}
        layout={layout}
        planRevision={`manual-${activeShift}`}
        activeShift={activeShift}
        activePlan={activePlan}
        searchQuery={scheduleQuery}
        onSlotClick={openSlotPicker}
        onFactoryRecipeChange={onFactoryRecipeChange}
        onTradeOrderChange={onTradeOrderChange}
      />

      <Dialog open={Boolean(picker)} onOpenChange={(open) => { if (!open) setPicker(null); }}>
        <DialogContent className="max-h-[min(720px,calc(100svh-2rem))] max-w-[min(760px,calc(100vw-2rem))] overflow-hidden">
          <DialogHeader>
            <DialogTitle>{picker?.kind === "fiammetta" ? (en ? "Fiammetta morale target" : "选择菲亚梅塔换心情目标") : (en ? `Assign ${selectedRoom?.title ?? "room"}` : `安排${selectedRoom?.title ?? "设施"}干员`)}</DialogTitle>
            <DialogDescription>{picker?.kind === "fiammetta" ? (en ? "This target is stored only for the active shift." : "该目标只应用于当前班次。") : (en ? "Only owned operators in the current Box are shown." : "这里只显示当前 Box 中已拥有的干员。")}</DialogDescription>
          </DialogHeader>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input autoFocus value={pickerQuery} onChange={(event) => setPickerQuery(event.target.value)} className="pl-9" placeholder={en ? "Search operators" : "搜索干员"} aria-label={en ? "Search selectable operators" : "搜索可选干员"} />
          </div>
          <div className="grid max-h-[52svh] grid-cols-1 gap-2 overflow-y-auto pr-1 sm:grid-cols-2" data-manual-operator-picker onScroll={handlePickerScroll}>
            <TooltipProvider delay={1_500} timeout={0}>
              {picker?.kind === "slot" ? (
                <div className="col-span-full grid grid-cols-2 gap-2">
                  <Button type="button" variant="outline" className="min-w-0 justify-center" onClick={() => chooseOperator(null)}><X />{en ? "Leave empty" : "保持空置"}</Button>
                  {selectedRoom?.group === "dormitory" ? (
                    <Button type="button" variant={selectedAssignment?.autofill ? "default" : "outline"} className="min-w-0 justify-center" onClick={enableDormAutofill}><Sparkles />{en ? "Auto-fill" : "自动补位"}</Button>
                  ) : <span aria-hidden="true" />}
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
              {visibleOperators.length === 0 ? <p className="col-span-full py-8 text-center text-sm text-muted-foreground">{en ? "No matching operators." : "没有匹配的干员。"}</p> : null}
            </TooltipProvider>
          </div>
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
