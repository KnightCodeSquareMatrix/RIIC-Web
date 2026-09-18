import type { BaseBlueprint, MaaJson, MaaPlan, MaaRoom, RotationJson, RotationShift } from "./types.ts";

export type PowerStationContribution = {
  equivalentEfficiency: number;
  working: boolean;
};

export type DroneDailyProduction = {
  lmd: number;
  pure_gold: number;
  battle_records: number;
};

type DroneTradeTarget =
  | { kind: "normal"; level: 1 | 2 | 3 }
  | { kind: "dantshu"; level: 1 | 2 | 3 }
  | { kind: "tequila" }
  | { kind: "closure" };

const NORMAL_TRADE_DAILY: Record<1 | 2 | 3, number> = { 1: 10_000, 2: 10_141, 3: 10_265 };
const DANTSHU_DAILY: Record<1 | 2 | 3, number> = { 1: 20_000, 2: 18_591.55, 3: 15_929.2 };
const SPECIAL_TRADE_DAILY = {
  tequila: { lmd: 12_739.73, gold: 2_328.77 },
  closure: { lmd: 12_000, gold: 2_000 },
};

function positive(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function operatorName(operator: MaaRoom["operators"][number]): string {
  return typeof operator === "string" ? operator : operator?.name ?? "";
}

function tradeTarget(level: number, operators: MaaRoom["operators"]): DroneTradeTarget {
  const names = operators.map(operatorName).filter(Boolean);
  const normalizedLevel = level === 1 || level === 2 ? level : 3;
  if (names.includes("但书")) return { kind: "dantshu", level: normalizedLevel };
  if (names.includes("龙舌兰")) return { kind: "tequila" };
  if (names.includes("可露希尔")) return { kind: "closure" };
  return { kind: "normal", level: normalizedLevel };
}

export function powerEfficiencyForShift(powerStations: readonly PowerStationContribution[]): number {
  return 1 + powerStations.reduce(
    (sum, station) => sum
      + (station.working ? 0.05 : 0)
      + (positive(station.equivalentEfficiency) ? station.equivalentEfficiency : 0),
    0,
  );
}

export function droneProductionForShift(input: {
  powerStations: readonly PowerStationContribution[];
  durationHours: number;
}): { drones: number; equivalentEfficiency: number } {
  const durationHours = positive(input.durationHours) ? input.durationHours : 0;
  const drones = powerEfficiencyForShift(input.powerStations) / 6 * durationHours * 60;
  return { drones, equivalentEfficiency: drones / 480 };
}

export function equivalentGoldForRotation(rotation: RotationJson): number {
  const totalHours = rotation.shifts.reduce((sum, shift) => sum + (positive(shift.duration_hours) ? shift.duration_hours : 0), 0);
  if (totalHours <= 0) return 0;
  const cycleValue = rotation.shifts.reduce((sum, shift) => {
    const efficiency = shift.scores.room_lines.reduce(
      (roomSum, line) => roomSum + (positive(line.gold_equivalent_efficiency) ? line.gold_equivalent_efficiency : 0),
      0,
    );
    return sum + efficiency * 10_000 * shift.duration_hours / 24;
  }, 0);
  return cycleValue * 24 / totalHours;
}

export function powerStationsFromRotation(layout: BaseBlueprint, shift: RotationShift, plan?: MaaPlan): PowerStationContribution[] {
  const powerRooms = layout.rooms.filter((room) => room.kind === "power_plant");
  return powerRooms.map((room, index) => {
    const line = shift.scores.room_lines.find((candidate) => candidate.room_id === room.id);
    const equivalentEfficiency = positive(line?.equivalent_efficiency) ? line.equivalent_efficiency : 0;
    const operators = plan?.rooms.power?.[index]?.operators ?? [];
    return { equivalentEfficiency, working: operators.some((operator) => operator !== null) && equivalentEfficiency > 0 };
  });
}

function tradeOutput(target: DroneTradeTarget, equivalentEfficiency: number): { lmd: number; gold: number } {
  if (target.kind === "normal") return { lmd: equivalentEfficiency * NORMAL_TRADE_DAILY[target.level], gold: 0 };
  if (target.kind === "dantshu") return { lmd: equivalentEfficiency * DANTSHU_DAILY[target.level], gold: 0 };
  const output = SPECIAL_TRADE_DAILY[target.kind];
  return { lmd: equivalentEfficiency * output.lmd, gold: equivalentEfficiency * output.gold };
}

function planForShift(maa: MaaJson, shift: RotationShift, position: number): MaaPlan | undefined {
  return maa.plans[shift.index] ?? maa.plans[position];
}

function factoryRecipe(room: MaaRoom | undefined): "gold" | "battle_record" | "originium" | null {
  const value = room?.product;
  if (["Gold", "Pure Gold", "gold", "贵金属"].includes(value ?? "")) return "gold";
  if (["Battle Record", "battle_record", "作战记录"].includes(value ?? "")) return "battle_record";
  if (["Originium Shard", "originium", "源石碎片"].includes(value ?? "")) return "originium";
  return null;
}

/** Calculates drone output for user-selected MAA targets without choosing or rewriting targets. */
export function droneProductionForSelectedMaaTargets(input: {
  layout: BaseBlueprint;
  maa: MaaJson;
  rotation: RotationJson;
}): DroneDailyProduction {
  const tradeRooms = input.layout.rooms.filter((room) => room.kind === "trade_post");
  const totalHours = input.rotation.shifts.reduce((sum, shift) => sum + (positive(shift.duration_hours) ? shift.duration_hours : 0), 0);
  const cycle = { lmd: 0, pure_gold: 0, battle_records: 0 };
  input.rotation.shifts.forEach((shift, position) => {
    const plan = planForShift(input.maa, shift, position);
    const drones = plan?.drones;
    if (!plan || !drones || drones.enable === false) return;
    const equivalent = droneProductionForShift({ powerStations: powerStationsFromRotation(input.layout, shift, plan), durationHours: shift.duration_hours }).equivalentEfficiency;
    if (drones.room === "trading") {
      const index = drones.index - 1;
      const room = tradeRooms[index];
      const maaRoom = plan.rooms.trading?.[index];
      if (!room || !maaRoom) return;
      const output = tradeOutput(tradeTarget(room.level, maaRoom.operators), equivalent);
      cycle.lmd += output.lmd;
      cycle.pure_gold += output.gold;
      return;
    }
    const index = drones.index - 1;
    const recipe = factoryRecipe(plan.rooms.manufacture?.[index]);
    if (recipe === "gold") cycle.pure_gold += equivalent * 10_000;
    if (recipe === "battle_record") cycle.battle_records += equivalent * 8_000;
    // RotationJson.daily.drone_production has no originium shard field; its estimate detail remains separate.
  });
  const scale = totalHours > 0 ? 24 / totalHours : 1;
  return { lmd: cycle.lmd * scale, pure_gold: cycle.pure_gold * scale, battle_records: cycle.battle_records * scale };
}
