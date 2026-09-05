import { expect, test } from "@playwright/test";
import layout243 from "../src/layouts/243.json" with { type: "json" };
import { mockAnonymousWebsiteSession, mockApis, now, planData } from "./production-readiness.fixture";

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

test("sidebar resumes an existing manual draft without invoking the solver", async ({ page }) => {
  let planRequests = 0;
  await page.route("**/api/plan", (route) => {
    planRequests += 1;
    return route.abort();
  });

  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  await expect(page.locator('[data-workbench-hydrated="true"]')).toBeVisible();
  await page.evaluate(() => {
    window.localStorage.setItem("arknights-infra-manual-schedule-v1", JSON.stringify({
      version: 2,
      activeShift: 0,
      fiammettaEnabled: false,
      shifts: [{
        durationHours: 9,
        fiammettaTarget: null,
        rooms: { trade_1: { operators: ["阿米娅", null, null] } },
      }],
    }));
  });
  await expect(page.locator('[data-calculator-export-actions="desktop"]')).toHaveCount(0);
  await page.getByRole("button", { name: "手动排班", exact: true }).click();
  await expect(page).toHaveURL(/\/manual$/);
  await expect(page.getByRole("tab", { name: /第 1 班.*24h/ })).toBeVisible();
  await expect(page.locator('[data-room-title="贸易站 1"] [data-operator-identity="阿米娅"]')).toBeVisible();
  expect(planRequests).toBe(0);
});

test("manual scheduling hides a personal Box until website login", async ({ page }) => {
  await mockAnonymousWebsiteSession(page);
  await page.addInitScript(() => {
    const key = "arknights-infra-calc-session-v5";
    const session = JSON.parse(window.localStorage.getItem(key) ?? "null");
    window.localStorage.setItem(key, JSON.stringify({ ...session, boxSource: "maa" }));
  });

  await page.goto("/manual");
  await expect(page.locator('[data-workbench-hydrated="true"]')).toBeVisible();
  await expect(page.locator("[data-manual-schedule-page]")).toHaveCount(0);
  await page.getByRole("button", { name: "配置 Box 与布局" }).click();
  await expect(page.getByRole("dialog", { name: "登录网站账号" })).toBeVisible();
});

test("clearing local data from manual scheduling does not recreate its draft", async ({ page }) => {
  await page.goto("/manual");
  await expect(page.locator('[data-workbench-hydrated="true"]')).toBeVisible();
  await page.getByRole("button", { name: "配置 Box 与布局" }).first().click();
  const setup = page.getByRole("dialog");
  await setup.getByText("数据管理", { exact: true }).click();
  await setup.getByRole("button", { name: "清除本地数据" }).click();
  const confirmation = page.getByRole("dialog", { name: "清除本地数据？" });
  await confirmation.getByRole("button", { name: "清除本地数据" }).click();

  await expect(page).toHaveURL(/\/$/);
  await expect.poll(() => page.evaluate(() => (
    window.localStorage.getItem("arknights-infra-manual-schedule-v1")
  ))).toBeNull();
});

test("calculator onboarding does not expose manual editing", async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.removeItem("arknights-infra-calc-beta-onboarding-v1");
  });
  await page.goto("/");
  const startPanel = page.locator("[data-calculator-start-panel]");
  await expect(startPanel).toBeVisible();
  await expect(startPanel.getByRole("button", { name: "基于当前方案编辑" })).toHaveCount(0);
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
  await page.evaluate(() => {
    const originalSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function setItem(key: string, value: string) {
      if (key === "arknights-infra-manual-schedule-v1") {
        throw new DOMException("Storage disabled", "SecurityError");
      }
      return originalSetItem.call(this, key, value);
    };
  });
  const desktopActions = page.locator('[data-calculator-export-actions="desktop"]');
  await expect(desktopActions.getByRole("button", { name: "导出到 MAA" })).toBeEnabled();
  await desktopActions.getByRole("button", { name: "基于当前方案编辑" }).click();

  await expect(page).toHaveURL(/\/manual$/);
  await expect(page.locator('[data-manual-draft-source="baseline"]')).toContainText("基于「原方案」创建");
  await expect(page.getByRole("tab", { name: /第 1 班.*12h/ })).toBeVisible();
  await expect(page.locator('[data-room-title="加工站"] [data-operator-identity="阿米娅"]')).toBeVisible();
});

