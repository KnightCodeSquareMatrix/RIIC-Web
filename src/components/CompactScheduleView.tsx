"use client";

import type { CSSProperties } from "react";

import {
  factoryRecipeFor,
  maxRoomLevel,
  tradeOrderFor,
} from "@/blueprint";
import { AnimatedNumber, AnimatedText } from "@/components/AnimatedText";
import { LevelDiamonds, OperatorSlot, roomVisualFor } from "@/components";
import { presentRoomEfficiency } from "@/efficiency";
import {
  COMPACT_CARD_CLASS,
  COMPACT_COLUMN_CLASS,
  COMPACT_DORM_OPERATOR_AREA_CLASS,
  COMPACT_DORM_WRAPPER_CLASS,
  COMPACT_GRID_CLASS,
  COMPACT_HEADER_CLASS,
  COMPACT_OPERATOR_ROW_CLASS,
  COMPACT_POWER_CARD_CLASS,
  COMPACT_POWER_OPERATOR_ROW_CLASS,
  COMPACT_ROOM_BACKGROUND_CLASS,
  COMPACT_ROOM_BACKGROUND_STYLE,
  COMPACT_ROOM_TITLE_CLASS,
  compactFactoryAccent,
  compactTradeAccent,
  isCompactScheduleGroupVisible,
  roomGridTone,
} from "@/schedule-view-presentation";
import type { RoomRow } from "@/schedule";
import type { BaseBlueprint, MaaPlan } from "@/types";
import type { ShiftDirection } from "@/motion";

export interface CompactScheduleViewProps {
  rows: RoomRow[];
  layout: BaseBlueprint;
  currentMoraleByOperator?: ReadonlyMap<string, number>;
  activeShift: number;
  activePlan?: MaaPlan;
  shiftDirection: ShiftDirection;
  onIssue: (row: RoomRow) => void;
}

/** 布局宽度百分比，自己改数值 */
const GRID_LEFT_PCT = 55;   // 左大列宽度%
const GRID_RIGHT_PCT = 45;  // 右大列宽度%
const COMPACT_AUXILIARY_GROUPS = new Set(["meeting", "training", "hire", "processing"]);

function roomSlotCountFor(group: string) {
  if (group === "trading" || group === "manufacture") return 3;
  if (group === "meeting" || group === "training") return 2;
  if (group === "power" || group === "hire" || group === "processing") return 1;
  return 5;
}

