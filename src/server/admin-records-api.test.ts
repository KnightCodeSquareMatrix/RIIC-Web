import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("admin record responses are private and non-cacheable on success and failure", async () => {
  const source = await readFile(new URL("./admin-records-api.ts", import.meta.url), "utf8");

  assert.equal(source.includes('response.headers.set("Cache-Control", "private, no-store, max-age=0")'), true);
  assert.equal(source.includes("return noStore(successResponse"), true);
  assert.equal(source.includes("return noStore(failureResponse"), true);
  assert.equal(source.includes("noStore(failureResponse(new PublicApiError"), true);
});

test("admin issue details and deletion retain their privacy boundaries", async () => {
  const source = await readFile(new URL("./admin-records-api.ts", import.meta.url), "utf8");
  const failedRunGuard = source.indexOf('item.status !== "failed"');
  const readReproduction = source.indexOf("await readPlanReproduction(item.diagnosticId", failedRunGuard);
  const deleteArtifacts = source.indexOf("await deleteFeedbackArtifacts(ids)");
  const deleteRows = source.indexOf("await deleteFeedbackRecords(ids)");

  assert.equal(failedRunGuard > 0, true);
  assert.equal(readReproduction > failedRunGuard, true);
  assert.equal(deleteArtifacts > 0, true);
  assert.equal(deleteRows > deleteArtifacts, true);
  assert.equal(source.includes('feedbackFacility(params.get("facility"))'), true);
});
