import type {
  BaseBlueprint,
  BlueprintRoom,
  MaaJson,
  MaaOperatorSlot,
  MaaRoom,
  MaaRooms,
  OperBoxEntry,
  RoomKind,
  TrainingRoomShift,
} from "./types.ts";
import {
  DEFAULT_MANUAL_SHIFT_DURATIONS,
  MANUAL_SCHEDULE_STORAGE_KEY,
  MAX_MANUAL_SHIFT_COUNT,
  MIN_MANUAL_SHIFT_COUNT,
} from "./manual-schedule-config.ts";

export {
  DEFAULT_MANUAL_SHIFT_DURATIONS,
  MANUAL_SCHEDULE_STORAGE_KEY,
  MAX_MANUAL_SHIFT_COUNT,
  MIN_MANUAL_SHIFT_COUNT,
} from "./manual-schedule-config.ts";

export interface ManualRoomAssignment {
  operators: Array<string | null>;
  autofill?: boolean;
}

export interface ManualShift {
  durationHours: number;
  rooms: Record<string, ManualRoomAssignment>;
  fiammettaTarget: string | null;
}

export interface ManualScheduleSource {
  kind: "calculator";
  variant: "baseline" | "progression-adjusted";
  createdAt: string;
}

export interface ManualScheduleDraft {
  version: 2;
  activeShift: number;
  fiammettaEnabled: boolean;
  shifts: ManualShift[];
  source?: ManualScheduleSource;
}

export interface ManualOperatorConflict {
  roomId: string;
  slotIndex: number;
}

type StorageLike = Pick<Storage, "getItem" | "setItem">;

const MAA_GROUP_BY_ROOM_KIND: Partial<Record<RoomKind, keyof MaaRooms>> = {
  control_center: "control",
  trade_post: "trading",
  factory: "manufacture",
  power_plant: "power",
  dormitory: "dormitory",
  office: "hire",
  meeting_room: "meeting",
  workshop: "processing",
};

function finitePositive(value: unknown, fallback: number): number {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.round(number * 100) / 100 : fallback;
}

export function manualRoomCapacity(room: BlueprintRoom): number {
  if (room.kind === "control_center") return 5;
  if (room.kind === "trade_post" || room.kind === "factory") return 3;
  if (room.kind === "meeting_room" || room.kind === "training_room") return 2;
  if (room.kind === "dormitory") return Math.max(1, Math.min(5, room.dorm_beds ?? 5));
  return 1;
}

function emptyShift(durationHours: number): ManualShift {
  return { durationHours, rooms: {}, fiammettaTarget: null };
}

export function createManualScheduleDraft(
  durations: readonly number[] = DEFAULT_MANUAL_SHIFT_DURATIONS,
): ManualScheduleDraft {
  const normalized = durations.length ? durations : DEFAULT_MANUAL_SHIFT_DURATIONS;
  return {
    version: 2,
    activeShift: 0,
    fiammettaEnabled: false,
    shifts: normalized.slice(0, MAX_MANUAL_SHIFT_COUNT).map((duration) => emptyShift(finitePositive(duration, 12))),
  };
}

function maaOperatorName(operator: string | MaaOperatorSlot | null): string | null {
  if (typeof operator === "string") return operator.trim() || null;
  if (!operator || typeof operator.name !== "string") return null;
  return operator.name.trim() || null;
}

