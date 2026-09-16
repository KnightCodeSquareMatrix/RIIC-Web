import { factoryRecipeFor, tradeOrderFor } from "./blueprint.ts";
import { manualRoomCapacity, type ManualScheduleDraft } from "./manual-schedule.ts";
import { resolveManualManufactureRoom, resolveManualPowerRoom, resolveManualTradeRoom } from "./manual-room-efficiency-resolvers.ts";
import type { BaseBlueprint, MaaJson, RotationJson, RotationRoomLine, RotationShift } from "./types.ts";

type Facility = "manufacture" | "trade" | "power";
type Recipe = "all" | "gold" | "battle_record" | "originium";

const TRADE_BASE_DAILY: Record<number, number> = { 1: 10_000, 2: 10_141, 3: 10_265 };
const FACTORY_BASE_DAILY: Record<Exclude<Recipe, "all">, number> = {
  gold: 10_000,
  battle_record: 8_000,
  originium: 24,
};

export type ManualEvaluationWarning = {
  code: "unknown-operator" | "unsupported-rule" | "ambiguous-recipe";
  roomId?: string;
  operator?: string;
  message: string;
};

export type ManualRoomEvaluation = {
  roomId: string;
  members: string[];
  baseEfficiency: number;
  skillEfficiency: number;
  globalEfficiency: number;
  totalEfficiency: number;
  orderMultiplier: number;
  finalEfficiency: number;
  dailyOutput: number | null;
  outputKind?: "lmd" | "pure_gold" | "battle_records" | "originium_shards" | "power";
};

export type ManualScheduleEvaluation = {
  rotation: RotationJson;
  maa?: MaaJson;
  layout?: BaseBlueprint;
  roomsByShift: ManualRoomEvaluation[][];
  warnings: ManualEvaluationWarning[];
  elapsedMs: number;
};

function rounded(value: number): number {
  return Math.round(value * 1_000) / 1_000;
}

function roomEvaluation(input: {
  roomId: string;
  facility: Facility;
  recipe: Recipe;
  level: number;
  operatorNames: readonly string[];
  manualSkillEfficiencyPct?: number;
  warnings: ManualEvaluationWarning[];
}): ManualRoomEvaluation {
  const { roomId, facility, recipe, level, operatorNames, manualSkillEfficiencyPct } = input;
  const resolution = facility === "trade"
    ? resolveManualTradeRoom({ activeMemberCount: operatorNames.length, manualSkillEfficiencyPct })
    : facility === "manufacture"
      ? resolveManualManufactureRoom({ activeMemberCount: operatorNames.length, manualSkillEfficiencyPct })
      : resolveManualPowerRoom({ manualSkillEfficiencyPct });
  const total = resolution.totalEfficiency;
  const orderMultiplier = resolution.orderMultiplier;
  const final = resolution.finalEfficiency;
  const dailyOutput = facility === "trade"
    ? (recipe === "originium" ? 240 : (TRADE_BASE_DAILY[level] ?? TRADE_BASE_DAILY[3])) * final
    : facility === "manufacture" && recipe !== "all"
      ? FACTORY_BASE_DAILY[recipe] * final
      : null;
  const outputKind = facility === "trade"
    ? (recipe === "originium" ? "originium_shards" : "lmd")
    : recipe === "gold"
      ? "pure_gold"
      : recipe === "battle_record"
        ? "battle_records"
        : recipe === "originium"
          ? "originium_shards"
          : facility === "power" ? "power" : undefined;

  return {
    roomId,
    members: [...operatorNames],
    baseEfficiency: resolution.baseEfficiency,
    skillEfficiency: resolution.skillEfficiency,
    globalEfficiency: resolution.globalEfficiency,
    totalEfficiency: total,
    orderMultiplier,
    finalEfficiency: final,
    dailyOutput: dailyOutput === null ? null : rounded(dailyOutput),
    outputKind,
  };
}

function lineForEvaluation(room: ManualRoomEvaluation, facility: Facility): RotationRoomLine {
  const line: RotationRoomLine = {
    room_id: room.roomId,
    ...(facility === "power" ? {} : { base_efficiency: room.baseEfficiency }),
    equivalent_efficiency: room.skillEfficiency,
    global_efficiency: room.globalEfficiency,
    total_efficiency: room.totalEfficiency,
    final_efficiency: room.finalEfficiency,
    order_multiplier: room.orderMultiplier,
  };
  if (facility === "trade") {
    line.trade_score = room.finalEfficiency;
    line.trade_skill_pct = room.skillEfficiency * 100;
    line.trade_display_pct = (room.skillEfficiency + room.globalEfficiency) * 100;
  } else if (facility === "manufacture") {
    line.manu_score = room.finalEfficiency * 100;
    line.manu_prod_skill = room.skillEfficiency * 100;
    line.manu_display_pct = (room.skillEfficiency + room.globalEfficiency) * 100;
  } else {
    line.power_score = room.finalEfficiency;
    line.power_skill_pct = room.skillEfficiency * 100;
    line.power_display_pct = room.skillEfficiency * 100;
    line.power_charge_speed_pct = room.skillEfficiency * 100;
  }
  return line;
}

