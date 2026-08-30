import assert from "node:assert/strict";
import test from "node:test";

import { hasSetupConfigurationChanged, setupConfigurationFingerprint } from "./setup-configuration.ts";

test("closing an unchanged setup session does not require confirmation", () => {
  const configuration = setupConfigurationFingerprint({ layout: { template: "custom" }, rotation: "balanced" });
  assert.equal(hasSetupConfigurationChanged(configuration, configuration), false);
});

test("changing any setup value requires confirmation", () => {
  const opening = setupConfigurationFingerprint({ layout: { template: "243" }, rotation: "balanced" });
  const current = setupConfigurationFingerprint({ layout: { template: "243" }, rotation: "efficiency" });
  assert.equal(hasSetupConfigurationChanged(opening, current), true);
});
