export type ManualRoomEfficiencyResolution = {
  baseEfficiency: number;
  skillEfficiency: number;
  globalEfficiency: number;
  orderMultiplier: number;
  totalEfficiency: number;
  finalEfficiency: number;
  goldEquivalentEfficiency: number;
};

function rounded(value: number): number {
  return Math.round(value * 1_000) / 1_000;
}

function paperSkill(value: number | undefined): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, value) / 100 : 0;
}

export function resolveManualTradeRoom(input: {
  activeMemberCount: number;
  manualSkillEfficiencyPct?: number;
}): ManualRoomEfficiencyResolution {
  const baseEfficiency = 1 + Math.max(0, input.activeMemberCount) / 100;
  const skillEfficiency = paperSkill(input.manualSkillEfficiencyPct);
  const globalEfficiency = 0;
  const orderMultiplier = 1;
  const totalEfficiency = rounded(baseEfficiency + skillEfficiency + globalEfficiency);
  return {
    baseEfficiency,
    skillEfficiency,
    globalEfficiency,
    orderMultiplier,
    totalEfficiency,
    finalEfficiency: rounded(totalEfficiency * orderMultiplier),
    goldEquivalentEfficiency: 0,
  };
}

export function resolveManualManufactureRoom(input: {
  activeMemberCount: number;
  manualSkillEfficiencyPct?: number;
}): ManualRoomEfficiencyResolution {
  const baseEfficiency = 1 + Math.max(0, input.activeMemberCount) / 100;
  const skillEfficiency = paperSkill(input.manualSkillEfficiencyPct);
  const globalEfficiency = 0;
  const totalEfficiency = rounded(baseEfficiency + skillEfficiency + globalEfficiency);
  return {
    baseEfficiency,
    skillEfficiency,
    globalEfficiency,
    orderMultiplier: 1,
    totalEfficiency,
    finalEfficiency: totalEfficiency,
    goldEquivalentEfficiency: 0,
  };
}

export function resolveManualPowerRoom(input: {
  manualSkillEfficiencyPct?: number;
}): ManualRoomEfficiencyResolution {
  const skillEfficiency = paperSkill(input.manualSkillEfficiencyPct);
  return {
    baseEfficiency: 0,
    skillEfficiency,
    globalEfficiency: 0,
    orderMultiplier: 1,
    totalEfficiency: rounded(skillEfficiency),
    finalEfficiency: rounded(skillEfficiency),
    goldEquivalentEfficiency: 0,
  };
}
