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

  for (const [label, option] of [
    ["搓玉计划", "计划进行"],
    ["产出与操作取向", "优先省心"],
    ["布局调整范围", "可调整产线与订单"],
    ["两发电布局", "不接受"],
    ["通常上线节奏", "不规律"],
  ]) {
    await page.getByRole("combobox", { name: label, exact: true }).click();
    await page.getByRole("option", { name: option, exact: true }).click();
  }
  await page.reload();
  await expect(page.locator('[data-workbench-hydrated="true"]')).toBeVisible();
  await expect(page).toHaveURL(/\/account-health$/);

  await expect(page.getByLabel("搓玉计划")).toHaveValue("计划进行");
  await expect(page.getByLabel("产出与操作取向")).toHaveValue("优先省心");
  await expect(page.getByLabel("布局调整范围")).toHaveValue("可调整产线与订单");
  await expect(page.getByLabel("两发电布局")).toHaveValue("不接受");
  await expect(page.getByLabel("通常上线节奏")).toHaveValue("不规律");
  await expect(page.getByLabel("资源侧重点")).toHaveValue("未设置");

  await page.getByLabel("搓玉计划").click();
  await page.getByRole("option", { name: "未设置", exact: true }).click();
  await page.reload();
  await expect(page.getByLabel("搓玉计划")).toHaveValue("未设置");
  await expect(page.getByLabel("两发电布局")).toHaveValue("不接受");

  await page.setViewportSize({ width: 375, height: 812 });
  await expect(page.locator("[data-account-health-demand]")).toBeVisible();
  await page.getByLabel("资源侧重点").click();
  await page.getByRole("option", { name: "龙门币", exact: true }).click();
  await expect(page.getByLabel("资源侧重点")).toHaveValue("龙门币");
  await page.getByLabel("资源侧重点").press("ArrowDown");
  await expect(page.getByRole("listbox")).toBeVisible();
  await page.getByLabel("资源侧重点").press("Escape");
  await expect(page.getByRole("listbox")).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
