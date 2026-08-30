import { expect, test } from "@playwright/test";

test("production profile exposes explicitly enabled Skland while preserving security defaults", async ({ page, request }) => {
  test.setTimeout(60_000);
  const sklandRequests: string[] = [];
  page.on("request", (browserRequest) => {
    if (new URL(browserRequest.url()).pathname.startsWith("/api/skland/")) {
      sklandRequests.push(browserRequest.url());
    }
  });
  await page.addInitScript(() => {
    window.localStorage.setItem("arknights-infra-calc-beta-onboarding-v1", "1");
  });

  await page.goto("/");
  await expect(page.getByRole("button", { name: "基建计算器", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "森空岛状态中心", exact: true })).toBeVisible();
  await expect(page.getByText("调试工具", { exact: false })).toHaveCount(0);
  expect(sklandRequests).toEqual([]);

  await page.getByRole("button", { name: "账号管理", exact: true }).click();
  await expect(page.locator("[data-account-management]")).toHaveCount(0);
  const accountDialog = page.getByRole("dialog", { name: "登录网站账号" });
  await expect(accountDialog).toBeVisible();
  await expect(accountDialog.locator("[data-website-account-panel]")).toBeVisible();
  await accountDialog.getByRole("button", { name: "Close" }).click();
  await page.getByRole("button", { name: "基建计算器", exact: true }).click();

  await page.getByRole("button", { name: "配置Box与布局" }).first().click();
  const setupGate = page.getByRole("dialog", { name: "登录网站账号" });
  await expect(setupGate).toBeVisible();
  await expect(setupGate.getByText("继续使用受账号保护的数据导入与排班功能。", { exact: true })).toBeVisible();
  await expect(page.getByText("上传练度 JSON / XLSX", { exact: true })).toHaveCount(0);

  const sklandPageResponse = await request.get("/skland");
  expect(sklandPageResponse.status()).toBe(200);
  expect(await sklandPageResponse.text()).toContain("森空岛");

  const healthResponse = await request.get("/api/health");
  expect([200, 503]).toContain(healthResponse.status());
  const health = await healthResponse.json();
  expect(health.success).toBe(true);
  expect(health.data).toHaveProperty("skland");
  expect(health.data.features).toMatchObject({ debugTools: false, rateLimit: true });

  for (const path of ["/api/skland/session", "/api/skland/accounts"]) {
    const sessionResponse = await request.get(path);
    expect(sessionResponse.status(), path).toBe(401);
    expect(await sessionResponse.json()).toMatchObject({
      success: false,
      error: { code: "AIC-AUTH-2008", retryable: false },
    });
  }

  await page.goto("/terms");
  await expect(page.getByText("森空岛", { exact: false }).first()).toBeVisible();
  await page.goto("/privacy");
  await expect(page.getByText("森空岛", { exact: false }).first()).toBeVisible();
});
