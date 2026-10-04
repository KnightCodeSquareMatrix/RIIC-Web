/** Change pixel count, never authored fur/material settings. */
export function motionResolutionScale(frameMs: number, currentScale: number): number {
  if (!Number.isFinite(frameMs) || frameMs <= 0) return 1;
  const estimate = currentScale * Math.sqrt((1000 / 60) / frameMs);
  // Coarse steps and a bounded floor avoid resolution shimmer and tiny canvases.
  return Math.max(0.5, Math.min(1, Math.round(estimate * 20) / 20));
}