test("calculator protects a different manual draft before replacing it from a result", async ({ page }) => {
  await page.addInitScript((result) => {
    const key = "arknights-infra-calc-session-v5";
    const session = JSON.parse(window.localStorage.getItem(key) ?? "null");
    window.localStorage.setItem(key, JSON.stringify({ ...session, result }));
  }, planData);

  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  await expect(page.locator('[data-workbench-hydrated="true"]')).toBeVisible();
  await page.evaluate(() => {
    window.localStorage.setItem("arknights-infra-manual-schedule-v1", JSON.stringify({
      version: 2,
      activeShift: 0,
      fiammettaEnabled: false,
      shifts: [{
        durationHours: 9,
        fiammettaTarget: null,
        rooms: { trade_1: { operators: ["阿米娅", null, null] } },
      }],
    }));
  });

  const editCurrentPlan = page.locator('[data-calculator-plan-actions="desktop"]').getByRole("button", { name: "基于当前方案编辑" });
  await editCurrentPlan.click();
  const confirmation = page.getByRole("dialog", { name: "替换现有手动草稿？" });
  await expect(confirmation).toContainText("基于「原方案」创建手动排班");
  await confirmation.getByRole("button", { name: "保留现有草稿" }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect.poll(() => page.evaluate(() => JSON.parse(
    window.localStorage.getItem("arknights-infra-manual-schedule-v1") ?? "null",
  )?.shifts?.[0]?.durationHours)).toBe(9);

  await editCurrentPlan.click();
  await confirmation.getByRole("button", { name: "替换并进入" }).click();
  await expect(page).toHaveURL(/\/manual$/);
  await expect(page.locator('[data-manual-draft-source="baseline"]')).toContainText("基于「原方案」创建");
});

test("mobile result actions explain both adjustment paths", async ({ page }) => {
  await page.addInitScript((result) => {
    const key = "arknights-infra-calc-session-v5";
    const session = JSON.parse(window.localStorage.getItem(key) ?? "null");
    window.localStorage.setItem(key, JSON.stringify({ ...session, result }));
  }, planData);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.locator('[data-workbench-hydrated="true"]')).toBeVisible();
  await page.getByRole("button", { name: "调整方案", exact: true }).click();
  const actions = page.getByRole("dialog", { name: "调整当前方案" });
  await expect(actions).toContainText("当前正在查看「原方案」");
  await expect(actions.getByRole("button", { name: /修改练度并重新计算/ })).toBeVisible();
  await expect(actions.getByRole("button", { name: /基于当前方案手动编辑/ })).toBeVisible();
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

  const scheduleToolbar = page.locator("[data-schedule-toolbar]");
  const layoutTabs = scheduleToolbar.getByRole("tablist", { name: "排班布局切换" });
  const shiftTabs = scheduleToolbar.locator("[data-manual-shift-actions] [data-shift-tabs]");
  await expect(layoutTabs).toHaveAttribute("data-slot", "tabs-list");
  await expect(shiftTabs).toHaveAttribute("data-slot", "tabs-list");
  const [layoutTabsBox, shiftTabsBox] = await Promise.all([layoutTabs.boundingBox(), shiftTabs.boundingBox()]);
  expect(shiftTabsBox?.y).toBeCloseTo(layoutTabsBox?.y ?? 0, 0);
  await expect(shiftTabs.getByRole("tab", { name: /第 1 班.*12h/ })).toBeVisible();

  await page.getByRole("button", { name: "配置 Box 与布局" }).first().click();
  const setup = page.getByRole("dialog");
  await setup.getByRole("button", { name: "继续", exact: true }).click();
  await expect(setup.locator("[data-manual-shift-settings]")).toBeVisible();
  await expect(setup.getByRole("combobox", { name: "换班方式" })).toHaveCount(0);
  await expect(setup.getByRole("radio", { name: /顺序轮换/ })).toHaveAttribute("aria-checked", "true");
  await setup.getByRole("radio", { name: /时间区间/ }).click();
  await expect(setup.getByLabel("班次 1 开始时间")).toHaveValue("08:00");
  await setup.getByLabel("班次 1 开始时间").fill("08:15");
  await setup.getByLabel("班次 1 结束时间").fill("19:59");
  await expect(setup.getByLabel("班次 2 开始时间")).toHaveValue("20:00");
  await expect(setup.getByLabel("班次 2 开始时间")).toBeDisabled();
  await setup.getByRole("button", { name: "减少一个班次" }).click();
  await expect(setup.getByLabel("班次 2 结束时间")).toHaveValue("08:14");
  await expect(setup.getByLabel("班次 2 结束时间")).toBeDisabled();
  await setup.getByRole("checkbox", { name: /未启用/ }).click();
  await setup.getByRole("button", { name: "继续", exact: true }).click();
  await setup.getByRole("button", { name: "完成", exact: true }).click();

  await expect(page.getByRole("tab", { name: /班次 1.*08:15至19:59.*11小时45分钟/ })).toBeVisible();
  await expect(page.locator("[data-manual-shift-actions] [data-shift-tabs]").getByRole("tab")).toHaveCount(2);
  const manualShiftActions = page.locator("[data-manual-shift-actions]");
  const moraleTarget = manualShiftActions.getByRole("button", { name: "选择换心情目标" });
  const [moraleTargetBox, configuredShiftTabsBox] = await Promise.all([
    moraleTarget.boundingBox(),
    manualShiftActions.locator("[data-shift-tabs]").boundingBox(),
  ]);
  expect(moraleTargetBox?.x).toBeLessThan(configuredShiftTabsBox?.x ?? 0);
  expect((moraleTargetBox?.y ?? 0) + (moraleTargetBox?.height ?? 0) / 2)
    .toBeCloseTo((configuredShiftTabsBox?.y ?? 0) + (configuredShiftTabsBox?.height ?? 0) / 2, 0);
  await moraleTarget.click();
  const fiammettaPicker = page.getByRole("dialog");
  await expect(fiammettaPicker.locator("[data-manual-operator-choice]").first().locator('img[width="180"]')).toBeVisible();
  await expect(fiammettaPicker.locator("[data-elite-badge]").first()).toBeVisible();
  await expect(fiammettaPicker.getByRole("group", { name: "星级筛选" })).toBeVisible();
  await expect(fiammettaPicker.getByRole("button", { name: "上一页" })).toBeDisabled();
  await expect(fiammettaPicker.getByRole("button", { name: "下一页" })).toBeDisabled();
  await expect(fiammettaPicker.locator("[data-manual-operator-placeholder]")).toHaveCount(15);
  const pickerSearch = fiammettaPicker.getByLabel("搜索可选干员或基建技能");
  await pickerSearch.fill("锡兰");
  await fiammettaPicker.getByRole("button", { name: /锡兰/ }).hover();
  await expect(page.locator('[data-slot="tooltip-content"][data-open]')).toBeVisible({ timeout: 1_000 });
  await fiammettaPicker.locator("[data-manual-operator-picker]").evaluate((element) => {
    element.dispatchEvent(new Event("scroll"));
  });
  await expect(page.locator('[data-slot="tooltip-content"][data-open]')).toHaveCount(0);
  await page.waitForTimeout(200);
  await pickerSearch.fill("阿米娅");
  await fiammettaPicker.getByRole("button", { name: /阿米娅/ }).hover();
  await expect(page.locator('[data-slot="tooltip-content"][data-open]')).toBeVisible({ timeout: 1_000 });
  await pickerSearch.fill("锡兰");
  await fiammettaPicker.getByRole("button", { name: /锡兰/ }).click();
  await expect(manualShiftActions.getByRole("button", { name: "换心情 锡兰" })).toBeVisible();
  await expect(manualShiftActions.locator("[data-fiammetta-target-chip] img")).toBeVisible();

  const trade = page.locator('[data-room-title="贸易站 1"]');
  const factory = page.locator('[data-room-title="制造站 1"]');
  const tradeDrones = trade.getByRole("button", { name: "贸易站 1 无人机加速" });
  const factoryDrones = factory.getByRole("button", { name: "制造站 1 无人机加速" });
  await tradeDrones.click();
  await expect(tradeDrones).toHaveAttribute("aria-pressed", "true");
  await factoryDrones.click();
  await expect(tradeDrones).toHaveAttribute("aria-pressed", "false");
  await expect(factoryDrones).toHaveAttribute("aria-pressed", "true");
  await page.setViewportSize({ width: 1100, height: 1000 });
  await expect(page.locator('[data-schedule-view="list"]')).toBeVisible();
  const listFactoryDrones = page.locator('[data-schedule-view="list"] [data-room-title="制造站 1"]').getByRole("button", { name: "制造站 1 无人机加速" });
  await listFactoryDrones.hover();
  await expect(page.getByText("取消当前班次无人机加速", { exact: true })).toBeVisible();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await expect(page.locator('[data-schedule-view="compact"]')).toBeVisible();
  await expect(trade.getByRole("button", { name: "空置" }).first()).toContainText("可编辑");
  await trade.getByRole("button", { name: "空置" }).first().click();
  let operatorPicker = page.getByRole("dialog");
  await expect(operatorPicker.getByRole("button", { name: "筛选贸易站" })).toHaveAttribute("aria-pressed", "true");
  await operatorPicker.getByRole("button", { name: "筛选贸易站" }).click();
  await expect(operatorPicker.getByRole("button", { name: "筛选贸易站" })).toHaveAttribute("aria-pressed", "true");
  await operatorPicker.getByRole("button", { name: "显示全部工作房间" }).click();
  await expect(operatorPicker.getByRole("button", { name: "显示全部工作房间" })).toHaveAttribute("aria-pressed", "true");
  await expect(operatorPicker.getByText("技能标签", { exact: true })).toBeVisible();
  await expect(operatorPicker.getByText("暂无可选标签", { exact: true })).toBeVisible();
  await operatorPicker.getByLabel("搜索可选干员或基建技能").fill("阿米娅");
  await operatorPicker.getByRole("button", { name: /阿米娅/ }).click();
  const editableAmiyaSlot = trade.getByRole("button", { name: /阿米娅/ });
  await expect(editableAmiyaSlot).toBeVisible();
  await expect(editableAmiyaSlot.locator("button")).toHaveCount(0);

  await trade.getByRole("button", { name: "空置" }).first().click();
  operatorPicker = page.getByRole("dialog");
  await operatorPicker.getByRole("button", { name: "显示全部工作房间" }).click();
  await operatorPicker.getByLabel("搜索可选干员或基建技能").fill("锡兰");
  await operatorPicker.getByRole("button", { name: /锡兰/ }).click();
  await trade.getByRole("button", { name: /阿米娅/ }).click();
  operatorPicker = page.getByRole("dialog");
  await operatorPicker.getByRole("button", { name: "显示全部工作房间" }).click();
  await operatorPicker.getByLabel("搜索可选干员或基建技能").fill("阿米娅");
  await expect(operatorPicker.locator('[data-current-selection=""]')).toContainText("贸易站 1");
  await operatorPicker.getByRole("button", { name: /阿米娅/ }).click();
  await expect(trade.getByRole("button", { name: /阿米娅/ })).toBeVisible();

  await trade.getByRole("button", { name: /锡兰/ }).click();
  operatorPicker = page.getByRole("dialog");
  await operatorPicker.getByRole("button", { name: "显示全部工作房间" }).click();
  await operatorPicker.getByLabel("搜索可选干员或基建技能").fill("阿米娅");
  await operatorPicker.getByRole("button", { name: /阿米娅/ }).click();
  await expect(trade.locator('[data-operator-identity]')).toHaveCount(3);
  const orderedIdentities = await trade.locator('[data-operator-identity]').evaluateAll((elements) => (
    elements.map((element) => element.getAttribute("data-operator-identity"))
  ));
  expect(orderedIdentities.slice(0, 3)).toEqual(["锡兰", "阿米娅", "empty"]);

  await factory.getByRole("button", { name: "空置" }).first().click();
  operatorPicker = page.getByRole("dialog");
  await expect(operatorPicker.getByRole("button", { name: "筛选制造站" })).toHaveAttribute("aria-pressed", "true");
  await operatorPicker.getByRole("button", { name: "显示全部工作房间" }).click();
  await operatorPicker.getByLabel("搜索可选干员或基建技能").fill("阿米娅");
  await operatorPicker.getByRole("button", { name: /阿米娅/ }).click();
  const moveDialog = page.getByRole("dialog", { name: "移动该干员？" });
  await expect(moveDialog).toContainText("已经在贸易站 1工作");
  await moveDialog.getByRole("button", { name: "移动干员" }).click();
  await expect(trade.locator('[data-operator-identity="阿米娅"]')).toHaveCount(0);
  await expect(factory.locator('[data-operator-identity="阿米娅"]')).toBeVisible();
  await factory.getByRole("button", { name: "一键清空制造站 1" }).click();
  await expect(factory.locator('[data-operator-identity="阿米娅"]')).toHaveCount(0);
  await expect(factoryDrones).toHaveAttribute("aria-pressed", "true");

  const dorm = page.locator('[data-room-title="宿舍 1"]');
  await expect(dorm.locator('[data-operator-identity="autofill"]')).toHaveCount(5);
  const dormAutofill = dorm.getByRole("button", { name: "宿舍 1 自动补位" });
  await expect(dormAutofill).toHaveAttribute("aria-pressed", "true");
  await dormAutofill.click();
  await expect(dorm.locator('[data-operator-identity="autofill"]')).toHaveCount(0);
  await expect(dormAutofill).toHaveAttribute("aria-pressed", "false");
  await dormAutofill.click();
  await expect(dorm.locator('[data-operator-identity="autofill"]')).toHaveCount(5);
  await dorm.getByRole("button", { name: "一键清空宿舍 1" }).click();
  await expect(dorm.locator('[data-operator-identity="autofill"]')).toHaveCount(0);
  await expect(dormAutofill).toHaveAttribute("aria-pressed", "false");

  await page.getByRole("tab", { name: /班次 2.*20:00至08:14.*12小时15分钟/ }).click();
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
  expect(exported.plans[0].drones).toEqual({ enable: true, room: "manufacture", index: 1, rule: "all", order: "pre" });
  expect(exported.plans[1].drones).toBeUndefined();
  for (const plan of exported.plans) {
    for (const rooms of Object.values(plan.rooms) as Array<Array<{ operators: unknown[] }>>) {
      for (const room of rooms) expect(room.operators.every((operator) => typeof operator === "string")).toBe(true);
    }
  }
});