function CompactRoomCard({
  row,
  layoutRoom,
  visual,
  efficiency,
  slots,
  currentMoraleByOperator,
  shiftDirection,
  horizontal,
  className = "",
  style,
}: {
  row: RoomRow;
  layoutRoom: BaseBlueprint["rooms"][number] | undefined;
  visual: ReturnType<typeof roomVisualFor>;
  efficiency: ReturnType<typeof presentRoomEfficiency>;
  slots: { slot: RoomRow["operatorSlots"][number] | undefined; positionLabel?: string }[];
  currentMoraleByOperator?: ReadonlyMap<string, number>;
  shiftDirection: ShiftDirection;
  horizontal: boolean;
  className?: string;
  style?: CSSProperties;
}) {
  const isTrade = layoutRoom?.kind === "trade_post";
  const isFactory = layoutRoom?.kind === "factory";
  const isPower = row.group === "power";
  const gridTone = roomGridTone(row.group);
  const rowStyle = {
    "--room-accent": visual.accent,
    "--room-level": visual.level,
    "--room-grid-color": gridTone.color,
    "--room-grid-opacity": gridTone.opacity,
    "--room-grid-fade-start": gridTone.fadeStart,
  } as CSSProperties;

  const header = (
    <div className={COMPACT_HEADER_CLASS}>
      <span className="infra-room-accent h-5 w-1 shrink-0 bg-[var(--room-accent)]" aria-hidden="true" />
      <span className={`${COMPACT_ROOM_TITLE_CLASS} font-number`}>{row.title}</span>
      <LevelDiamonds
        level={row.level}
        maxLevel={layoutRoom ? maxRoomLevel(layoutRoom.kind) : row.level}
        variant="compact"
      />
        {isTrade ? (() => {
          const order = tradeOrderFor(layoutRoom!);
          const accent = compactTradeAccent(order);
          const label = order === "gold" ? "龙门商法" : order === "originium" ? "开采协力" : order;
          return (
            <div className={`ml-auto flex h-7 w-[90px] items-center justify-center rounded border px-2 text-xs ${accent}`}>
              {label}
            </div>
          );
        })() : isFactory ? (() => {
          const recipe = factoryRecipeFor(layoutRoom!);
          const accent = compactFactoryAccent(recipe);
          const label = recipe === "all" ? "自动选择" : recipe === "gold" ? "贵金属" : recipe === "battle_record" ? "作战记录" : recipe === "originium" ? "源石碎片" : recipe;
          return (
            <div className={`ml-auto flex h-7 w-[90px] items-center justify-center rounded border px-2 text-xs ${accent}`}>
              {label}
            </div>
          );
      })() : null}
    </div>
  );

  const efficiencyBlock = efficiency ? (
    <div>
      {isPower ? (
        <span className="infra-room-value font-technical text-sm font-semibold leading-4 tabular-nums text-[var(--room-accent)]" data-room-primary-efficiency>
          <AnimatedNumber value={efficiency.primaryValue} trend={shiftDirection} />
        </span>
      ) : row.group === "trading" || row.group === "manufacture" ? (
        <div className="font-technical flex flex-wrap items-center gap-x-1.5 text-xs tracking-[0.01em] text-white/76">
          <span className="infra-room-value font-semibold tabular-nums text-[var(--room-accent)]" data-room-primary-efficiency>
            <AnimatedNumber value={efficiency.primaryValue} trend={shiftDirection} />
          </span>
          {efficiency.details.map((detail, index) => (
            <span key={`${detail.label ?? ""}-${index}`} className={`font-number ${detail.kind === "cross-station" ? "text-[#C8F75A]" : ""}`}>
              {efficiency.formula ? <>{detail.operator ? `${detail.operator} ` : ""}<AnimatedText value={detail.value} trend={shiftDirection} /> {detail.label}</> : <>/ {detail.label} <AnimatedText value={detail.value} trend={shiftDirection} /></>}
            </span>
          ))}
        </div>
      ) : (
        <span className="font-technical text-sm tabular-nums text-white/66" data-room-primary-efficiency>
          <AnimatedNumber value={efficiency.primaryValue} trend={shiftDirection} />
        </span>
      )}
    </div>
  ) : null;
  const emptyWorkstationState = !efficiency && (row.group === "trading" || row.group === "manufacture") ? (
    <div className="font-technical text-xs tracking-[0.01em] text-white/38">
      等待排班
    </div>
  ) : null;
  const efficiencyContent = efficiencyBlock ?? emptyWorkstationState;

  const operators = slots.map(({ slot, positionLabel }, index) => (
    <OperatorSlot
      key={`${row.key}-${index}`}
      slot={slot}
      currentMorale={slot ? currentMoraleByOperator?.get(slot.name) : undefined}
      autofill={row.group === "dormitory" && row.autofill}
      compactView
      showSkillTooltip
      shiftDirection={shiftDirection}
      transitionDelay={Math.min(index, 2) * 0.02}
      positionLabel={positionLabel}
    />
  ));

  const backgroundLayers = (
    <>
      <div
        className={COMPACT_ROOM_BACKGROUND_CLASS}
        style={{
          ...COMPACT_ROOM_BACKGROUND_STYLE,
          backgroundImage: `url(${visual.background})`,
        }}
        aria-hidden="true"
      />
    </>
  );
  const details = (
    <div className="relative z-10 min-w-0">
      {header}
      {efficiencyContent ? <div className={row.group === "power" ? "mt-1" : "mt-2"}>{efficiencyContent}</div> : null}
    </div>
  );

  if (horizontal) {
    const operatorArea = (
      <div className={`relative z-10 ${COMPACT_POWER_OPERATOR_ROW_CLASS}`}>
        {operators}
      </div>
    );
    return (
      <div
        className={`${COMPACT_POWER_CARD_CLASS} ${className}`}
        data-room-group={row.group}
        data-room-title={row.title}
        style={{ ...rowStyle, ...style }}
      >
        {backgroundLayers}
        {details}
        {operatorArea}
      </div>
    );
  }

  return (
    <div
      className={`${COMPACT_CARD_CLASS} ${className}`}
      data-room-group={row.group}
      data-room-title={row.title}
      style={{ ...rowStyle, ...style }}
    >
      {backgroundLayers}
      {details}
      <div
        className={`relative z-10 ${
          row.group === "dormitory" ? COMPACT_DORM_OPERATOR_AREA_CLASS : ""
        }`}
      >
        <div className={COMPACT_OPERATOR_ROW_CLASS}>{operators}</div>
      </div>
    </div>
  );
}

