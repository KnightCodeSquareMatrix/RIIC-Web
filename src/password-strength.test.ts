import assert from "node:assert/strict";
import test from "node:test";

import { evaluatePasswordStrength, isStrongPassword } from "./password-strength.ts";

test("accepts passwords that satisfy every strength rule", () => {
  const result = evaluatePasswordStrength("Strong-password-1");

  assert.equal(result.strong, true);
  assert.equal(result.score, 4);
  assert.equal(result.guessable, false);
  assert.equal(result.rules.every((rule) => rule.met), true);
});

test("rejects passwords with missing character variety", () => {
  assert.equal(isStrongPassword("lowercase123"), false);
  assert.equal(isStrongPassword("NoNumbersHere!"), false);
  assert.equal(isStrongPassword("short-1"), false);
});

test("rejects common, sequential, and repeated patterns even when rules pass", () => {
  for (const password of ["password-123", "Abcd-987654", "Repeat-1111"]) {
    const result = evaluatePasswordStrength(password);
    assert.equal(result.rules.every((rule) => rule.met), true);
    assert.equal(result.guessable, true);
    assert.equal(result.strong, false);
  }
});
