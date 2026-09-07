import type { BaseBlueprint, MaaJson, MaaPlan, MaaRoom, RotationJson, RotationShift } from "@/types";

/** 每 1.0 生产效率、连续工作 24 小时的产出。 */
export type DroneTradeTarget =
  | { kind: "normal"; level: 1 | 2 | 3 }
  | { kind: "dantshu"; level: 1 | 2 | 3 }
  | { kind: "tequila" }
  | { kind: "closure" };

export type DroneProduction = {
  /** 该班次发电站实际生产的无人机数量。 */
  drones: number;
  /** 将全部无人机投入目标房间时，相当于增加的工作效率。 */
  equivalentEfficiency: number;
};

export type DroneTradeOutput = {
  /** 贸易站的主产物（普通/但书为龙门币，特殊站也仍是龙门币）。 */
  lmd: number;
  /** 特殊贸易站随订单额外产生的赤金价值（已按每枚 500 换算）。 */
  goldValue: number;
};

export type DroneRoomTarget = {
  room: "trading" | "manufacture";
  /** MAA 房间序号，从 1 开始。 */
  index: number;
  roomId: string;
  product: "lmd" | "gold" | "experience";
};

export type DroneShiftAllocation = {
  shiftIndex: number;
  target: DroneRoomTarget;
  drones: number;
  equivalentEfficiency: number;
  lmd: number;
  goldValue: number;
  experience: number;
};

export type DroneDailyProduction = {
  lmd: number;
  pure_gold: number;
  battle_records: number;
};

/**
 * 将贸易站的 `gold_equivalent_efficiency` 汇总为每日等效赤金价值。
 * 每班先按自身时长计算，再按整个轮换周期折算至 24 小时。
 */
