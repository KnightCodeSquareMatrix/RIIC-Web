export const BUILDING_SKILL_ENHANCED_WORD = "提升";

export function buildingSkillUnlockPrefix(elite: number, level: number): string {
  if (elite === 0 && level === 1) return "初始";
  if (elite === 0) return `等级 ${level} `;
  if (level === 1) return `精英 ${elite} `;
  return `精英 ${elite} · 等级 ${level} `;
}

export function buildingSkillUnlockLabel(elite: number, level: number, enhanced = false): string {
  return `${buildingSkillUnlockPrefix(elite, level)}${enhanced ? BUILDING_SKILL_ENHANCED_WORD : "解锁"}`;
}

export const PROFESSION_LABELS: Readonly<Record<number, string>> = {
  1: "近卫",
  2: "狙击",
  3: "重装",
  4: "医疗",
  5: "辅助",
  6: "术师",
  7: "特种",
  8: "先锋",
};

export function operatorProfessionPresentationForCode(
  profession: number | undefined,
): { label: string; icon: string } | undefined {
  const label = profession === undefined ? undefined : PROFESSION_LABELS[profession];
  return label ? { label, icon: `/images/profession/${label}.webp` } : undefined;
}
