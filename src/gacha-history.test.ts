import assert from "node:assert/strict";
import test from "node:test";
import { groupGachaPools, mergeGachaRecords, parseGachaRecord } from "./gacha-history.ts";

test("ten-pull duplicates remain distinct and rarity is one-based", () => {
  const source = { poolId: "pool", poolName: "寻访", charId: "char", charName: "干员", rarity: 5, gachaTs: "1770697079082" };
  const first = parseGachaRecord({ ...source, pos: 0 }, "normal")!;
  const second = parseGachaRecord({ ...source, pos: 1 }, "normal")!;
  assert.equal(first.stars, 6);
  assert.equal(mergeGachaRecords([first], [first, second]).length, 2);
  assert.equal(parseGachaRecord({ ...source, gachaTs: "invalid", pos: 0 }, "normal"), null);
});

test("pools are grouped by actual pool ID, not broad category", () => {
  const base = { charId: "char", charName: "干员", rarity: 5, gachaTs: "1770697079082", pos: 0 };
  const first = parseGachaRecord({ ...base, poolId: "a", poolName: "甲池" }, "normal")!;
  const second = parseGachaRecord({ ...base, poolId: "b", poolName: "乙池" }, "normal")!;
  const groups = groupGachaPools([first, second]);
  assert.equal(groups.length, 2);
  assert.deepEqual(groups.map((group) => group.name), ["甲池", "乙池"]);
  assert.equal(groups[0]?.sixStars, 1);
});

test("known pool ID resolves only explicitly listed UP operators", () => {
  const record = parseGachaRecord({ poolId: "NORM_0_1_1", poolName: "标准寻访", charId: "char", charName: "干员", rarity: 2, gachaTs: "1770697079082", pos: 0 }, "normal")!;
  const [pool] = groupGachaPools([record]);
  assert.deepEqual(pool?.upSixStars, ["能天使", "安洁莉娜"]);
  assert.equal(pool?.sixStars, 0);
});
