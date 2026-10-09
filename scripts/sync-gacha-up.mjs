#!/usr/bin/env node
/* global fetch, AbortSignal, URL, console */

import { readFile, writeFile } from "node:fs/promises";

const source = "https://weedy.prts.wiki/gacha_table.json";
const response = await fetch(source, { signal: AbortSignal.timeout(30_000) });
if (!response.ok) throw new Error(`Gacha pool source returned ${response.status}`);
const data = await response.json();
if (!Array.isArray(data.gachaPoolClient)) throw new Error("Gacha pool source has no pool list");

const operators = JSON.parse(await readFile(new URL("../src/generated/arkntools/operator-catalog.json", import.meta.url), "utf8"));
const names = new Map(operators.map((operator) => [operator.id, operator.name]));
const pools = new Map();
for (const pool of data.gachaPoolClient) {
  const id = pool.gachaPoolId;
  const up = pool.gachaPoolDetail?.detailInfo?.upCharInfo?.perCharList;
  if (typeof id !== "string" || !Array.isArray(up)) continue;
  const named = (rank) => [...new Set(up
    .filter((item) => item.rarityRank === rank)
    .flatMap((item) => Array.isArray(item.charIdList) ? item.charIdList : [])
    .map((charId) => names.get(charId))
    .filter((name) => typeof name === "string" && name.length > 0))];
  const six = named(5);
  const five = named(4);
  if (six.length || five.length) pools.set(id, { six, five });
}
if (pools.size < 300) throw new Error(`Only ${pools.size} pools have explicit UP data; refusing an incomplete update`);
const sorted = Object.fromEntries([...pools].sort(([a], [b]) => a.localeCompare(b)));
const lines = Object.entries(sorted).map(([id, up], index, entries) =>
  `  ${JSON.stringify(id)}: ${JSON.stringify(up)}${index + 1 < entries.length ? "," : ""}`
);
await writeFile(new URL("../src/generated/gacha-up.json", import.meta.url), `{\n${lines.join("\n")}\n}\n`);
console.log(`Saved explicit UP information for ${pools.size} pools from ${source}`);