export function evaluateManualSchedule(input: {
  draft: ManualScheduleDraft;
  layout: BaseBlueprint;
}): ManualScheduleEvaluation {
  const startedAt = performance.now();
  const warnings: ManualEvaluationWarning[] = [];
  const shiftTotals: Array<{ trade: number; manufacture: number; power: number; production: Record<string, number> }> = [];
  const roomsByShift: ManualRoomEvaluation[][] = [];

  const shifts: RotationShift[] = input.draft.shifts.map((shift, index) => {
    const rooms: ManualRoomEvaluation[] = [];
    const lines: RotationRoomLine[] = [];
    let trade = 0;
    let manufacture = 0;
    let power = 0;
    const production: Record<string, number> = { lmd: 0, pure_gold: 0, battle_records: 0, originium_shards: 0, orundum: 0, equivalent_gold: 0 };

    for (const room of input.layout.rooms) {
      if (room.kind !== "trade_post" && room.kind !== "factory" && room.kind !== "power_plant") continue;
      const assignment = shift.rooms[room.id];
      const operatorNames = (assignment?.operators ?? [])
        .slice(0, manualRoomCapacity(room))
        .filter((name): name is string => Boolean(name));
      const facility: Facility = room.kind === "trade_post" ? "trade" : room.kind === "factory" ? "manufacture" : "power";
      const recipe: Recipe = room.kind === "trade_post"
        ? tradeOrderFor(room)
        : room.kind === "factory"
          ? factoryRecipeFor(room)
          : "all";
      if (recipe === "all" && room.kind === "factory") {
        warnings.push({ code: "ambiguous-recipe", roomId: room.id, message: `${room.id} 的制造配方为“由求解器选择”，无法计算日产量。` });
      }
      const evaluation = roomEvaluation({
        roomId: room.id,
        facility,
        recipe,
        level: room.level,
        operatorNames,
        manualSkillEfficiencyPct: assignment?.manualSkillEfficiencyPct,
        warnings,
      });
      rooms.push(evaluation);
      lines.push(lineForEvaluation(evaluation, facility));
      if (facility === "trade") trade += evaluation.finalEfficiency;
      if (facility === "manufacture") manufacture += evaluation.finalEfficiency;
      if (facility === "power") power += evaluation.finalEfficiency - 1;
      if (evaluation.dailyOutput !== null && evaluation.outputKind && evaluation.outputKind !== "power") {
        production[evaluation.outputKind] += evaluation.dailyOutput;
      }
    }

    roomsByShift.push(rooms);
    shiftTotals.push({ trade, manufacture, power: power > 0 ? 1 + power : 0, production });
    return {
      index,
      duration_hours: shift.durationHours,
      active_teams: [],
      resting_team: "",
      scores: { trade_score: rounded(trade), manu_prod_sum: rounded(manufacture), power_charge_sum: rounded(power > 0 ? 1 + power : 0), room_lines: lines },
      weighted_trade: 0,
      weighted_manu: 0,
      weighted_power: 0,
    };
  });

  const totalHours = input.draft.shifts.reduce((sum, shift) => sum + shift.durationHours, 0) || 24;
  const weighted = (pick: (item: (typeof shiftTotals)[number]) => number) => rounded(
    shiftTotals.reduce((sum, item, index) => sum + pick(item) * input.draft.shifts[index]!.durationHours, 0) / totalHours,
  );
  const production = Object.fromEntries(Object.keys(shiftTotals[0]?.production ?? {}).map((key) => [key, weighted((item) => item.production[key] ?? 0)])) as {
    lmd: number; pure_gold: number; battle_records: number; originium_shards: number; orundum: number; equivalent_gold: number;
  };
  for (const shift of shifts) {
    const durationWeight = shift.duration_hours / totalHours;
    const totals = shiftTotals[shift.index]!;
    shift.weighted_trade = rounded(totals.trade * durationWeight);
    shift.weighted_manu = rounded(totals.manufacture * durationWeight);
    shift.weighted_power = rounded(totals.power * durationWeight);
  }

  warnings.push({
    code: "unsupported-rule",
    message: "当前本地评估只按手填纸面技能效率和基础房间结算；未填写的纸面技能效率按 0 计算。中枢、跨设施投影、动态制造、订单倍率及特殊贸易组合尚未结算。",
  });

  return {
    rotation: {
      profile: "abc_12_12_12",
      shifts,
      daily: {
        trade: weighted((item) => item.trade),
        manufacture: weighted((item) => item.manufacture),
        power: weighted((item) => item.power),
        production,
      },
    },
    roomsByShift,
    warnings,
    elapsedMs: performance.now() - startedAt,
  };
}