export function createManualScheduleDraftFromCalculator(input: {
  layout: BaseBlueprint;
  maa?: MaaJson | null;
  fallbackDurations: readonly number[];
  fiammettaEnabled: boolean;
  trainingRoomShifts?: readonly TrainingRoomShift[];
  source?: ManualScheduleSource;
}): ManualScheduleDraft {
  const planCount = input.maa?.plans.length ?? 0;
  const durations = Array.from(
    { length: Math.max(planCount, input.fallbackDurations.length, MIN_MANUAL_SHIFT_COUNT) },
    (_, index) => finitePositive(
      input.fallbackDurations[index],
      finitePositive(
        typeof input.maa?.plans[index]?.duration === "number" ? input.maa.plans[index]!.duration! / 60 : undefined,
        12,
      ),
    ),
  );
  const draft = createManualScheduleDraft(durations);
  draft.fiammettaEnabled = input.fiammettaEnabled;
  if (input.source) draft.source = { ...input.source };

  input.maa?.plans.forEach((plan, shiftIndex) => {
    const shift = draft.shifts[shiftIndex];
    if (!shift) return;
    const groupIndexes: Partial<Record<keyof MaaRooms, number>> = {};
    for (const room of input.layout.rooms) {
      const group = MAA_GROUP_BY_ROOM_KIND[room.kind];
      if (!group) continue;
      const roomIndex = groupIndexes[group] ?? 0;
      groupIndexes[group] = roomIndex + 1;
      const sourceRoom = plan.rooms?.[group]?.[roomIndex];
      if (!sourceRoom) continue;
      shift.rooms[room.id] = {
        operators: Array.from(
          { length: manualRoomCapacity(room) },
          (_, slotIndex) => maaOperatorName(sourceRoom.operators?.[slotIndex] ?? null),
        ),
        ...(room.kind === "dormitory" ? { autofill: sourceRoom.autofill ?? true } : {}),
      };
    }
    const target = plan.Fiammetta?.target;
    shift.fiammettaTarget = plan.Fiammetta?.enable
      ? (Array.isArray(target) ? target.find(Boolean) : target) ?? null
      : null;
  });

  const trainingRoom = input.layout.rooms.find((room) => room.kind === "training_room");
  if (trainingRoom) {
    input.trainingRoomShifts?.forEach((trainingShift, shiftIndex) => {
      const shift = draft.shifts[shiftIndex];
      if (!shift) return;
      shift.rooms[trainingRoom.id] = { operators: [trainingShift.trainee, trainingShift.trainer] };
    });
  }
  return draft;
}

export function loadManualScheduleDraft(storage: StorageLike): ManualScheduleDraft | null {
  try {
    const value = JSON.parse(storage.getItem(MANUAL_SCHEDULE_STORAGE_KEY) ?? "null") as unknown;
    if (!value || typeof value !== "object" || !("shifts" in value) || !Array.isArray(value.shifts)) return null;
    const rawShifts = value.shifts.slice(0, MAX_MANUAL_SHIFT_COUNT);
    if (rawShifts.length < MIN_MANUAL_SHIFT_COUNT) return null;
    const shifts = rawShifts.map((raw): ManualShift => {
      const candidate = raw && typeof raw === "object" ? raw as Partial<ManualShift> : {};
      const rooms = candidate.rooms && typeof candidate.rooms === "object" && !Array.isArray(candidate.rooms)
        ? Object.fromEntries(Object.entries(candidate.rooms).flatMap(([roomId, assignment]) => {
          if (!assignment || typeof assignment !== "object" || !Array.isArray((assignment as ManualRoomAssignment).operators)) return [];
          return [[roomId, {
            operators: (assignment as ManualRoomAssignment).operators.map((name) => typeof name === "string" ? name : null),
            ...(typeof (assignment as ManualRoomAssignment).autofill === "boolean"
              ? { autofill: (assignment as ManualRoomAssignment).autofill }
              : {}),
          }]];
        }))
        : {};
      return {
        durationHours: finitePositive(candidate.durationHours, 12),
        rooms,
        fiammettaTarget: typeof candidate.fiammettaTarget === "string" ? candidate.fiammettaTarget : null,
      };
    });
    const activeShift = "activeShift" in value && Number.isInteger(value.activeShift)
      ? Math.max(0, Math.min(shifts.length - 1, Number(value.activeShift)))
      : 0;
    const rawSource = "source" in value && value.source && typeof value.source === "object"
      ? value.source as Partial<ManualScheduleSource>
      : null;
    const source = rawSource?.kind === "calculator"
      && (rawSource.variant === "baseline" || rawSource.variant === "progression-adjusted")
      && typeof rawSource.createdAt === "string"
      && Number.isFinite(Date.parse(rawSource.createdAt))
      ? {
          kind: "calculator" as const,
          variant: rawSource.variant,
          createdAt: new Date(rawSource.createdAt).toISOString(),
        }
      : undefined;
    return {
      version: 2,
      activeShift,
      fiammettaEnabled: "fiammettaEnabled" in value && value.fiammettaEnabled === true,
      shifts,
      ...(source ? { source } : {}),
    };
  } catch {
    return null;
  }
}

