import type { MaaJson, OperBoxEntry } from "./types.ts";

export type JobOperatorComparison = {
  name: string;
  required: number;
  available: number;
  missing: number;
};

function operatorName(value: string | { name?: string } | null): string {
  return typeof value === "string" ? value.trim() : value?.name?.trim() ?? "";
}

export function maaOperatorRequirements(maa: MaaJson): Map<string, number> {
  const requirements = new Map<string, number>();
  for (const plan of maa.plans) {
    for (const rooms of Object.values(plan.rooms)) {
      for (const room of rooms ?? []) {
        for (const operator of room.operators ?? []) {
          const name = operatorName(operator);
          if (name) requirements.set(name, (requirements.get(name) ?? 0) + 1);
        }
      }
    }
  }
  return requirements;
}

export function compareMaaWithBox(maa: MaaJson, operbox: readonly OperBoxEntry[]): JobOperatorComparison[] {
  const available = new Map<string, number>();
  for (const operator of operbox) {
    if (operator.own) available.set(operator.name, (available.get(operator.name) ?? 0) + 1);
  }
  return [...maaOperatorRequirements(maa).entries()]
    .map(([name, required]) => ({
      name,
      required,
      available: available.get(name) ?? 0,
      missing: Math.max(0, required - (available.get(name) ?? 0)),
    }))
    .sort((left, right) => right.missing - left.missing || right.required - left.required || left.name.localeCompare(right.name, "zh-CN"));
}
