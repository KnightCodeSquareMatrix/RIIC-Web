import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_USER_SETTINGS,
  loadUserSettings,
  persistUserSettings,
  USER_SETTINGS_STORAGE_KEY,
} from "./user-settings.ts";

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value); },
    removeItem: (key) => { values.delete(key); },
    clear: () => { values.clear(); },
    key: (index) => [...values.keys()][index] ?? null,
    get length() { return values.size; },
  };
}

test("user settings persist and fall back to defaults", () => {
  const storage = memoryStorage();
  assert.deepEqual(loadUserSettings(storage), DEFAULT_USER_SETTINGS);
  persistUserSettings(storage, {
    strictMaaOperatorOrder: false,
    showProgressionRecalculate: false,
  showManualScheduleEdit: false,
  scheduleViewControl: "select",
  linkShiftViewControl: false,
  shiftViewControl: "select",
  imageExportScope: "all",
  loadEnglishResources: false,
    skillPagination: "manual",
    showFeedback: false,
    showImages: false,
    allowReplacementOperatorSort: true,
});
assert.equal(storage.getItem(USER_SETTINGS_STORAGE_KEY), "{\"strictMaaOperatorOrder\":false,\"showProgressionRecalculate\":false,\"showManualScheduleEdit\":false,\"scheduleViewControl\":\"select\",\"linkShiftViewControl\":false,\"shiftViewControl\":\"select\",\"imageExportScope\":\"all\",\"loadEnglishResources\":false,\"skillPagination\":\"manual\",\"showFeedback\":false,\"showImages\":false,\"allowReplacementOperatorSort\":true}");
assert.deepEqual(loadUserSettings(storage), {
  strictMaaOperatorOrder: false,
  showProgressionRecalculate: false,
  showManualScheduleEdit: false,
  scheduleViewControl: "select",
  linkShiftViewControl: false,
  shiftViewControl: "select",
  imageExportScope: "all",
  loadEnglishResources: false,
  skillPagination: "manual",
  showFeedback: false,
  showImages: false,
  allowReplacementOperatorSort: true,
});
});