export function CompactScheduleView(props: CompactScheduleViewProps) {
  const { rows, layout, currentMoraleByOperator, shiftDirection } = props;

  if (rows.length === 0) {
    return (
      <div className="flex min-h-[420px] items-center justify-center border-y border-dashed border-border/70 py-6 text-center text-sm text-muted-foreground">
        没有可展示的布局房间。
      </div>
    );
  }

  const byGroup = new Map<string, RoomRow[]>();
  for (const row of rows) {
    if (!isCompactScheduleGroupVisible(row.group)) continue;
    const list = byGroup.get(row.group) ?? [];
    list.push(row);
    byGroup.set(row.group, list);
  }
  const getGroup = (group: string) => byGroup.get(group) ?? [];

  const workstations = [...getGroup("trading"), ...getGroup("manufacture")];
  const power = getGroup("power");
  const dorms = getGroup("dormitory");
  const powerCount = power.length;
  const layoutRooms = new Map(layout.rooms.map((room) => [room.id, room]));

  function makeCard(row: RoomRow, widthPercent?: number) {
    const layoutRoom = layoutRooms.get(row.roomId);
    const visual = roomVisualFor(row.group);
    const efficiency = presentRoomEfficiency(row.group, row.efficiency);
    const slotCount = roomSlotCountFor(row.group);
    const slots = row.positionSlots
      ? row.positionSlots.map(({ slot, positionLabel }) => ({ slot, positionLabel }))
      : Array.from({ length: slotCount }, (_, i) => ({ slot: row.operatorSlots[i] }));
    return (
      <CompactRoomCard
        key={row.key}
        row={row}
        layoutRoom={layoutRoom!}
        visual={visual}
        efficiency={efficiency}
        slots={slots}
        currentMoraleByOperator={currentMoraleByOperator}
        shiftDirection={shiftDirection}
        horizontal={COMPACT_AUXILIARY_GROUPS.has(row.group)}
        className="min-w-0"
        style={widthPercent !== undefined ? { flexBasis: `${widthPercent}%` } : { flex: 1 }}
      />
    );
  }

  const ctrl = getGroup("control")[0];
  const meeting = getGroup("meeting")[0];
  const training = getGroup("training")[0];
  const office = getGroup("hire")[0];
  const processing = getGroup("processing")[0];

  return (
    <div className={COMPACT_GRID_CLASS} data-compact-schedule-view>
      <div
        className={COMPACT_COLUMN_CLASS}
        style={{ flexBasis: `${GRID_LEFT_PCT}%` }}
      >
        <div>{ctrl && makeCard(ctrl)}</div>

        {[0, 2, 4].map((start) => (
          <div key={start} className="flex justify-between gap-3">
            {workstations[start] && makeCard(workstations[start], 50)}
            {workstations[start + 1] && makeCard(workstations[start + 1], 50)}
          </div>
        ))}

        {powerCount === 3 ? (
          <div className="flex items-start justify-between gap-3">
            {power.slice(0, 3).map((powerRoom) => makeCard(powerRoom, 33))}
          </div>
        ) : (
          <div className="flex justify-between gap-3">
            <div className="flex justify-between gap-3" style={{ flexBasis: "50%" }}>
              {power[0] && makeCard(power[0])}
              {power[1] && makeCard(power[1])}
            </div>
            {workstations[6] && makeCard(workstations[6], 50)}
          </div>
        )}
      </div>

      <div
        className={COMPACT_COLUMN_CLASS}
        style={{ flexBasis: `${GRID_RIGHT_PCT}%` }}
      >
        <div className="compact-auxiliary-container min-w-0">
          <div className="compact-auxiliary-grid">
            {meeting && makeCard(meeting)}
            {training && makeCard(training)}
            {office && makeCard(office)}
            {processing && makeCard(processing)}
          </div>
        </div>

        {dorms.slice(0, 4).map((dorm) => (
          <div key={dorm.key} className={COMPACT_DORM_WRAPPER_CLASS}>
            {makeCard(dorm)}
          </div>
        ))}
      </div>
    </div>
  );
}
