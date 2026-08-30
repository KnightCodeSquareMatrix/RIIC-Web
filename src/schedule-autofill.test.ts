import assert from "node:assert/strict";
import test from "node:test";

import { maaRoomAutofill } from "./schedule-autofill.ts";

const partialDorm = {
  group: "dormitory",
  skip: false,
  occupiedSlots: 1,
  capacity: 5,
};

test("propagates an explicit MAA autofill flag", () => {
  assert.equal(maaRoomAutofill(true), true);
  assert.equal(maaRoomAutofill(false), false);
  assert.equal(maaRoomAutofill(undefined), false);
  assert.equal(maaRoomAutofill("true"), false);
});

test("shows AUTO for partial legacy dorms without changing full or skipped rooms", () => {
  assert.equal(maaRoomAutofill(false, partialDorm), true);
  assert.equal(maaRoomAutofill(undefined, partialDorm), true);
  assert.equal(maaRoomAutofill(false, { ...partialDorm, occupiedSlots: 5 }), false);
  assert.equal(maaRoomAutofill(false, { ...partialDorm, skip: true }), false);
  assert.equal(maaRoomAutofill(false, { ...partialDorm, group: "meeting" }), false);
});
