import assert from "node:assert/strict";
import test from "node:test";

import { prepareMaaForExport } from "./maa-safety.ts";
import type { MaaJson } from "./types.ts";

test("prepares MAA export with sort enabled and preserves displayed operator order", () => {
  const maa: MaaJson = {
    title: "test",
    plans: [{
      name: "班次 1",
      rooms: {
        trading: [{
          operators: ["古米", "银灰", "梅"],
          sort: false,
        }],
      },
    }],
  };

  const exported = prepareMaaForExport(maa);
  const room = exported.plans[0]!.rooms.trading![0]!;

  assert.equal(room.sort, true);
  assert.deepEqual(room.operators, ["古米", "银灰", "梅"]);
  assert.equal(maa.plans[0]!.rooms.trading![0]!.sort, false);

  const relaxed = prepareMaaForExport(maa, false);
  assert.equal(relaxed.plans[0]!.rooms.trading![0]!.sort, false);
});
