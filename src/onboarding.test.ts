import assert from "node:assert/strict";
import test from "node:test";

import {
  onboardingStepStatuses,
  resolveOnboardingPreference,
} from "./onboarding.ts";

test("onboarding preferences migrate the legacy seen marker and complete after a plan", () => {
  assert.equal(resolveOnboardingPreference(null, false), "active");
  assert.equal(resolveOnboardingPreference("1", false), "dismissed");
  assert.equal(resolveOnboardingPreference("dismissed", false), "dismissed");
  assert.equal(resolveOnboardingPreference(null, true), "completed");
});

test("onboarding step state always points to the next unfinished action", () => {
  assert.deepEqual(onboardingStepStatuses({
    authenticated: false,
    hasPersonalBox: false,
    hasSuccessfulPlan: false,
  }), ["current", "upcoming", "upcoming"]);
  assert.deepEqual(onboardingStepStatuses({
    authenticated: true,
    hasPersonalBox: false,
    hasSuccessfulPlan: false,
  }), ["complete", "current", "upcoming"]);
  assert.deepEqual(onboardingStepStatuses({
    authenticated: true,
    hasPersonalBox: true,
    hasSuccessfulPlan: false,
  }), ["complete", "complete", "current"]);
  assert.deepEqual(onboardingStepStatuses({
    authenticated: true,
    hasPersonalBox: true,
    hasSuccessfulPlan: true,
  }), ["complete", "complete", "complete"]);
});
