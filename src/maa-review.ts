import { manualLevelFor, maxEliteForRarity } from './manual-operbox.ts';

export type MaaChoice = { label: string; elite: number; level: number; own: boolean };
export type MaaIssue = { index: number; name: string; rarity: number; elite: number; level: number; choices: MaaChoice[] };
export function inspectMaaProgress(value: unknown): MaaIssue[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((row, index) => {
    if (!row || typeof row !== 'object' || row.own !== true) return [];
    const rarity = Number(row.rarity), elite = Number(row.elite), level = Number(row.level);
    if (!Number.isInteger(rarity) || rarity < 1 || rarity > 6) return [];
    const maxElite = maxEliteForRarity(rarity);
    if (Number.isInteger(elite) && elite >= 0 && elite <= maxElite && Number.isInteger(level) && level >= 1 && level <= manualLevelFor(rarity, elite)) return [];
    const choices: MaaChoice[] = [{ label: '未拥有', own: false, elite: 0, level: 1 }];
    if (rarity <= 2) choices.push({ label: '精0 非30级', own: true, elite: 0, level: 1 });
    for (let stage = 0; stage <= maxElite; stage++) {
      const cap = manualLevelFor(rarity, stage);
      const label = rarity <= 2 ? (stage === 0 ? "精0 30级" : "精0 非30级") : `精${stage}`;
      choices.push({ label, own: true, elite: stage, level: rarity <= 2 && stage === 0 ? cap : 1 });
    }
    if (Number.isInteger(level) && level >= 1 && level <= 90) {
      const inferred = Array.from({ length: maxElite + 1 }, (_, stage) => stage).find(stage => level <= manualLevelFor(rarity, stage));
      if (inferred !== undefined && inferred > elite && rarity >= 3) choices.splice(1, 0, { label: `精${inferred}（可能漏识别精英图标）`, own: true, elite: inferred, level: manualLevelFor(rarity, inferred) });
    }
    return [{ index, name: String(row.name ?? row.id), rarity, elite, level, choices }];
  });
}
