import assert from "node:assert/strict";
import test from "node:test";

import * as XLSX from "xlsx";

import { readOperboxFile, readOperboxText } from "./operbox.ts";

const entry = {
  id: "char_test",
  name: "测试干员",
  elite: 2,
  level: 90,
  own: true,
  potential: 1,
  rarity: 6,
};

test("JSON imports do not load the XLSX parser", async () => {
  let xlsxRequested = false;
  const file = new File([JSON.stringify([entry])], "operators.json", { type: "application/json" });
  const result = await readOperboxFile(file, async () => {
    xlsxRequested = true;
    throw new Error("XLSX should not load for JSON files");
  });

  assert.equal(xlsxRequested, false);
  assert.deepEqual(result, [entry]);
});

test("localized MAA JSON names are converted to Simplified Chinese during import", async () => {
  const localizedEntries = [
    { ...entry, id: "char_002_amiya", name: "アーミヤ" },
    { ...entry, id: "char_003_kalts", name: "凱爾希" },
    { ...entry, id: "char_010_chen", name: "Ch'en" },
    { ...entry, id: "char_017_huang", name: "煌" },
  ];

  assert.deepEqual(
    (await readOperboxText(JSON.stringify(localizedEntries))).map(({ id, name }) => ({ id, name })),
    [
      { id: "char_002_amiya", name: "阿米娅" },
      { id: "char_003_kalts", name: "凯尔希" },
      { id: "char_010_chen", name: "陈" },
      { id: "char_017_huang", name: "煌" },
    ],
  );
});

test("Excel imports still parse compatible operator rows", async () => {
  const worksheet = XLSX.utils.json_to_sheet([entry]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Operators");
  const bytes = XLSX.write(workbook, { type: "array", bookType: "xlsx" });
  const file = new File([bytes], "operators.xlsx");

  assert.deepEqual(await readOperboxFile(file, async () => XLSX), [entry]);
});

test("invalid Excel imports remain recoverable errors", async () => {
  const file = new File([new Uint8Array([1, 2, 3, 4])], "broken.xlsx");
  await assert.rejects(() => readOperboxFile(file, async () => XLSX), Error);
});
