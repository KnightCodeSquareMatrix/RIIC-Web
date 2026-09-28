import { expect, test } from "@playwright/test";
import { mockApis } from "./production-readiness.fixture";

test("account health preferences live on their own page and fit mobile", async ({ page }) => {
  await mockApis(page);
  await page.goto("/settings");
  await expect(page.locator('[data-workbench-hydrated="true"]')).toBeVisible();
  await expect(page.locator("[data-account-health-demand]")).toHaveCount(0);

  await page.goto("/account-health");
  await expect(page.locator('[data-workbench-hydrated="true"]')).toBeVisible();
  await expect(page.locator("[data-account-health-page]")).toBeVisible();
  const progression = page.locator('[data-slot="sidebar-group"]').filter({ hasText: "养成规划" });
  await expect(progression.locator('[data-primary-navigation-page]').first()).toHaveAttribute("data-primary-navigation-page", "account-health");
  await expect(page.locator("[data-account-health-demand]")).toBeVisible();
  await expect(page.getByRole("heading", { name: "基建使用偏好" })).toBeVisible();
  await expect(page.getByLabel("可接受的每日换班")).toHaveCount(0);

  await page.getByLabel("搓玉计划").selectOption("planned");
  await page.getByLabel("产出与操作取向").selectOption("low-maintenance");
  await page.getByLabel("布局调整范围").selectOption("recipes-only");
  await page.getByLabel("两发电布局").selectOption("avoid");
  await page.getByLabel("通常上线节奏").selectOption("irregular");
  await page.reload();
  await expect(page.locator('[data-workbench-hydrated="true"]')).toBeVisible();
  await expect(page).toHaveURL(/\/account-health$/);

  await expect(page.getByLabel("搓玉计划")).toHaveValue("planned");
  await expect(page.getByLabel("两发电布局")).toHaveValue("avoid");
  await expect(page.getByLabel("通常上线节奏")).toHaveValue("irregular");
  await expect(page.getByLabel("资源侧重点")).toHaveValue("");

  await page.setViewportSize({ width: 375, height: 812 });
  await expect(page.locator("[data-account-health-demand]")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
