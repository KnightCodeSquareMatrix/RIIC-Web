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

export function buildingSkillUnlockLabelEnglish(elite: number, level: number, enhanced = false): string {
  const requirement = elite === 0 && level === 1
    ? "Initial"
    : elite === 0
      ? `Level ${level}`
      : level === 1
        ? `Elite ${elite}`
        : `Elite ${elite} · Level ${level}`;
  return `${requirement} ${enhanced ? "upgrade" : "unlock"}`;
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

export const PROFESSION_LABELS_ENGLISH: Readonly<Record<number, string>> = {
  1: "Guard",
  2: "Sniper",
  3: "Defender",
  4: "Medic",
  5: "Supporter",
  6: "Caster",
  7: "Specialist",
  8: "Vanguard",
};

export function operatorProfessionLabelEnglishForCode(profession: number | undefined): string | undefined {
  return profession === undefined ? undefined : PROFESSION_LABELS_ENGLISH[profession];
}

export function operatorProfessionPresentationForCode(
  profession: number | undefined,
): { label: string; icon: string } | undefined {
  const label = profession === undefined ? undefined : PROFESSION_LABELS[profession];
  return label ? { label, icon: `/images/profession/${label}.webp` } : undefined;
}
