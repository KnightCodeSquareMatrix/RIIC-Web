import assert from "node:assert/strict";
import test from "node:test";

import {
  nextSklandQrPollDelay,
  SKLAND_QR_MAX_BACKOFF_MS,
  SKLAND_QR_POLL_INTERVAL_MS,
} from "./skland-qr-polling.ts";

const now = 1_000_000;
const expiresAt = now + 10 * 60_000;

test("Skland QR polling uses bounded exponential backoff for transient failures", () => {
  assert.equal(nextSklandQrPollDelay({ failedAttempts: 0, expiresAt, now }), SKLAND_QR_POLL_INTERVAL_MS);
  assert.equal(nextSklandQrPollDelay({ failedAttempts: 1, expiresAt, now }), 12_000);
  assert.equal(nextSklandQrPollDelay({ failedAttempts: 2, expiresAt, now }), 24_000);
  assert.equal(nextSklandQrPollDelay({ failedAttempts: 3, expiresAt, now }), SKLAND_QR_MAX_BACKOFF_MS);
  assert.equal(nextSklandQrPollDelay({ failedAttempts: 10, expiresAt, now }), SKLAND_QR_MAX_BACKOFF_MS);
});

test("Skland QR polling honors Retry-After without polling at or beyond expiration", () => {
  assert.equal(nextSklandQrPollDelay({
    failedAttempts: 1,
    expiresAt,
    now,
    retryAfterSeconds: 30,
  }), 30_000);
  assert.equal(nextSklandQrPollDelay({
    failedAttempts: 10,
    expiresAt,
    now,
    retryAfterSeconds: 90,
  }), 90_000);
  assert.equal(nextSklandQrPollDelay({
    failedAttempts: 1,
    expiresAt: now + 30_000,
    now,
    retryAfterSeconds: 30,
  }), null);
  assert.equal(nextSklandQrPollDelay({ failedAttempts: 0, expiresAt: now, now }), null);
});
