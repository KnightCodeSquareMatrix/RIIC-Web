export type ManualTradeMember = {
  id?: string;
  name: string;
  elite?: number;
};

export type SpecialTradeOutput = {
  orderMultiplier: number;
  goldUnitOutputPerDay: number;
};

const NORMAL_TRADE_OUTPUT: Record<1 | 2 | 3, number> = {
  1: 10_000,
  2: 10_141,
  3: 10_265,
};

const NAMES = {
  docus: "但书",
  closure: "可露希尔",
  shamare: "巫恋",
  tequila: "龙舌兰",
} as const;

const IDS = {
  docus: "char_4032_provs",
  closure: "char_4228_closur",
  shamare: "char_254_vodfox",
  tequila: "char_486_takila",
  tailor: new Set([
    "char_252_bibeak",
    "char_214_kafka",
    "char_4071_peper",
    "char_499_kaitou",
  ]),
};

const DOCUS_OUTPUT: Record<"e2" | "low", Record<1 | 2 | 3, number>> = {
  e2: { 1: 20_000, 2: 18_591.55, 3: 15_929.2 },
  low: { 1: 15_000, 2: 14_366.197, 3: 13_097.345 },
};

const WITCH_TEQUILA_OUTPUT = {
  up: {
    beta: { trade: 12_739.73, gold: 2_328.77 },
    alpha: { trade: 12_288.8, gold: 1_915.521 },
    plain: { trade: 12_030.46, gold: 1_675.127 },
  },
  low: {
    beta: { trade: 11_575.34, gold: 1_164.384 },
    alpha: { trade: 11_331.04, gold: 957.76 },
    plain: { trade: 11_192.89, gold: 837.5635 },
  },
} as const;

function roundBasis(value: number): number {
  return Math.round(value * 1_000);
}

function multiplierFromOutput(outputPerDay: number, level: 1 | 2 | 3): number {
  return roundBasis(outputPerDay / NORMAL_TRADE_OUTPUT[level]) / 1_000;
}

function isMember(member: ManualTradeMember, id: string, name: string): boolean {
  return member.id === id || member.name === name;
}

export function resolveManualSpecialTradeOutput(input: {
  level: number;
  order: "gold" | "originium";
  members: readonly ManualTradeMember[];
}): SpecialTradeOutput {
  if (input.order !== "gold" || input.level < 1 || input.level > 3) {
    return { orderMultiplier: 1, goldUnitOutputPerDay: 0 };
  }
  const level = input.level as 1 | 2 | 3;
  const docus = input.members.find((member) => isMember(member, IDS.docus, NAMES.docus));
  if (docus) {
    const output = DOCUS_OUTPUT[(docus.elite ?? 0) >= 2 ? "e2" : "low"][level];
    return { orderMultiplier: multiplierFromOutput(output, level), goldUnitOutputPerDay: 0 };
  }

  const closure = input.members.find((member) => isMember(member, IDS.closure, NAMES.closure));
  if (closure && (closure.elite ?? 0) >= 2) {
    return { orderMultiplier: multiplierFromOutput(12_000, level), goldUnitOutputPerDay: 2_000 };
  }

  if (level !== 3) return { orderMultiplier: 1, goldUnitOutputPerDay: 0 };
  const shamare = input.members.find((member) => isMember(member, IDS.shamare, NAMES.shamare));
  const tequila = input.members.find((member) => isMember(member, IDS.tequila, NAMES.tequila));
  if (!shamare || (shamare.elite ?? 0) < 2 || !tequila) {
    return { orderMultiplier: 1, goldUnitOutputPerDay: 0 };
  }

  let tailor: "plain" | "alpha" | "beta" = "plain";
  for (const member of input.members) {
    if (!IDS.tailor.has(member.id ?? "")) continue;
    tailor = (member.elite ?? 0) >= 2 ? "beta" : tailor === "beta" ? "beta" : "alpha";
  }
  const tier = (tequila.elite ?? 0) >= 2 ? "up" : "low";
  const output = WITCH_TEQUILA_OUTPUT[tier][tailor];
  return {
    orderMultiplier: multiplierFromOutput(output.trade, level),
    goldUnitOutputPerDay: output.gold,
  };
}

export function resolveGoldEquivalentEfficiency(totalEfficiency: number, goldUnitOutputPerDay: number): number {
  if (!Number.isFinite(totalEfficiency) || !Number.isFinite(goldUnitOutputPerDay) || totalEfficiency <= 0 || goldUnitOutputPerDay <= 0) return 0;
  const goldMultiplier = roundBasis(goldUnitOutputPerDay / 10_000);
  return Math.round(totalEfficiency * goldMultiplier) / 1_000;
}