export function persistManualScheduleDraft(storage: StorageLike, draft: ManualScheduleDraft): void {
  storage.setItem(MANUAL_SCHEDULE_STORAGE_KEY, JSON.stringify(draft));
}

export function resizeManualScheduleDraft(
  draft: ManualScheduleDraft,
  durations: readonly number[],
): ManualScheduleDraft {
  const count = Math.max(MIN_MANUAL_SHIFT_COUNT, Math.min(MAX_MANUAL_SHIFT_COUNT, durations.length));
  const shifts = Array.from({ length: count }, (_, index) => ({
    ...(draft.shifts[index] ?? emptyShift(finitePositive(durations[index], 12))),
    durationHours: finitePositive(durations[index], draft.shifts[index]?.durationHours ?? 12),
  }));
  return {
    version: 2,
    activeShift: Math.min(draft.activeShift, shifts.length - 1),
    fiammettaEnabled: draft.fiammettaEnabled,
    shifts,
    ...(draft.source ? { source: { ...draft.source } } : {}),
  };
}

export function reconcileManualScheduleDraft(
  draft: ManualScheduleDraft,
  layout: BaseBlueprint,
  operbox?: OperBoxEntry[] | null,
): ManualScheduleDraft {
  const owned = operbox ? new Set(operbox.filter((entry) => entry.own).map((entry) => entry.name)) : null;
  return {
    version: 2,
    activeShift: Math.min(Math.max(0, draft.activeShift), Math.max(0, draft.shifts.length - 1)),
    fiammettaEnabled: draft.fiammettaEnabled === true,
    ...(draft.source ? { source: { ...draft.source } } : {}),
    shifts: draft.shifts.map((shift) => ({
      durationHours: finitePositive(shift.durationHours, 12),
      fiammettaTarget: shift.fiammettaTarget && (!owned || owned.has(shift.fiammettaTarget))
        ? shift.fiammettaTarget
        : null,
      rooms: Object.fromEntries(layout.rooms.map((room) => {
        const assignment = shift.rooms[room.id];
        const operators = Array.from(
          { length: manualRoomCapacity(room) },
          (_, index) => {
            const name = assignment?.operators[index];
            return typeof name === "string" && name.length > 0 && (!owned || owned.has(name)) ? name : null;
          },
        );
        return [room.id, {
          operators,
          ...(room.kind === "dormitory" ? { autofill: assignment?.autofill ?? true } : {}),
        } satisfies ManualRoomAssignment];
      })),
    })),
  };
}

export function manualScheduleDraftContentEqual(
  left: ManualScheduleDraft,
  right: ManualScheduleDraft,
): boolean {
  return JSON.stringify({
    fiammettaEnabled: left.fiammettaEnabled,
    shifts: left.shifts,
  }) === JSON.stringify({
    fiammettaEnabled: right.fiammettaEnabled,
    shifts: right.shifts,
  });
}

export function findManualOperatorConflict(
  shift: ManualShift,
  operator: string,
  targetRoomId: string,
  targetSlotIndex: number,
): ManualOperatorConflict | null {
  for (const [roomId, assignment] of Object.entries(shift.rooms)) {
    const slotIndex = assignment.operators.findIndex((name, index) => (
      name === operator && (roomId !== targetRoomId || index !== targetSlotIndex)
    ));
    if (slotIndex >= 0) return { roomId, slotIndex };
  }
  return null;
}

