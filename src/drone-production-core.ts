export type PowerStationContribution = {
  equivalentEfficiency: number;
  working: boolean;
};

function positive(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
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
