import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { URL } from "node:url";

import {
  findReusableScan,
  hasScanStartCapacity,
  MAX_CONCURRENT_SCAN_STARTS,
  scanActorKey,
  type ReusableScanRecord,
} from "./scan-admission.ts";

const consent = {
  termsVersion: "terms-v1",
  privacyVersion: "privacy-v1",
};

test("scan actor keys isolate website accounts without retaining raw user ids", () => {
  const first = scanActorKey("website-user-one");
  assert.equal(first, scanActorKey("website-user-one"));
  assert.notEqual(first, scanActorKey("website-user-two"));
  assert.equal(first.includes("website-user-one"), false);
});

test("an active QR code is reused only for the same website account and policy", () => {
  const now = 10 * 60 * 1000;
  const actorKey = scanActorKey("website-user");
  const record: ReusableScanRecord = {
    actorKey,
    scanUrl: "https://example.com/scan",
    createdAt: now - 30_000,
    policyConsent: consent,
  };
  const scans = [["scan-one", record]] as const;

  assert.deepEqual(findReusableScan(scans, actorKey, consent, now), {
    scanId: "scan-one",
    scanUrl: record.scanUrl,
    expiresInSeconds: 570,
  });
  assert.equal(findReusableScan(scans, scanActorKey("another-user"), consent, now), null);
  assert.equal(findReusableScan(scans, actorKey, { ...consent, privacyVersion: "privacy-v2" }, now), null);
  assert.equal(findReusableScan(scans, actorKey, consent, now + 10 * 60 * 1000), null);
});

test("global QR protection limits only concurrent upstream starts", () => {
  assert.equal(hasScanStartCapacity(MAX_CONCURRENT_SCAN_STARTS - 1), true);
  assert.equal(hasScanStartCapacity(MAX_CONCURRENT_SCAN_STARTS), false);
});

test("the ten-minute global quota that caused cross-account lockouts cannot return", async () => {
  const source = await readFile(new URL("./adapter.ts", import.meta.url), "utf8");
  const route = await readFile(
    new URL("../../app/api/skland/auth/qr/route.ts", import.meta.url),
    "utf8"
  );
  assert.doesNotMatch(source, /assertRate\(["']scan:global/);
  assert.match(source, /scan:actor:/);
  assert.match(source, /scan:ip:/);
  assert.match(source, /scanStartTasks/);
  assert.match(route, /enforceRateLimit\("skland-qr-account", website\.user\.id/);
});