export function equivalentGoldForRotation(rotation: RotationJson): number {
  const totalHours = rotation.shifts.reduce(
    (sum, shift) => sum + (positive(shift.duration_hours) ? shift.duration_hours : 0),
    0,
  );
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

const NORMAL_TRADE_DAILY: Record<1 | 2 | 3, number> = {
  1: 10_000,
  2: 10_141,
  3: 10_265,
};

const DANTSHU_DAILY: Record<1 | 2 | 3, number> = {
  1: 20_000,
  2: 18_591.55,
  3: 15_929.2,
};

const SPECIAL_TRADE_DAILY: Record<"tequila" | "closure", { lmd: number; gold: number }> = {
  tequila: { lmd: 12_739.73, gold: 2_328.77 },
  closure: { lmd: 12_000, gold: 2_000 },
};

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function positive(value: unknown): value is number {
  return finite(value) && value >= 0;
}

/**
 * 计算一个轮班的发电效率。
 *
 * 发电站总效率 = 全部发电站基础效率 1
 *   + 每个有工作的发电站干员 0.05
 *   + 各发电站 equivalent_efficiency 之和。
 *
 * `working` 由调用方根据 MAA 进驻情况和 solver 效率字段确定；本模块不
 * 猜测干员是否红脸，也不读取未经白名单过滤的 solver 字段。
 */
export function powerEfficiencyForShift(input: {
  powerStations: Array<{ equivalentEfficiency: number; working: boolean }>;
}): number {
  return 1 + input.powerStations.reduce(
    (sum, station) => sum + (station.working ? 0.05 : 0) + (positive(station.equivalentEfficiency) ? station.equivalentEfficiency : 0),
    0,
  );
}

/**
 * 发电效率 / 6 × 工作分钟得到无人机数量；无人机 / 480 是等效效率。
 */
export function droneProductionForShift(input: {
  powerStations: Array<{ equivalentEfficiency: number; working: boolean }>;
  durationHours: number;
}): DroneProduction {
  const durationHours = positive(input.durationHours) ? input.durationHours : 0;
  const powerEfficiency = powerEfficiencyForShift(input);
  const drones = powerEfficiency / 6 * durationHours * 60;
  return {
    drones,
    equivalentEfficiency: drones / 480,
  };
}

export function droneTradeOutputForEfficiency(
  target: DroneTradeTarget,
  equivalentEfficiency: number,
): DroneTradeOutput {
  const efficiency = positive(equivalentEfficiency) ? equivalentEfficiency : 0;
  if (target.kind === "normal") {
    return { lmd: efficiency * NORMAL_TRADE_DAILY[target.level], goldValue: 0 };
  }
  if (target.kind === "dantshu") {
    return { lmd: efficiency * DANTSHU_DAILY[target.level], goldValue: 0 };
  }
  const base = SPECIAL_TRADE_DAILY[target.kind];
  return { lmd: efficiency * base.lmd, goldValue: efficiency * base.gold };
}

/** 将一班发电效率直接换算成目标贸易站的无人机产出。 */
export function droneTradeOutputForShift(input: {
  powerStations: Array<{ equivalentEfficiency: number; working: boolean }>;
  durationHours: number;
  target: DroneTradeTarget;
}): DroneTradeOutput & DroneProduction {
  const production = droneProductionForShift(input);
  return {
    ...production,
    ...droneTradeOutputForEfficiency(input.target, production.equivalentEfficiency),
  };
}

/**
 * 后续接入响应变换时使用的最小数据入口：布局提供发电站数量，rotation
 * 提供每个房间的 equivalent_efficiency。当前只做数据提取，不选择目标房间。
 */
export function powerStationsFromRotation(
  layout: BaseBlueprint,
  shift: RotationShift,
  plan?: MaaPlan,
): Array<{ roomId: string; equivalentEfficiency: number; working: boolean }> {
  const powerRooms = layout.rooms.filter((room) => room.kind === "power_plant");
  return powerRooms.map((room) => {
    const line = shift.scores.room_lines.find((candidate) => candidate.room_id === room.id);
    const occupant = plan?.rooms.power?.[powerRooms.indexOf(room)]?.operators ?? [];
    return {
      roomId: room.id,
      equivalentEfficiency: finite(line?.equivalent_efficiency) ? line.equivalent_efficiency : 0,
      working: occupant.some((operator) => operator !== null)
        && finite(line?.equivalent_efficiency)
        && line.equivalent_efficiency > 0,
    };
  });
}

function operatorName(operator: NonNullable<MaaPlan["rooms"]["trading"]>[number]["operators"][number]): string {
  return typeof operator === "string" ? operator : operator?.name ?? "";
}

function tradeTargetForRoom(level: number, operators: MaaRoom["operators"]): DroneTradeTarget {
  const names = Array.isArray(operators) ? operators.map((operator) => operatorName(operator)).filter(Boolean) : [];
  const normalizedLevel = level === 1 || level === 2 ? level : 3;
  if (names.includes("但书")) return { kind: "dantshu", level: normalizedLevel };
  if (names.includes("龙舌兰")) return { kind: "tequila" };
  if (names.includes("可露希尔")) return { kind: "closure" };
  return { kind: "normal", level: normalizedLevel };
}

function bestTradeRoom(layout: BaseBlueprint, plan: MaaPlan): { target: DroneRoomTarget; profile: DroneTradeTarget } | null {
  const rooms = layout.rooms.filter((room) => room.kind === "trade_post");
  const priorities: Record<DroneTradeTarget["kind"], number> = { dantshu: 4, tequila: 3, closure: 2, normal: 1 };
  return rooms.map((room, index) => {
    const maaRoom = plan.rooms.trading?.[index];
    const profile = tradeTargetForRoom(room.level, maaRoom?.operators ?? []);
    return {
      target: { room: "trading" as const, index: index + 1, roomId: room.id, product: "lmd" as const },
      profile,
      priority: priorities[profile.kind],
      level: room.level,
    };
  }).sort((left, right) => right.priority - left.priority || right.level - left.level)[0] ?? null;
}

function bestFactoryRoom(layout: BaseBlueprint, plan: MaaPlan, product: "gold" | "experience"): DroneRoomTarget | null {
  const rooms = layout.rooms.filter((room) => room.kind === "factory");
  const wanted = product === "gold"
    ? new Set(["Gold", "Pure Gold", "gold", "贵金属"])
    : new Set(["Battle Record", "battle_record", "作战记录"]);
  return rooms.map((room, index) => ({ room, index, maa: plan.rooms.manufacture?.[index] }))
    .filter(({ room, maa }) => wanted.has(maa?.product ?? "") || (
      room.product && "factory" in room.product
      && room.product.factory.recipe === (product === "gold" ? "gold" : "battle_record")
    ))
    .sort((left, right) => right.room.level - left.room.level)
    .map(({ room, index }) => ({ room: "manufacture" as const, index: index + 1, roomId: room.id, product }))[0] ?? null;
}

function allocationForTarget(
  shift: RotationShift,
  powerStations: Array<{ equivalentEfficiency: number; working: boolean }>,
  target: DroneRoomTarget,
  tradeProfile?: DroneTradeTarget,
): DroneShiftAllocation {
  const production = droneProductionForShift({ powerStations, durationHours: shift.duration_hours });
  if (target.product === "lmd" && tradeProfile) {
    const output = droneTradeOutputForEfficiency(tradeProfile, production.equivalentEfficiency);
    return { shiftIndex: shift.index, target, ...production, ...output, experience: 0 };
  }
  return {
    shiftIndex: shift.index,
    target,
    ...production,
    lmd: 0,
    goldValue: target.product === "gold" ? production.equivalentEfficiency * 10_000 : 0,
    experience: target.product === "experience" ? production.equivalentEfficiency * 8_000 : 0,
  };
}

/**
 * 为每个班次选择一个无人机目标。
 *
 * 153 固定选择经验制造站，缺少经验站时回退贸易站。其他布局在贸易与
 * 赤金之间枚举全部组合，最小化“龙门币 - (赤金价值 + 5000)”的绝对值；
 * 差距相同时优先让龙门币不低于赤金。
 */
export function chooseDroneAllocations(input: {
  layout: BaseBlueprint;
  plans: MaaPlan[];
  shifts: RotationShift[];
  dailyProduction: { lmd: number; pure_gold: number };
}): DroneShiftAllocation[] {
  const candidates = input.shifts.map((shift, position) => {
    const plan = input.plans[shift.index] ?? input.plans[position];
    if (!plan) return [];
    const powerStations = powerStationsFromRotation(input.layout, shift, plan);
    const trade = bestTradeRoom(input.layout, plan);
    const gold = bestFactoryRoom(input.layout, plan, "gold");
    const experience = bestFactoryRoom(input.layout, plan, "experience");
    if (input.layout.template === "153") {
      if (experience) return [allocationForTarget(shift, powerStations, experience)];
      if (trade) return [allocationForTarget(shift, powerStations, trade.target, trade.profile)];
      return [];
    }
    return [
      ...(trade ? [allocationForTarget(shift, powerStations, trade.target, trade.profile)] : []),
      ...(gold ? [allocationForTarget(shift, powerStations, gold)] : []),
    ];
  });
  if (candidates.some((options) => options.length === 0)) return [];
  if (input.layout.template === "153") return candidates.map(([only]) => only);

  const totalHours = input.shifts.reduce((sum, shift) => sum + Math.max(0, shift.duration_hours), 0);
  const dailyScale = totalHours > 0 ? 24 / totalHours : 1;
  let bestAllocations: DroneShiftAllocation[] = [];
  let bestDistance = Number.POSITIVE_INFINITY;
  let bestLmdNotLower = false;
  const visit = (position: number, allocations: DroneShiftAllocation[]) => {
    if (position < candidates.length) {
      for (const candidate of candidates[position]) visit(position + 1, [...allocations, candidate]);
      return;
    }
    const lmd = input.dailyProduction.lmd + allocations.reduce((sum, item) => sum + item.lmd, 0) * dailyScale;
    const gold = input.dailyProduction.pure_gold + 5_000
      + allocations.reduce((sum, item) => sum + item.goldValue, 0) * dailyScale;
    const balance = lmd - gold;
    const distance = Math.abs(balance);
    const lmdNotLower = balance >= 0;
    if (distance < bestDistance - 1e-9
      || (Math.abs(distance - bestDistance) <= 1e-9 && lmdNotLower && !bestLmdNotLower)) {
      bestAllocations = allocations;
      bestDistance = distance;
      bestLmdNotLower = lmdNotLower;
    }
  };
  visit(0, []);
  return bestAllocations;
}

/** 返回一份写入了逐班无人机目标的 MAA 副本，不修改 solver 原始对象。 */
export function applyDroneAllocationsToMaa(input: {
  layout: BaseBlueprint;
  maa: MaaJson;
  rotation: RotationJson;
}): MaaJson {
  const production = input.rotation.daily.production;
  if (!production) return structuredClone(input.maa);
  const maa = structuredClone(input.maa);
  const allocations = chooseDroneAllocations({
    layout: input.layout,
    plans: maa.plans,
    shifts: input.rotation.shifts,
    dailyProduction: {
      lmd: production.lmd,
      pure_gold: production.pure_gold + (production.equivalent_gold ?? 0),
    },
  });
  for (const allocation of allocations) {
    const position = input.rotation.shifts.findIndex((shift) => shift.index === allocation.shiftIndex);
    const plan = maa.plans[allocation.shiftIndex] ?? maa.plans[position];
    if (!plan) continue;
    plan.drones = {
      ...plan.drones,
      enable: true,
      room: allocation.target.room,
      index: allocation.target.index,
      order: plan.drones?.order ?? "post",
    };
  }
  return maa;
}

/** 将各班次无人机产出按整个轮换周期归一化为 24 小时口径。 */
export function droneProductionForRotation(input: {
  layout: BaseBlueprint;
  maa: MaaJson;
  rotation: RotationJson;
}): DroneDailyProduction {
  const allocations = chooseDroneAllocations({
    layout: input.layout,
    plans: input.maa.plans,
    shifts: input.rotation.shifts,
    dailyProduction: {
      lmd: input.rotation.daily.production?.lmd ?? 0,
      pure_gold: (input.rotation.daily.production?.pure_gold ?? 0)
        + (input.rotation.daily.production?.equivalent_gold ?? 0),
    },
  });
  const totalHours = input.rotation.shifts.reduce((sum, shift) => sum + (positive(shift.duration_hours) ? shift.duration_hours : 0), 0);
  const scale = totalHours > 0 ? 24 / totalHours : 1;
  return {
    lmd: allocations.reduce((sum, item) => sum + item.lmd, 0) * scale,
    pure_gold: allocations.reduce((sum, item) => sum + item.goldValue, 0) * scale,
    battle_records: allocations.reduce((sum, item) => sum + item.experience, 0) * scale,
  };
}
