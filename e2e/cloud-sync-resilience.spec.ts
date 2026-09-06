import { expect, test } from "@playwright/test";
import { PRIVACY_VERSION, TERMS_VERSION } from "../src/legal-policy";
import { SESSION_KEY_V5 } from "../src/persistence";
import { mockApis, planData, requestId, seedV4Session } from "./production-readiness.fixture";

test.beforeEach(async ({ page }) => {
  await page.route("**/api/auth/get-session", (route) => route.fulfill({ json: {
    session: { id: "test-session", token: "test-token", userId: "test-user", expiresAt: new Date(Date.now() + 3_600_000).toISOString(), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
    user: { id: "test-user", name: "测试用户", email: "test@example.com", emailVerified: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  } }));
});

for (const failure of [
  { code: "AIC-DATA-8001", status: 403 },
  { code: "AIC-RATE-6001", status: 429 },
  { code: "AIC-DATA-8003", status: 422 },
]) {
  test(`cloud sync shows ${failure.code} and does not repeatedly upload`, async ({ page }) => {
    await mockApis(page);
    await seedV4Session(page, planData, { boxSource: "maa" });
    let writes = 0;
    await page.route("**/api/account/data-consent", (route) => route.fulfill({
      json: { success: true, requestId, data: { current: true, cloudSyncEnabled: true, termsVersion: TERMS_VERSION, privacyVersion: PRIVACY_VERSION, acceptedAt: new Date().toISOString(), revokedAt: null } },
    }));
    await page.route("**/api/workspace", (route) => {
      if (route.request().method() === "GET") return route.fulfill({ json: {
        success: true, requestId,
        data: { exists: false, revision: 0, state: null, operbox: null, result: null, updatedAt: null, syncedAt: null, revisions: [] },
      } });
      writes++;
      return route.fulfill({ status: failure.status, headers: { "Retry-After": "60" }, json: {
        success: false, requestId, error: { code: failure.code, message: "fixture failure", retryable: failure.status === 429, retryAfterSeconds: 60 },
      } });
    });
    await page.goto("/");
    await expect(page.locator('[data-workbench-hydrated="true"]')).toBeVisible();
    if (failure.status === 403) {
      const dialog = page.locator("[data-cloud-consent-dialog]");
      await expect(dialog).toBeVisible();
      await dialog.getByRole("button", { name: "继续纯本地模式" }).click();
    }
    await expect(page.locator("[data-cloud-sync-error]")).toContainText(failure.code);
    await page.waitForTimeout(2600);
    expect(writes).toBe(1);
    const local = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), SESSION_KEY_V5);
    expect(local.operbox[0].id).toBe("char_002_amiya");
  });
}
