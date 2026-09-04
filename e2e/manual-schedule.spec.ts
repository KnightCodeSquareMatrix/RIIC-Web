import { expect, test } from "@playwright/test";
import layout243 from "../src/layouts/243.json" with { type: "json" };
import { mockApis, now, planData } from "./production-readiness.fixture";

const operators = [
  { id: "char_002_amiya", name: "阿米娅", elite: 2, level: 80, own: true, potential: 6, rarity: 5 },
  { id: "char_300_phenxi", name: "菲亚梅塔", elite: 2, level: 60, own: true, potential: 1, rarity: 6 },
  { id: "char_348_ceylon", name: "锡兰", elite: 2, level: 60, own: true, potential: 1, rarity: 5 },
];

test.beforeEach(async ({ page }) => {
  await mockApis(page);
  await page.addInitScript(({ layout, operbox, savedAt, expiresAt }) => {
    window.localStorage.setItem("arknights-infra-calc-beta-onboarding-v1", "1");
    window.localStorage.setItem("arknights-infra-calc-session-v5", JSON.stringify({
      version: 5,
      savedAt,
      expiresAt,
      presetLabel: "243",
      layout,
      operbox,
      sourceName: "手动排班测试样例",
      boxSource: "sample",
      layoutDirty: false,
      layoutSource: "local",
      localLayoutBackup: null,
      rotationProfile: "abc_12_6_6",
      fiammettaEnabled: false,
      result: null,
      activeShift: 0,
    }));
  }, {
    layout: layout243,
    operbox: operators,
    savedAt: new Date(now).toISOString(),
    expiresAt: new Date(now + 30 * 24 * 60 * 60 * 1000).toISOString(),
  });
});

test("calculator result toolbar keeps manual editing next to MAA export", async ({ page }) => {
  let planRequests = 0;
  await page.route("**/api/plan", (route) => {
    planRequests += 1;
    return route.abort();
  });

  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  await expect(page.locator('[data-workbench-hydrated="true"]')).toBeVisible();
  const desktopActions = page.locator('[data-calculator-export-actions="desktop"]');
  await expect(desktopActions.getByRole("button", { name: "手动修改排班" })).toBeEnabled();
  await expect(desktopActions.getByRole("button", { name: "导出到 MAA" })).toBeDisabled();
  await desktopActions.getByRole("button", { name: "手动修改排班" }).click();
  await expect(page).toHaveURL(/\/manual$/);
  expect(planRequests).toBe(0);
});

test("calculator onboarding does not expose manual editing", async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.removeItem("arknights-infra-calc-beta-onboarding-v1");
  });
  await page.goto("/");
  const startPanel = page.locator("[data-calculator-start-panel]");
  await expect(startPanel).toBeVisible();
  await expect(startPanel.getByRole("button", { name: "手动修改排班" })).toHaveCount(0);
});

test("calculator converts a solved schedule into editable manual assignments", async ({ page }) => {
  await page.addInitScript((result) => {
    const key = "arknights-infra-calc-session-v5";
    const session = JSON.parse(window.localStorage.getItem(key) ?? "null");
    window.localStorage.setItem(key, JSON.stringify({ ...session, result }));
  }, planData);

  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  await expect(page.locator('[data-workbench-hydrated="true"]')).toBeVisible();
  const desktopActions = page.locator('[data-calculator-export-actions="desktop"]');
  await expect(desktopActions.getByRole("button", { name: "导出到 MAA" })).toBeEnabled();
  await desktopActions.getByRole("button", { name: "手动修改排班" }).click();

  await expect(page).toHaveURL(/\/manual$/);
  await expect(page.getByRole("tab", { name: /班次 1.*12h/ })).toBeVisible();
  await expect(page.locator('[data-room-title="加工站"] [data-operator-identity="阿米娅"]')).toBeVisible();
});

