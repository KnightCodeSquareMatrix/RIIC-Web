import type {
  SklandInfrastructureRoom,
  SklandManufactureRoom,
  SklandStatusSnapshot,
  SklandTradingRoom,
} from "./types.ts";

export type SklandMetricTone = "blue" | "green" | "amber" | "orange";
export type SklandMetricVisual = "rest" | "trading" | "manufacture" | "clue";

export interface SklandStatusMetric {
  id: string;
  label: string;
  value: string;
  total: string | null;
  hint: string;
  tone: SklandMetricTone;
  visual: SklandMetricVisual;
}

export function formatDashboardDuration(seconds: number): string {
  const safe = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
  if (safe <= 0) return "已完成";
  if (safe < 60) return "不足1分钟";
  const days = Math.floor(safe / 86_400);
  const hours = Math.floor((safe % 86_400) / 3_600);
  const minutes = Math.floor((safe % 3_600) / 60);
  if (days > 0) return `${days}天${hours}小时`;
  if (hours > 0) return `${hours}小时${minutes}分钟`;
  return `${Math.max(1, minutes)}分钟`;
}

function until(timestamp: number | null | undefined, now: number, fallback: string): string {
  if (!timestamp || timestamp <= 0) return fallback;
  return formatDashboardDuration(timestamp - now);
}

function sumProduction(
  rooms: SklandInfrastructureRoom[],
  group: "trading" | "manufacture"
): { current: number; total: number | null } {
  const matching = rooms.filter((room): room is SklandTradingRoom | SklandManufactureRoom => room.group === group);
  if (group === "trading") {
    return {
      current: matching.reduce((total, room) => total + (room.production.stock ?? 0), 0),
      total: matching.reduce((total, room) => total + (room.production.capacity ?? 0), 0),
    };
  }
  const knownCapacities = matching.flatMap((room) => (
    room.production.unitCapacity === null ? [] : [room.production.unitCapacity]
  ));
  return {
    current: matching.reduce((total, room) => total + (room.production.completed ?? 0), 0),
    total: knownCapacities.length === matching.length
      ? knownCapacities.reduce((total, capacity) => total + capacity, 0)
      : null,
  };
}

function fractionMetric(
  id: string,
  label: string,
  current: number,
  total: number | null,
  hint: string,
  tone: SklandMetricTone,
  visual: SklandMetricVisual
): SklandStatusMetric {
  return { id, label, value: String(current), total: total === null ? "—" : String(total), hint, tone, visual };
}

export function deriveSklandBuildingMetrics(snapshot: SklandStatusSnapshot, now: number): SklandStatusMetric[] {
  const { infrastructure } = snapshot;
  const trading = sumProduction(infrastructure.rooms, "trading");
  const manufacture = sumProduction(infrastructure.rooms, "manufacture");
  const dormOperators = infrastructure.rooms
    .filter((room) => room.group === "dormitory")
    .flatMap((room) => room.operators);
  const restedOperators = dormOperators.filter((operator) => operator.morale >= 24).length;
  const meeting = infrastructure.rooms.find((room) => room.group === "meeting");
  const clueCount = meeting?.group === "meeting" ? meeting.clue.board.length : 0;
  const sharingClues = meeting?.group === "meeting" && meeting.clue.sharing;

  return [
    fractionMetric(
      "rest",
      "休息进度",
      restedOperators,
      dormOperators.length,
      dormOperators.length ? `${dormOperators.length - restedOperators} 名干员仍在休息` : "当前宿舍无人休息",
      "green",
      "rest"
    ),
    fractionMetric("trading", "订单进度", trading.current, trading.total, "贸易站订单库存", "blue", "trading"),
    fractionMetric(
      "manufacture",
      "制造进度",
      manufacture.current,
      manufacture.total,
      manufacture.total === null ? "部分制造配方容量未知" : "制造站已完成产物",
      "amber",
      "manufacture"
    ),
    {
      id: "clue",
      label: "线索收集",
      value: sharingClues ? "交流中" : String(clueCount),
      total: sharingClues ? null : "7",
      hint: sharingClues
        ? `${until(meeting?.group === "meeting" ? meeting.clue.shareCompleteTime : null, now, "交流进行中")}后结束交流`
        : meeting ? `当前已布置 ${clueCount} 条线索` : "会客室数据未提供",
      tone: "orange",
      visual: "clue",
    },
  ];
}
