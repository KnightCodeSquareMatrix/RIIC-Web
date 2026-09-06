import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_LOCALE, isAppLocale, resolveLocale } from "./config.ts";

test("only supported cookie locales override the deployment default", () => {
  assert.equal(resolveLocale("en"), "en");
  assert.equal(resolveLocale("zh"), "zh");
  for (const invalid of [undefined, null, "", "ja", "../../en", "en-US", {}, 1]) {
    assert.equal(isAppLocale(invalid), false);
    assert.equal(resolveLocale(invalid), DEFAULT_LOCALE);
  }
});
