import gachaUpJson from "./generated/gacha-up.json" with { type: "json" };

const GACHA_UP_BY_POOL_ID = gachaUpJson as Record<string, { six: string[]; five: string[] }>;

export type GachaRecord = {
  id: string;
  category: string;
  poolId: string;
  poolName: string;
  charId: string;
  charName: string;
  stars: number;
  isNew: boolean;
  timestamp: number;
  pos: number;
};

export type GachaHistory = {
  uid: string;
  nickname: string;
  records: GachaRecord[];
  warnings: string[];
  fetchedAt: string;
};

export function parseGachaRecord(raw: unknown, category: string): GachaRecord | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Record<string, unknown>;
  const timestamp = Number(value.gachaTs);
  const pos = Number(value.pos);
  const rarity = Number(value.rarity);
  if (!Number.isSafeInteger(timestamp) || timestamp < 1_500_000_000_000 || timestamp > Date.now() + 86_400_000
    || !Number.isSafeInteger(pos) || pos < 0 || pos > 9 || !Number.isInteger(rarity) || rarity < 0 || rarity > 5) return null;
  const poolId = String(value.poolId ?? "").slice(0, 120);
  const poolName = String(value.poolName ?? category).slice(0, 120);
  const charId = String(value.charId ?? "").slice(0, 120);
  const charName = String(value.charName ?? charId).slice(0, 120);
  if (!poolName || !charName) return null;
  return {
    id: `${category}:${poolId}:${charId || charName}:${timestamp}:${pos}`,
    category, poolId, poolName, charId, charName, stars: rarity + 1,
    isNew: value.isNew === true, timestamp, pos,
  };
}

export function mergeGachaRecords(existing: GachaRecord[], incoming: GachaRecord[]): GachaRecord[] {
  const byId = new Map(existing.map((record) => [record.id, record]));
  for (const record of incoming) byId.set(record.id, record);
  return [...byId.values()].sort((a, b) => b.timestamp - a.timestamp || b.pos - a.pos);
}

export type GachaPoolGroup = {
  key: string;
  name: string;
  category: string;
  records: GachaRecord[];
  sixStars: number;
  latest: number;
  upSixStars: string[];
  upFiveStars: string[];
};

export function groupGachaPools(records: GachaRecord[]): GachaPoolGroup[] {
  const groups = new Map<string, GachaPoolGroup>();
  for (const record of records) {
    const key = `${record.category}:${record.poolId || record.poolName}`;
    let group = groups.get(key);
    if (!group) {
      const up = GACHA_UP_BY_POOL_ID[record.poolId];
      group = { key, name: record.poolName, category: record.category, records: [], sixStars: 0, latest: 0, upSixStars: up?.six ?? [], upFiveStars: up?.five ?? [] };
      groups.set(key, group);
    }
    group.records.push(record);
    if (record.stars === 6) group.sixStars += 1;
    group.latest = Math.max(group.latest, record.timestamp);
  }
  return [...groups.values()].sort((a, b) => b.latest - a.latest);
}
