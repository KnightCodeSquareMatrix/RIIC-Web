import type { FurSettings } from "./fur-settings.ts";

export type FurPerformanceMode = "auto" | "quality" | "balanced" | "saver" | "static";
export type FurPerformanceTier = Exclude<FurPerformanceMode, "auto">;

// Device preference is deliberately separate from exported persona appearances.
export const FUR_PERFORMANCE_STORAGE_KEY = "riic.plush.performance.v1";

export function normalizeFurPerformanceMode(input: unknown): FurPerformanceMode {
  return input === "quality" || input === "balanced" || input === "saver" || input === "static"
    ? input : "auto";
}

export function resolvePerformanceTier(mode: FurPerformanceMode, software: boolean): FurPerformanceTier {
  return mode === "auto" ? software ? "saver" : "quality" : mode;
}

/** Apply a device budget without mutating or renormalizing authored appearance. */
export function performanceSettings(settings: FurSettings, tier: FurPerformanceTier, gallery: boolean): FurSettings {
  if (tier === "quality" || tier === "static") return { ...settings };
  const saver = tier === "saver";
  return {
    ...settings,
    shells: Math.min(settings.shells, gallery ? saver ? 20 : 36 : saver ? 12 : 20),
    resolution: settings.resolution * (saver ? 0.5 : 0.75),
    fps: Math.min(settings.fps, saver ? 24 : 30),
  };
}