export function assignManualOperator(input: {
  draft: ManualScheduleDraft;
  layout: BaseBlueprint;
  shiftIndex: number;
  roomId: string;
  slotIndex: number;
  operator: string | null;
  moveExisting?: boolean;
}): { draft: ManualScheduleDraft; conflict: ManualOperatorConflict | null } {
  const { layout, shiftIndex, roomId, slotIndex, operator } = input;
  const room = layout.rooms.find((candidate) => candidate.id === roomId);
  const shift = input.draft.shifts[shiftIndex];
  if (!room || !shift || slotIndex < 0 || slotIndex >= manualRoomCapacity(room)) {
    return { draft: input.draft, conflict: null };
  }
  const currentAssignment = shift.rooms[roomId];
  const currentOperator = currentAssignment?.operators[slotIndex] ?? null;
  if (operator !== null && operator === currentOperator) return { draft: input.draft, conflict: null };

  const conflict = operator ? findManualOperatorConflict(shift, operator, roomId, slotIndex) : null;
  if (conflict?.roomId === roomId) {
    const next = structuredClone(input.draft);
    const operators = next.shifts[shiftIndex]!.rooms[roomId]!.operators;
    operators[slotIndex] = operator;
    operators[conflict.slotIndex] = currentOperator;
    return { draft: next, conflict: null };
  }
  if (conflict && !input.moveExisting) return { draft: input.draft, conflict };

  const next = structuredClone(input.draft);
  const nextShift = next.shifts[shiftIndex]!;
  if (conflict) {
    const previous = nextShift.rooms[conflict.roomId];
    if (previous) previous.operators[conflict.slotIndex] = null;
  }
  const assignment = nextShift.rooms[roomId] ?? {
    operators: Array.from({ length: manualRoomCapacity(room) }, () => null),
    ...(room.kind === "dormitory" ? { autofill: true } : {}),
  };
  assignment.operators = Array.from(
    { length: manualRoomCapacity(room) },
    (_, index) => index === slotIndex ? operator : assignment.operators[index] ?? null,
  );
  if (room.kind === "dormitory" && operator === null) assignment.autofill = false;
  nextShift.rooms[roomId] = assignment;
  return { draft: next, conflict };
}

export function setManualDormAutofill(
  draft: ManualScheduleDraft,
  layout: BaseBlueprint,
  shiftIndex: number,
  roomId: string,
  enabled: boolean,
): ManualScheduleDraft {
  const room = layout.rooms.find((candidate) => candidate.id === roomId && candidate.kind === "dormitory");
  if (!room || !draft.shifts[shiftIndex]) return draft;
  const next = structuredClone(draft);
  const shift = next.shifts[shiftIndex]!;
  const assignment = shift.rooms[roomId] ?? {
    operators: Array.from({ length: manualRoomCapacity(room) }, () => null),
  };
  assignment.autofill = enabled;
  shift.rooms[roomId] = assignment;
  return next;
}

function maaProduct(room: BlueprintRoom): string | undefined {
  if (room.kind === "trade_post") {
    const order = room.product && "trade" in room.product ? room.product.trade.order : "gold";
    return order === "originium" ? "Originium Shard" : "LMD";
  }
  if (room.kind !== "factory") return undefined;
  const recipe = room.product && "factory" in room.product ? room.product.factory.recipe : "gold";
  if (recipe === "battle_record") return "Battle Record";
  if (recipe === "originium") return "Originium Shard";
  if (recipe === "all") return "all";
  return "Pure Gold";
}

function maaRoom(room: BlueprintRoom, assignment: ManualRoomAssignment | undefined): MaaRoom {
  const operators = (assignment?.operators ?? []).filter(
    (operator): operator is string => typeof operator === "string" && operator.length > 0,
  );
  const product = maaProduct(room);
  return {
    operators,
    sort: false,
    skip: false,
    autofill: room.kind === "dormitory" ? assignment?.autofill ?? true : false,
    ...(product ? { product } : {}),
  };
}

export function manualScheduleToMaa(
  draft: ManualScheduleDraft,
  layout: BaseBlueprint,
  fiammettaEnabled: boolean,
): MaaJson {
  return {
    title: `手动排班 · ${layout.template}`,
    description: "由可露希尔基建终端手动排班生成",
    planTimes: `${draft.shifts.length}班`,
    plans: draft.shifts.map((shift, shiftIndex) => {
      const rooms: MaaRooms = {};
      for (const room of layout.rooms) {
        const group = MAA_GROUP_BY_ROOM_KIND[room.kind];
        if (!group) continue;
        const groupRooms = rooms[group] ?? [];
        groupRooms.push(maaRoom(room, shift.rooms[room.id]));
        rooms[group] = groupRooms;
      }
      return {
        name: `班次 ${shiftIndex + 1}`,
        duration: Math.round(shift.durationHours * 60),
        rooms,
        Fiammetta: fiammettaEnabled && shift.fiammettaTarget
          ? { enable: true, target: shift.fiammettaTarget, order: "pre" as const }
          : { enable: false, target: "", order: "pre" as const },
      };
    }),
  };
}
