export type GameReportDay = { experience: number; goldValue: number; lmd: number; orundum: number; orderCount?: number };
export type GameReportSource = "screenshot" | "manual";
export type GameReportRecord = {
  id: string;
  sourceType: GameReportSource;
  days: [GameReportDay, GameReportDay, GameReportDay];
  createdAt: string;
};

export const GAME_REPORT_KEYS = ["experience", "goldValue", "lmd", "orderCount", "orundum"] as const;
const LEGACY_REPORT_KEYS = ["experience", "goldValue", "lmd", "orundum"] as const;

export function parseGameReportDays(value: unknown, requireOrderCount = false): GameReportRecord["days"] | null {
  if (!Array.isArray(value) || value.length !== 3) return null;
  const days: GameReportDay[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    const item = raw as Record<string, unknown>;
    if (Object.keys(item).some((key) => !GAME_REPORT_KEYS.includes(key as typeof GAME_REPORT_KEYS[number]))) return null;
    if (LEGACY_REPORT_KEYS.some((key) => !Number.isSafeInteger(item[key]) || (item[key] as number) < 0 || (item[key] as number) > 99_999_999)) return null;
    if ((requireOrderCount || item.orderCount !== undefined)
      && (!Number.isSafeInteger(item.orderCount) || (item.orderCount as number) < 0 || (item.orderCount as number) > 99_999_999)) return null;
    days.push({ experience: item.experience as number, goldValue: item.goldValue as number, lmd: item.lmd as number,
      ...(item.orderCount !== undefined ? { orderCount: item.orderCount as number } : {}), orundum: item.orundum as number });
  }
  return days as GameReportRecord["days"];
}

export function gameReportAverage(days: GameReportRecord["days"]): GameReportDay {
  return Object.fromEntries(GAME_REPORT_KEYS.filter((key) => days.every((day) => day[key] !== undefined))
    .map((key) => [key, days.reduce((sum, day) => sum + day[key]!, 0) / 3])) as GameReportDay;
}