test("manual scheduling previews and imports an external MAA schedule file", async ({ page }) => {
  await page.goto("/manual");
  await expect(page.locator('[data-workbench-hydrated="true"]')).toBeVisible();
  await expect(page.locator("[data-manual-schedule-page]")).toBeVisible();

  const importedSchedule = {
    title: "外部排版",
    plans: [
      { name: "白班", period: [["08:15", "19:59"]], rooms: { control: [{ operators: ["外部测试干员"] }] } },
      { name: "夜班", period: [["20:00", "23:59"], ["00:00", "08:14"]], rooms: { trading: [{ operators: ["锡兰"] }] } },
    ],
  };
  await page.getByLabel("选择 MAA 排版 JSON 文件").setInputFiles({
    name: "external-schedule.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(importedSchedule)),
  });

  const preview = page.getByRole("dialog", { name: "导入这个 MAA 排版？" });
  await expect(preview).toContainText("external-schedule.json");
  await expect(preview).toContainText("干员位置：2 / 2");
  await preview.getByRole("button", { name: "导入并替换草稿" }).click();

  await expect(page.getByRole("tab", { name: /班次 1.*08:15至19:59.*11小时45分钟/ })).toBeVisible();
  await expect(page.locator('[data-room-title="控制中枢"] [data-operator-identity="外部测试干员"]')).toBeVisible();
  await page.getByRole("tab", { name: /班次 2.*20:00至08:14.*12小时15分钟/ }).click();
  await expect(page.locator('[data-room-title="贸易站 1"] [data-operator-identity="锡兰"]')).toBeVisible();
});