test("manual scheduling configures independent shifts, moves conflicts and enables dorm autofill", async ({ page }) => {
  test.slow();
  let planRequests = 0;
  await page.route("**/api/plan", (route) => {
    planRequests += 1;
    return route.abort();
  });

  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/manual");
  await expect(page.locator('[data-workbench-hydrated="true"]')).toBeVisible();
  await expect(page.locator("[data-manual-schedule-page]")).toBeVisible();
  await expect(page.locator('[data-primary-navigation-page="manual"]')).toHaveAttribute("aria-current", "page");

  await page.getByRole("button", { name: "EN", exact: true }).click();
  await expect(page.getByRole("button", { name: "Configure Box & layout" }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Export MAA" })).toBeVisible();
  await expect(page.getByRole("tab", { name: /Shift 1.*12h/ })).toBeVisible();
  await page.getByRole("button", { name: "中文", exact: true }).click();

  await page.getByRole("button", { name: "配置 Box 与布局" }).first().click();
  const setup = page.getByRole("dialog");
  await setup.getByRole("button", { name: "继续", exact: true }).click();
  await expect(setup.locator("[data-manual-shift-settings]")).toBeVisible();
  await expect(setup.getByRole("combobox", { name: "换班方式" })).toHaveCount(0);
  await expect(setup.getByLabel("班次 1 时长")).toHaveValue("12");
  await setup.getByLabel("班次 1 时长").fill("10.5");
  await setup.getByRole("button", { name: "减少一个班次" }).click();
  await setup.getByRole("checkbox", { name: /未启用/ }).click();
  await setup.getByRole("button", { name: "继续", exact: true }).click();
  await setup.getByRole("button", { name: "完成", exact: true }).click();

  await expect(page.getByRole("tab", { name: /班次 1.*10.5h/ })).toBeVisible();
  await expect(page.locator("[data-manual-shift-tabs]").getByRole("tab")).toHaveCount(2);
  await page.getByRole("button", { name: "选择换心情目标" }).click();
  const fiammettaPicker = page.getByRole("dialog");
  await expect(fiammettaPicker.locator("[data-manual-operator-choice]").first().locator("img")).toBeVisible();
  await expect(fiammettaPicker.getByText(/精2 Lv\.60/).first()).toBeVisible();
  await fiammettaPicker.getByRole("button", { name: /锡兰/ }).hover();
  await page.waitForTimeout(1_000);
  await expect(page.locator('[data-slot="tooltip-content"][data-open]')).toHaveCount(0);
  await expect(page.locator('[data-slot="tooltip-content"][data-open]')).toBeVisible({ timeout: 2_000 });
  await fiammettaPicker.locator("[data-manual-operator-picker]").evaluate((element) => {
    element.dispatchEvent(new Event("scroll"));
  });
  await expect(page.locator('[data-slot="tooltip-content"][data-open]')).toHaveCount(0);
  await page.waitForTimeout(200);
  await fiammettaPicker.getByRole("button", { name: /阿米娅/ }).hover();
  await page.waitForTimeout(1_000);
  await expect(page.locator('[data-slot="tooltip-content"][data-open]')).toHaveCount(0);
  await expect(page.locator('[data-slot="tooltip-content"][data-open]')).toBeVisible({ timeout: 2_000 });
  await fiammettaPicker.getByRole("button", { name: /锡兰/ }).click();
  await expect(page.getByRole("button", { name: "换心情：锡兰" })).toBeVisible();

  const trade = page.locator('[data-room-title="贸易站 1"]');
  const factory = page.locator('[data-room-title="制造站 1"]');
  await expect(trade.getByRole("button", { name: "空置" }).first()).toContainText("可编辑");
  await trade.getByRole("button", { name: "空置" }).first().click();
  await page.getByRole("dialog").getByRole("button", { name: /阿米娅/ }).click();
  await expect(trade.locator('[data-operator-identity="阿米娅"]')).toBeVisible();

  await trade.getByRole("button", { name: "空置" }).first().click();
  await page.getByRole("dialog").getByRole("button", { name: /锡兰/ }).click();
  await trade.getByRole("button", { name: /阿米娅/ }).click();
  await page.getByRole("dialog").getByRole("button", { name: /阿米娅/ }).click();
  await expect(trade.getByRole("button", { name: /阿米娅/ })).toBeVisible();

  await trade.getByRole("button", { name: /锡兰/ }).click();
  await page.getByRole("dialog").getByRole("button", { name: /阿米娅/ }).click();
  await expect(trade.locator('[data-operator-identity]')).toHaveCount(3);
  const orderedIdentities = await trade.locator('[data-operator-identity]').evaluateAll((elements) => (
    elements.map((element) => element.getAttribute("data-operator-identity"))
  ));
  expect(orderedIdentities.slice(0, 3)).toEqual(["锡兰", "阿米娅", "empty"]);

  await factory.getByRole("button", { name: "空置" }).first().click();
  await page.getByRole("dialog").getByRole("button", { name: /阿米娅/ }).click();
  const moveDialog = page.getByRole("dialog", { name: "移动该干员？" });
  await expect(moveDialog).toContainText("已经在贸易站 1工作");
  await moveDialog.getByRole("button", { name: "移动干员" }).click();
  await expect(trade.locator('[data-operator-identity="阿米娅"]')).toHaveCount(0);
  await expect(factory.locator('[data-operator-identity="阿米娅"]')).toBeVisible();

  const dorm = page.locator('[data-room-title="宿舍 1"]');
  await expect(dorm.locator('[data-operator-identity="autofill"]')).toHaveCount(5);
  await dorm.getByRole("button", { name: "自动补位" }).first().click();
  await page.getByRole("dialog").getByRole("button", { name: "保持空置" }).click();
  await expect(dorm.locator('[data-operator-identity="autofill"]')).toHaveCount(0);
  await dorm.getByRole("button", { name: "空置" }).first().click();
  await page.getByRole("dialog").getByRole("button", { name: "自动补位" }).click();
  await expect(dorm.locator('[data-operator-identity="autofill"]')).toHaveCount(5);

  await page.getByRole("tab", { name: /班次 2.*6h/ }).click();
  await expect(factory.locator('[data-operator-identity="阿米娅"]')).toHaveCount(0);
  expect(planRequests).toBe(0);

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出到 MAA" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("arknights-infra-schedule-maa.json");
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  const exported = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  expect(exported).toMatchObject({ title: "手动排班 · 243", planTimes: "2班" });
  for (const plan of exported.plans) {
    for (const rooms of Object.values(plan.rooms) as Array<Array<{ operators: unknown[] }>>) {
      for (const room of rooms) expect(room.operators.every((operator) => typeof operator === "string")).toBe(true);
    }
  }
});
