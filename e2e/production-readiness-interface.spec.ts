import { expect, test } from "@playwright/test";
import { requestId, diagnosticId, waitForOwnAnimations, gotoStable, expectVisibleNumbersUseNumberFont, profile, planData, scheduleVisualPlanData, sampleData, authenticatedSklandSnapshot, mockApis, openSklandOverview, seedPreferences, seedV4Session } from "./production-readiness.fixture";

test.beforeEach(async ({ page }) => {
  await page.route("**/api/auth/get-session", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      session: { id: "test-session", token: "test-token", userId: "test-user", expiresAt: new Date(Date.now() + 3_600_000).toISOString(), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
      user: { id: "test-user", name: "测试用户", email: "test@example.com", emailVerified: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
    }),
  }));
});

test("mobile interactive targets remain at least 44 CSS pixels", async ({ page }) => {
  await mockApis(page);
  await seedV4Session(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  const undersized = await page.locator('button:not(:disabled), a[href], input:not([type="hidden"]), [role="tab"]:not([aria-disabled="true"])').evaluateAll((elements) => (
    elements.flatMap((element) => {
      if (element.getAttribute("aria-label") === "Open Next.js Dev Tools") return [];
      if (element.closest("footer")) return [];
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      if (style.visibility === "hidden" || style.display === "none" || rect.width === 0 || rect.height === 0) return [];
      if (rect.width >= 44 && rect.height >= 44) return [];
      return [{
        name: element.getAttribute("aria-label") || element.textContent?.trim() || element.tagName,
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      }];
    })
  ));
  expect(undersized).toEqual([]);
});

test("skill query reveals results ten at a time only after manual expansion", async ({ page }) => {
  await mockApis(page);
  await seedPreferences(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/skills");

  const skillQuery = page.locator("[data-skill-query-page]");
  const results = skillQuery.locator('article[aria-label$="的基建技能"]');
  const loadMore = skillQuery.locator("[data-load-more]");
  const expandButton = loadMore.getByRole("button", { name: /再展开 10 名/ });

  await expect(skillQuery).toBeVisible();
  await expect(results).toHaveCount(10);
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await page.waitForTimeout(300);
  await expect(results).toHaveCount(10);
  await expect(expandButton).toBeVisible();

  await expandButton.click();
  await expect(results).toHaveCount(20);
  await expandButton.click();
  await expect(results).toHaveCount(30);
});

test("an empty generated profile explains that no training action is needed", async ({ page }) => {
  await mockApis(page);
  await seedV4Session(page);
  await page.goto("/");
  await expect(page.locator('[data-workbench-hydrated="true"]')).toBeVisible();
  await page.getByRole("button", { name: "练卡建议" }).click();

  await expect(page.getByRole("heading", { name: "本次排班暂无培养建议" })).toBeVisible();
  await expect(page.getByText("当前干员与布局没有需要优先培养的项目，可以继续使用现有排班。")).toBeVisible();
  await expect(page.getByRole("button", { name: "查看当前排班" })).toBeVisible();
  await expect(page.getByText("先导入干员数据、确认基建布局并生成一次排班。")).toHaveCount(0);
});

test("setup keeps Box parse errors local and actionable", async ({ page }) => {
  await mockApis(page, {
    sklandConfigured: true,
    sklandSnapshot: authenticatedSklandSnapshot,
  });
  await seedV4Session(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  await expect(page.locator("[data-plan-board]")).toHaveAttribute("data-plan-revision", diagnosticId);
  const moreTools = page.locator("[data-calculator-more-tools]");
  await moreTools.getByText("更多工具", { exact: true }).click();
  const setupTrigger = moreTools.getByRole("button", { name: "配置Box与布局" });
  await setupTrigger.click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: /第 1 步，共 3 步：干员数据/ }).click();
  await expect(dialog.locator(".setup-data-summary")).toHaveCount(1);
  await dialog.getByRole("button", { name: "更换", exact: true }).click();
  await page.getByRole("tab", { name: "森空岛", exact: true }).click();
  await expect(dialog.locator(".setup-import-action")).toHaveCount(1);
  await page.getByRole("tab", { name: "MAA", exact: true }).click();
  await dialog.getByRole("button", { name: "粘贴 JSON", exact: true }).click();
  const [boxContentBox, boxViewportBox] = await Promise.all([
    dialog.locator("[data-setup-box-content]").boundingBox(),
    dialog.locator('[data-slot="scroll-area-viewport"]:visible').boundingBox(),
  ]);
  expect(boxContentBox).not.toBeNull();
  expect(boxViewportBox).not.toBeNull();
  expect(boxContentBox?.width).toBeCloseTo(boxViewportBox?.width ?? 0, 0);
  const textarea = dialog.getByPlaceholder("粘贴 Arknights_OperBox_Export.json 内容");
  await textarea.fill("not valid json");
  await dialog.getByRole("button", { name: "导入 JSON" }).click();

  await expect(textarea).toHaveAttribute("aria-invalid", "true");
  await expect(dialog.locator('[role="alert"]')).toHaveCount(1);
  await expect.poll(() => page.locator('[role="alert"]').evaluateAll((elements) => (
    elements.filter((element) => element.textContent?.trim()).length
  ))).toBe(1);
  await dialog.getByRole("button", { name: "Close" }).click();
  await expect(dialog).toBeHidden();
  await expect(setupTrigger).toBeFocused();
});

test("fresh MAA import requires one facility review before completion", async ({ page }) => {
  await mockApis(page);
  await seedPreferences(page);
  await page.goto("/");

  await expect(page.locator('[data-workbench-hydrated="true"]')).toBeVisible();
  await page.getByRole("button", { name: "配置Box与布局" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("tab", { name: "MAA", exact: true }).click();
  await dialog.getByRole("button", { name: "粘贴 JSON", exact: true }).click();
  await dialog.getByLabel("JSON 内容").fill(JSON.stringify(sampleData));
  await dialog.getByRole("button", { name: "导入 JSON", exact: true }).click();

  await expect(dialog.getByRole("button", { name: /第 2 步，共 3 步：布局/ })).toHaveAttribute("aria-current", "step");
  await expect(dialog.getByRole("button", { name: "检查设施", exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: "检查设施", exact: true }).click();
  await expect(dialog.getByRole("button", { name: /第 3 步，共 3 步：设施/ })).toHaveAttribute("aria-current", "step");
  await expect(dialog.getByRole("button", { name: "完成", exact: true })).toBeEnabled();
});

test("setup always reopens on operator data, including from the Skland overview", async ({ page }) => {
  await mockApis(page, {
    sklandConfigured: true,
    sklandSnapshot: authenticatedSklandSnapshot,
  });
  await seedV4Session(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");

  const setupTrigger = page.getByRole("button", { name: "配置Box与布局" }).first();
  await setupTrigger.click();
  const dialog = page.getByRole("dialog");
  const boxStep = dialog.getByRole("button", { name: /第 1 步，共 3 步：干员数据/ });
  await expect(boxStep).toHaveAttribute("aria-current", "step");
  await dialog.getByRole("button", { name: "继续", exact: true }).click();
  await expect(dialog.getByRole("button", { name: /第 2 步，共 3 步：布局/ })).toHaveAttribute("aria-current", "step");
  await dialog.getByRole("button", { name: "Close" }).click();
  await expect(dialog).toHaveCount(0);

  await setupTrigger.click();
  await expect(boxStep).toHaveAttribute("aria-current", "step");
  await dialog.getByRole("button", { name: "Close" }).click();

  await openSklandOverview(page);
  await page.getByRole("button", { name: "继续配置布局", exact: true }).click();
  await expect(dialog).toBeVisible();
  await expect(boxStep).toHaveAttribute("aria-current", "step");
});

test("setup with an empty BOX starts on operator data", async ({ page }) => {
  await mockApis(page);
  await seedPreferences(page);
  await page.goto("/");

  await page.getByRole("button", { name: "配置Box与布局" }).first().click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("button", { name: /第 1 步，共 3 步：干员数据/ })).toHaveAttribute("aria-current", "step");
});

test("setup exposes and persists only worker-supported rotation profiles", async ({ page }) => {
  await mockApis(page);
  await seedV4Session(page);
  let planRequests = 0;
  let requestedRotation: unknown;
  let requestedOperbox: unknown;
  let requestedSourceName: unknown;
  let requestedBoxSource: unknown;
  await page.route("**/api/plan", async (route) => {
    planRequests += 1;
    const requestBody = route.request().postDataJSON() as {
      rotation?: unknown;
      operbox?: unknown;
      sourceName?: unknown;
      boxSource?: unknown;
    };
    requestedRotation = requestBody.rotation;
    requestedOperbox = requestBody.operbox;
    requestedSourceName = requestBody.sourceName;
    requestedBoxSource = requestBody.boxSource;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, data: planData, requestId }),
    });
  });

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await page.getByRole("button", { name: "配置Box与布局" }).first().click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toHaveClass(/dialog-acrylic/);
  await expect(dialog.locator("[data-setup-top]")).toBeVisible();
  await expect(dialog.getByText("导入干员数据，再确认换班方式与基建设施。修改会立即应用，但不会自动生成排班。")).toHaveCount(0);
  await expect(dialog.locator("[data-setup-footer]")).toBeVisible();
  await expect(dialog.locator("[data-setup-footer]")).toHaveClass(/setup-dialog-footer/);
  await expect(dialog).toHaveCSS("border-radius", "32px");
  const dialogMaterial = await dialog.evaluate((element) => ({
    shadow: getComputedStyle(element).boxShadow,
    texture: getComputedStyle(element, "::before").backgroundImage,
  }));
  expect(dialogMaterial.texture).toContain("repeating-linear-gradient");
  expect(dialogMaterial.texture).toContain("60px");
  expect(dialogMaterial.shadow).toContain("0px 0px 44px");
  await expect(dialog).toHaveCSS("width", "880px");
  const setupPrimaryAction = dialog.getByRole("button", { name: "继续", exact: true });
  await expect(setupPrimaryAction).toHaveCSS("width", "196px");
  await expect(setupPrimaryAction).toHaveCSS("height", "46px");
  await expect(setupPrimaryAction).toHaveCSS("border-radius", "22px");
  await expect(setupPrimaryAction).toHaveCSS("font-size", "13px");
  await expect(setupPrimaryAction.locator("svg")).toHaveCount(0);
  await expect(dialog.getByRole("heading", { name: "排班设置" })).toBeVisible();
  const closeButton = dialog.getByRole("button", { name: "Close" });
  await expect(closeButton).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await closeButton.hover();
  await expect(closeButton).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await expect(dialog.getByText("森空岛、MAA 或测试样例", { exact: true })).toHaveCount(0);
  await expect(dialog.getByText("布局、换班、等级、产品和订单", { exact: true })).toHaveCount(0);
  const stepList = dialog.getByRole("list", { name: "设置步骤" });
  await expect(stepList.locator(":scope > *")).toHaveCount(3);
  expect((await stepList.boundingBox())?.width ?? 0).toBeGreaterThan(600);
  await expect(dialog).toHaveCSS("height", "660px");
  const initialStepListBox = await stepList.boundingBox();
  await dialog.getByRole("button", { name: /第 1 步，共 3 步：干员数据/ }).click();
  await dialog.getByRole("button", { name: "更换", exact: true }).click();
  await expect(dialog.locator("#setup-import-options")).toBeVisible();
  await expect(dialog).toHaveCSS("height", "660px");
  await dialog.getByRole("tab", { name: "手动选择", exact: true }).click();
  const manualPicker = dialog.locator("[data-manual-operbox-picker]");
  const manualHeading = manualPicker.getByRole("heading", { name: "手动选择干员 Box" });
  await expect(manualHeading).toBeVisible();
  await expect(manualHeading.locator("svg")).toHaveCount(0);
  const manualActions = manualPicker.locator("[data-manual-operbox-actions]");
  const manualActionButtons = [
    manualPicker.getByRole("button", { name: "只看已拥有", exact: true }),
    manualPicker.getByRole("button", { name: "全选最高精英", exact: true }),
    manualPicker.getByRole("button", { name: "清空选择", exact: true }),
  ];
  await expect(manualActions).toHaveCSS("grid-template-columns", /.+ .+ .+/);
  const manualActionBoxes = await Promise.all(manualActionButtons.map((button) => button.boundingBox()));
  expect(new Set(manualActionBoxes.map((box) => Math.round(box?.y ?? -1))).size).toBe(1);
  const manualStageGroup = manualPicker.getByRole("radiogroup").first();
  for (const status of [
    { name: "未拥有", color: "rgb(113, 113, 122)" },
    { name: "精0", color: "rgb(34, 187, 255)" },
    { name: "精1", color: "rgb(184, 240, 58)" },
    { name: "精2", color: "rgb(255, 216, 0)" },
  ]) {
    const stageButton = manualStageGroup.getByRole("radio", { name: status.name, exact: true });
    await stageButton.click();
    await expect(stageButton).toHaveAttribute("aria-checked", "true");
    await expect(stageButton).toHaveCSS("background-color", status.color);
    await expect(stageButton).toHaveCSS("height", "28px");
    await expect(stageButton).toHaveCSS("border-radius", "4px");
  }
  await manualPicker.getByRole("button", { name: "全选最高精英", exact: true }).click();
  await expect(manualPicker.getByText("已拥有 425 名", { exact: true })).toBeVisible();
  const manualApplyButtons = manualPicker.locator("[data-manual-operbox-apply]");
  await expect(manualApplyButtons).toHaveCount(2);
  for (const manualApplyButton of await manualApplyButtons.all()) {
    await expect(manualApplyButton).toBeEnabled();
    await expect(manualApplyButton).toHaveCSS("height", "36px");
    await expect(manualApplyButton).toHaveCSS("border-radius", "18px");
    await expect(manualApplyButton).toHaveCSS("font-size", "12px");
  }
  await page.setViewportSize({ width: 390, height: 844 });
  const narrowActionBoxes = await Promise.all(manualActionButtons.map((button) => button.boundingBox()));
  expect(new Set(narrowActionBoxes.map((box) => Math.round(box?.y ?? -1))).size).toBe(1);
  expect(narrowActionBoxes.every((box) => box !== null && box.x >= 0 && box.x + box.width <= 390)).toBe(true);
  await page.setViewportSize({ width: 1440, height: 900 });
  await manualApplyButtons.first().click();
  await expect(manualPicker).toHaveCount(0);
  const layoutStepListBox = await stepList.boundingBox();
  expect(layoutStepListBox?.y ?? -1).toBeCloseTo(initialStepListBox?.y ?? -1, 0);
  const completedDataStep = dialog.getByRole("button", { name: /第 1 步，共 3 步：干员数据/ });
  await expect(completedDataStep.locator("svg")).toHaveCount(1);

  const selectedPreset = dialog.getByRole("button", { name: /^243/ });
  await expect(selectedPreset).toHaveAttribute("aria-pressed", "true");
  await expect(selectedPreset).toHaveCSS("background-color", "rgb(48, 48, 39)");
  await expect(selectedPreset).toHaveCSS("box-shadow", "none");
  const presetColumns = await dialog
    .getByRole("group", { name: "布局预设" })
    .evaluate((element) => getComputedStyle(element).gridTemplateColumns);
  expect(presetColumns.split(" ").filter(Boolean)).toHaveLength(5);

  const rotationTrigger = dialog.getByRole("combobox", { name: "换班方式" });
  await rotationTrigger.click();
  await waitForOwnAnimations(page.locator('[data-slot="combobox-content"]'));
  const [triggerBox, popupBox] = await Promise.all([
    rotationTrigger.locator("xpath=..").boundingBox(),
    page.locator('[data-slot="combobox-content"]').boundingBox(),
  ]);
  expect(triggerBox).not.toBeNull();
  expect(popupBox).not.toBeNull();
  expect(Math.abs((triggerBox?.x ?? 0) - (popupBox?.x ?? 0))).toBeLessThanOrEqual(1);
  expect(popupBox?.width).toBeCloseTo(triggerBox?.width ?? 0, 0);
  await expect(dialog.locator('[data-slot="select-trigger"]')).toHaveCount(0);
  await expect(page.getByRole("option", { name: /自动轮换/ })).toHaveCount(0);
  await expect(page.getByRole("option", { name: /一天两换/ })).toHaveCount(1);
  await expect(page.getByRole("option", { name: /自定义/ })).toHaveCount(0);
  await expect(page.getByRole("option")).toHaveCount(3);
  await expect(rotationTrigger).toHaveJSProperty("readOnly", true);
  await page.getByRole("option", { name: /一天两换/ }).click();
  await expect(rotationTrigger).toHaveValue("一天两换 · 12/12/12");
  await rotationTrigger.click();
  await expect(page.locator('[data-slot="combobox-content"]')).toBeVisible();
  await expect(page.getByRole("option")).toHaveCount(3);
  await rotationTrigger.press("Escape");
  await expect(rotationTrigger).toHaveValue("一天两换 · 12/12/12");
  await expect(dialog.getByText("完整循环 24 小时")).toHaveCount(0);
  await expect(dialog.getByText("第 4 班 4h")).toHaveCount(0);
  await dialog.getByRole("button", { name: "检查设施", exact: true }).click();
  await dialog.getByRole("button", { name: "完成", exact: true }).click();

  await page.getByRole("button", { name: "生成排班" }).click();
  await expect.poll(() => planRequests).toBe(1);
  expect(requestedRotation).toBe("abc_12_12_12");
  expect(requestedSourceName).toBe("手动选择的 Box");
  expect(requestedBoxSource).toBe("maa");
  expect(Array.isArray(requestedOperbox)).toBe(true);
  expect(requestedOperbox).toHaveLength(425);
  expect(new Set((requestedOperbox as Array<{ id: string }>).map((operator) => operator.id)).size).toBe(425);
  expect((requestedOperbox as Array<{ own: boolean }>).every((operator) => operator.own)).toBe(true);
  const persisted = await page.evaluate(() => JSON.parse(
    window.localStorage.getItem("arknights-infra-calc-session-v5") ?? "{}"
  ));
  expect(persisted.rotationProfile).toBe("abc_12_12_12");
  expect(persisted.sourceName).toBe("手动选择的 Box");
  expect(persisted.boxSource).toBe("maa");
  expect(persisted.operbox).toHaveLength(425);
});

test("layout level controls clamp edits and expose the power-safe 342 defaults", async ({ page }) => {
  await mockApis(page);
  await seedV4Session(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");

  await page.getByRole("button", { name: "配置Box与布局" }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "继续", exact: true }).click();

  await dialog.getByRole("button", { name: /^342/ }).click();
  await expect(dialog.getByRole("button", { name: "检查设施", exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: "检查设施", exact: true }).click();

  const tradeGroup = dialog.locator('[data-facility-group="trade"]');
  const factoryGroup = dialog.locator('[data-facility-group="factory"]');
  const functionGroup = dialog.locator('[data-facility-group="function"]');
  await expect(tradeGroup.locator('[data-slot="accordion-trigger"]')).toHaveAttribute("aria-expanded", "true");
  await expect(factoryGroup.locator('[data-slot="accordion-trigger"]')).toHaveAttribute("aria-expanded", "true");
  await expect(functionGroup.locator('[data-slot="accordion-trigger"]')).toHaveAttribute("aria-expanded", "false");

  await functionGroup.locator('[data-slot="accordion-trigger"]').click();
  const controlLevel = dialog.locator('input[aria-label="control 等级"]:visible');
  await expect(controlLevel).toHaveValue("5");
  await dialog.getByRole("button", { name: "control 等级减一" }).click();
  await expect(controlLevel).toHaveValue("4");
  await controlLevel.fill("999");
  await controlLevel.press("Enter");
  await expect(controlLevel).toHaveValue("5");

  await dialog.locator('[data-facility-group="power"] [data-slot="accordion-trigger"]').click();
  await dialog.locator('[data-facility-group="dormitory"] [data-slot="accordion-trigger"]').click();
  if (await tradeGroup.locator('[data-slot="accordion-trigger"]').getAttribute("aria-expanded") !== "true") {
    await tradeGroup.locator('[data-slot="accordion-trigger"]').click();
  }
  if (await factoryGroup.locator('[data-slot="accordion-trigger"]').getAttribute("aria-expanded") !== "true") {
    await factoryGroup.locator('[data-slot="accordion-trigger"]').click();
  }
  const activeTradeOrder = dialog.getByRole("group", { name: "贸易站 1 订单" }).getByRole("button", { name: "龙门商法" });
  await expect(activeTradeOrder).toHaveAttribute("aria-pressed", "true");
  await expect(dialog.locator('[data-slot="setup-room-row"]')).toHaveCount(18);
  await expect(dialog.locator('[data-slot="setup-room-row"][data-room-group="trading"]')).toHaveCount(3);
  await expect(dialog.locator('[data-slot="setup-room-row"][data-room-group="manufacture"]')).toHaveCount(4);
  await expect(dialog.locator('[data-slot="setup-room-row"][data-room-group="power"]')).toHaveCount(2);
  await expect(dialog.locator('input[aria-label="trade_2 等级"]:visible')).toHaveValue("2");
  await expect(dialog.locator('input[aria-label="dorm_1 等级"]:visible')).toHaveValue("2");
  const normalPowerStatus = dialog.getByText("电力正常 · 540/540", { exact: true });
  await expect(normalPowerStatus).toBeVisible();
  await expect(normalPowerStatus).toHaveClass(/text-emerald-700/);

  const lowerFactoryRecipe = dialog.getByRole("group", { name: "制造站 3 配方" });
  await lowerFactoryRecipe.getByRole("button", { name: "源石碎片" }).click();
  await expect(lowerFactoryRecipe.getByRole("button", { name: "源石碎片" })).toHaveAttribute("aria-pressed", "true");
  for (const roomId of ["manu_1", "manu_2"]) {
    const level = dialog.locator(`input[aria-label="${roomId} 等级"]:visible`);
    await level.fill("2");
    await level.press("Enter");
    await expect(level).toHaveValue("2");
  }
  await expect(lowerFactoryRecipe.getByRole("button", { name: "贵金属" })).toHaveAttribute("aria-pressed", "true");
  await expect(lowerFactoryRecipe.getByRole("button", { name: "源石碎片" })).toBeDisabled();

  await page.setViewportSize({ width: 768, height: 900 });
  const mediumOverflow = await dialog.evaluate((element) => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
  }));
  expect(mediumOverflow.scrollWidth).toBeLessThanOrEqual(mediumOverflow.clientWidth);

  await page.setViewportSize({ width: 390, height: 844 });
  const footerBox = await dialog.locator("[data-setup-footer]").boundingBox();
  expect(footerBox?.height ?? Infinity).toBeLessThanOrEqual(68);
  expect((footerBox?.y ?? Infinity) + (footerBox?.height ?? Infinity)).toBeLessThanOrEqual(844);
  expect(await activeTradeOrder.evaluate((element) => element.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
  const mobileTradeLevel = dialog.locator('input[aria-label="trade_2 等级"]:visible');
  await mobileTradeLevel.click();
  const firstLevelOption = page.getByRole("option", { name: "1", exact: true });
  await waitForOwnAnimations(page.locator('[data-slot="combobox-content"]'));
  const [levelFieldBox, levelPopupBox] = await Promise.all([
    mobileTradeLevel.locator("xpath=..").boundingBox(),
    page.locator('[data-slot="combobox-content"]').boundingBox(),
  ]);
  expect(levelPopupBox?.width).toBeCloseTo(levelFieldBox?.width ?? 0, 0);
  expect(await firstLevelOption.evaluate((element) => element.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
  await firstLevelOption.click();
  await expect(mobileTradeLevel).toHaveValue("1");
});

test("calculator owns scheduling controls and training advice uses a single technical stream", async ({ page }) => {
  const adviceResult = {
    ...planData,
    profile: {
      ...profile,
      actions: [
        {
          priority: "高",
          kind: "promote",
          operator: "阿米娅",
          domain_id: "manufacture",
          message: "优先完成精英化与技能等级，补齐制造站轮换深度。",
        },
        {
          priority: "中",
          kind: "advice",
          operator: "凯尔希",
          domain_id: "power",
          message: "保留发电站轮换位，避免高心情干员长期空转。",
        },
      ],
    },
  };
  await mockApis(page);
  await seedV4Session(page, adviceResult);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await expect(page.locator('[data-workbench-hydrated="true"]')).toBeVisible();

  const calculatorControls = page.locator("[data-calculator-controls]");
  await expect(calculatorControls).toBeVisible();
  const exportMaa = page.getByRole("button", { name: "导出到 MAA" });
  await expect(exportMaa).toHaveCSS("height", "28px");
  const controlOrder = await calculatorControls.locator("button").allTextContents();
  expect(controlOrder.at(-1)).toContain("生成排班");
  expect(controlOrder.some((label) => label.includes("全角色导入"))).toBe(false);
  const exportOrder = await page.locator("[data-calculator-export-actions]").locator("button").allTextContents();
  expect(exportOrder).toHaveLength(2);
  expect(exportOrder.every((label) => label.includes("导出到 MAA"))).toBe(true);

  await page.getByRole("button", { name: "练卡建议" }).click();
  await expect(calculatorControls).toHaveCount(0);
  await expect(page.getByText("这里只展示求解器给出的结构化建议", { exact: false })).toHaveCount(0);
  await expect(page.locator('[data-slot="training-summary"]')).toHaveClass(/infra-room-surface/);
  await expect(page.locator('[data-slot="training-data-check"]')).toHaveClass(/infra-room-surface/);
  await expect(page.locator('[data-slot="training-summary"] svg')).toHaveCount(1);
  await expect(page.locator('[data-slot="training-data-check"] svg')).toHaveCount(1);
  await expect(page.locator('[data-slot^="training-"] .infra-room-emblem')).toHaveCount(0);
  const adviceCards = page.locator('[data-slot="training-advice-card"]');
  await expect(adviceCards).toHaveCount(2);
  await expect(adviceCards.locator("svg")).toHaveCount(0);
  const advicePortrait = adviceCards.locator('img[src^="/images/operator-portraits/"]').first();
  await expect(advicePortrait).toHaveAttribute("width", "80");
  await expect(advicePortrait).toHaveAttribute("height", "80");
  await expect(advicePortrait).toHaveAttribute("loading", "lazy");
  await expect(advicePortrait).toHaveAttribute("decoding", "async");
  const cardBoxes = await adviceCards.evaluateAll((elements) => elements.map((element) => {
    const box = element.getBoundingClientRect();
    return { left: box.left, top: box.top, width: box.width };
  }));
  expect(cardBoxes[0].left).toBeCloseTo(cardBoxes[1].left, 0);
  expect(cardBoxes[0].width).toBeCloseTo(cardBoxes[1].width, 0);
  expect(cardBoxes[1].top).toBeGreaterThan(cardBoxes[0].top);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Toggle Sidebar" }).click();
  await page.getByRole("button", { name: "基建计算器" }).click();
  const mobileHeights = await Promise.all([
    page.locator('[data-calculator-export-actions="mobile"]').getByRole("button", { name: "导出到 MAA" }).evaluate((element) => element.getBoundingClientRect().height),
    page.getByRole("button", { name: "生成排班" }).evaluate((element) => element.getBoundingClientRect().height),
  ]);
  expect(Math.min(...mobileHeights)).toBeGreaterThanOrEqual(44 - 0.01);
});

test("schedule visuals use a stable technical canvas and responsive level markers", async ({ page }) => {
  await mockApis(page);
  await seedV4Session(page, scheduleVisualPlanData, { boxSource: "maa" });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");

  const canvas = page.locator("[data-infra-canvas]");
  const roomSurface = page.locator(".infra-room-surface").first();
  const listDiamonds = page.locator('.level-diamonds[data-variant="list"]').first();
  const listViewTab = page.getByRole("tab", { name: "列表式布局" });
  const compactViewTab = page.getByRole("tab", { name: "一图流布局" });

  await expect(canvas).toBeVisible({ timeout: 15_000 });
  await expect(roomSurface).toBeVisible();
  await expect(compactViewTab).toHaveAttribute("aria-selected", "true");
  await listViewTab.click();
  await expect(listViewTab).toHaveAttribute("aria-selected", "true");
  await expect(listDiamonds).toBeVisible();

  const buildingSkillBadge = page.getByRole("button", { name: /基建技能 S1：合作协议/ }).first();
  await expect(buildingSkillBadge).toBeVisible();
  await buildingSkillBadge.focus();
  await expect(page.getByText("S1 · 合作协议").first()).toBeVisible();
  await expect(page.getByText(/所有贸易站订单效率\+7%/).first()).toBeVisible();
  await expect(page.getByLabel("基建技能 S99，暂无技能资料").first()).toBeVisible();
  await expect.poll(() => page.locator('img[src^="/images/building-skills/"]').first().evaluate(
    (image) => (image as HTMLImageElement).naturalWidth
  )).toBe(36);
  const operatorPortrait = page.locator('img[src^="/images/operator-portraits/"]').first();
  await expect(operatorPortrait).toHaveAttribute("src", /\.webp\?v=\d+-[0-9a-f]{12}$/);
  await expect(operatorPortrait).toHaveAttribute("width", "180");
  await expect(operatorPortrait).toHaveAttribute("height", "180");
  await expect(operatorPortrait).toHaveAttribute("loading", "lazy");
  await expect(operatorPortrait).toHaveAttribute("decoding", "async");

  const visualStyles = await page.evaluate(() => {
    const room = document.querySelector<HTMLElement>(".infra-room-surface");
    if (!room) throw new Error("Missing room surface");
    const surface = getComputedStyle(room);
    const mesh = getComputedStyle(room, "::before");
    const emblem = room.querySelector<HTMLElement>(".infra-room-emblem");
    if (!emblem) throw new Error("Missing room emblem");
    const emblemStyle = getComputedStyle(emblem);
    return {
      bodyFont: getComputedStyle(document.body).fontFamily,
      backdropFilter: surface.backdropFilter
        || (surface as CSSStyleDeclaration & { webkitBackdropFilter?: string }).webkitBackdropFilter,
      surfaceBackground: surface.backgroundColor,
      meshMask: mesh.maskImage || mesh.webkitMaskImage,
      emblemImage: emblemStyle.backgroundImage,
      emblemBackgroundSize: emblemStyle.backgroundSize,
      emblemOpacity: emblemStyle.opacity,
      emblemFilter: emblemStyle.filter,
      emblemBlendMode: emblemStyle.mixBlendMode,
    };
  });
  expect(visualStyles.bodyFont).toContain("Microsoft YaHei");
  expect(visualStyles.bodyFont).toContain("PingFang SC");
  expect(visualStyles.bodyFont).not.toContain("Segoe UI");
  expect(visualStyles.backdropFilter).toBe("none");
  expect(visualStyles.surfaceBackground).toBe("rgb(39, 42, 43)");
  expect(visualStyles.meshMask).toContain("facility-grid.svg");
  expect(visualStyles.emblemImage).toContain("building-room-emblems/emblem_");
  expect(visualStyles.emblemImage).toContain(".png");
  expect(visualStyles.emblemBackgroundSize).toBe("auto 100%");
  expect(visualStyles.emblemOpacity).toBe("0.16");
  expect(visualStyles.emblemFilter).toBe("none");
  expect(visualStyles.emblemBlendMode).toBe("normal");

  const listBox = await listDiamonds.boundingBox();
  expect(listBox?.height).toBeCloseTo(20, 0);
  const listDiamondBox = await listDiamonds.locator(".level-diamond").first().boundingBox();
  expect(listDiamondBox?.width).toBeCloseTo(10, 0);

  await compactViewTab.click();
  const compactDiamonds = page.locator('.level-diamonds[data-variant="compact"]').first();
  await expect(compactDiamonds).toBeVisible();
  const compactProductBadge = page.locator("[data-compact-product-badge]").first();
  const compactFeedbackButton = page.getByRole("button", { name: /反馈排班问题/ }).first();
  await expect(compactProductBadge).toBeVisible();
  await expect(compactFeedbackButton).toBeVisible();
  const [compactProductBox, compactFeedbackBox] = await Promise.all([
    compactProductBadge.boundingBox(),
    compactFeedbackButton.boundingBox(),
  ]);
  expect(compactProductBox).not.toBeNull();
  expect(compactFeedbackBox).not.toBeNull();
  expect((compactProductBox?.x ?? 0) + (compactProductBox?.width ?? 0)).toBeLessThanOrEqual((compactFeedbackBox?.x ?? 0) - 8);
  await compactFeedbackButton.click();
  const compactFeedbackDialog = page.getByRole("dialog");
  await expect(compactFeedbackDialog).toBeVisible();
  await expect(compactFeedbackDialog.getByText("反馈排班问题", { exact: true })).toBeVisible();
  await compactFeedbackDialog.getByRole("button", { name: "取消" }).click();
  await expect(compactFeedbackDialog).toHaveCount(0);
  const compactBox = await compactDiamonds.boundingBox();
  expect(compactBox?.height).toBeCloseTo(14, 0);
  const compactDiamondBox = await compactDiamonds.locator(".level-diamond").first().boundingBox();
  expect(compactDiamondBox?.width).toBeCloseTo(7.5, 0);

  await listViewTab.click();
  await page.setViewportSize({ width: 768, height: 900 });
  await expect(compactViewTab).toHaveCount(0);
  await expect(listViewTab).toHaveCount(0);
  await expect(page.locator('[data-schedule-view="list"]')).toBeVisible();
  const tabletOperatorGrid = page.locator(".infra-list-operator-grid").first();
  await expect(tabletOperatorGrid).toBeVisible();
  const tabletGridSize = await tabletOperatorGrid.evaluate((element) => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
  }));
  expect(tabletGridSize.scrollWidth).toBeLessThanOrEqual(tabletGridSize.clientWidth);
  const tabletTradeRoom = page.locator('[data-room-group="trading"]').first();
  const tabletTradeLayout = await tabletTradeRoom.evaluate((element) => ({
    flexDirection: getComputedStyle(element).flexDirection,
  }));
  expect(tabletTradeLayout.flexDirection).toBe("column");
  const tabletTradeSections = tabletTradeRoom.locator(":scope > div");
  const tabletTradeSummaryBox = await tabletTradeSections.nth(0).boundingBox();
  const tabletTradeOccupancyBox = await tabletTradeSections.nth(1).boundingBox();
  expect(tabletTradeSummaryBox).not.toBeNull();
  expect(tabletTradeOccupancyBox).not.toBeNull();
  expect(tabletTradeOccupancyBox!.y).toBeGreaterThanOrEqual(
    tabletTradeSummaryBox!.y + tabletTradeSummaryBox!.height - 1.5
  );

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(compactViewTab).toHaveCount(0);
  await expect(listViewTab).toHaveCount(0);
  const mobileDiamonds = page.locator('.level-diamonds[data-variant="list"]').first();
  await expect(mobileDiamonds).toBeVisible();
  const mobileBox = await mobileDiamonds.boundingBox();
  expect(mobileBox?.height).toBeCloseTo(16, 0);
  const mobileDiamondBox = await mobileDiamonds.locator(".level-diamond").first().boundingBox();
  expect(mobileDiamondBox?.width).toBeCloseTo(8, 0);
  const mobileSkillBox = await buildingSkillBadge.boundingBox();
  expect(mobileSkillBox?.width).toBeGreaterThanOrEqual(44);
  expect(mobileSkillBox?.height).toBeGreaterThanOrEqual(44);
});

test("self-hosts Bender Bold for technical numbers while preserving UI-font exceptions", async ({ page }) => {
  await mockApis(page, {
    sklandConfigured: true,
    sklandSnapshot: authenticatedSklandSnapshot,
  });
  await seedV4Session(page, scheduleVisualPlanData);
  const fontRequests: string[] = [];
  page.on("request", (request) => {
    if (request.resourceType() === "font") fontRequests.push(request.url());
  });

  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  await expect(page.locator("[data-infra-canvas]")).toBeVisible({ timeout: 15_000 });

  for (const viewport of [
    { width: 390, height: 844 },
    { width: 768, height: 900 },
    { width: 1440, height: 1000 },
  ]) {
    await page.setViewportSize(viewport);
    await expectVisibleNumbersUseNumberFont(page);
    const dimensions = await page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }));
    expect(dimensions.scrollWidth, JSON.stringify({ viewport, dimensions })).toBeLessThanOrEqual(dimensions.clientWidth + 1);
  }

  await page.getByRole("button", { name: "配置Box与布局" }).first().click();
  const setupDialog = page.getByRole("dialog");
  await expect(setupDialog).toBeVisible();
  await expectVisibleNumbersUseNumberFont(page, setupDialog);
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: "练卡建议" }).click();
  await expect(page.getByRole("heading", { name: "训练建议" })).toBeVisible();
  await expectVisibleNumbersUseNumberFont(page);

  await openSklandOverview(page);
  await expect(page.getByRole("heading", { name: "测试博士" }).first()).toBeVisible();
  await expectVisibleNumbersUseNumberFont(page);
  await page.getByRole("tab", { name: "基建", exact: true }).click();
  await expectVisibleNumbersUseNumberFont(page);

  for (const path of ["/privacy", "/terms"]) {
    await gotoStable(page, path);
    await expectVisibleNumbersUseNumberFont(page);
  }

  const loadedFontResources = await page.evaluate(() => performance.getEntriesByType("resource")
    .map((entry) => entry.name)
    .filter((url) => /\.(?:otf|woff2?)(?:\?|$)/i.test(url)));
  const allFontUrls = [...new Set([...fontRequests, ...loadedFontResources])];
  expect(allFontUrls.some((url) => /\.otf(?:\?|$)/i.test(url))).toBe(true);
  expect(allFontUrls.every((url) => new URL(url).origin === new URL(page.url()).origin)).toBe(true);
  expect(allFontUrls.join("\n")).not.toMatch(/1001fonts|fonts2u|fontsquirrel|hypergryph/i);
});

test("publishes the site terms and privacy policy with upstream policy links", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await gotoStable(page, "/privacy");
  await expect(page.getByRole("heading", { name: "隐私政策", level: 1 })).toBeVisible();
  await expect(page.getByText("版本与生效日期：2026-09-03")).toBeVisible();
  await expect(page.getByText(/服务端 CLI 运行记录最多保存 30 天/)).toBeVisible();
  await expect(page.getByText(/第一方体验分析会自动记录/)).toBeVisible();
  await expect(page.getByText(/30 天到期/)).toBeVisible();
  await expect(page.getByText("可露希尔基建终端项目维护者", { exact: false })).toBeVisible();
  await expect(page.getByRole("link", { name: "森空岛使用许可及服务协议" })).toHaveAttribute(
    "href",
    "https://assets.skland.com/protocols/agreement.html"
  );
  await expect(page.getByRole("link", { name: "森空岛个人信息保护政策" })).toHaveAttribute(
    "href",
    "https://assets.skland.com/protocols/privacy.html"
  );

  await gotoStable(page, "/terms");
  await expect(page.getByRole("heading", { name: "服务条款", level: 1 })).toBeVisible();
  await expect(page.getByText("版本与生效日期：2026-08-31")).toBeVisible();
  await expect(page.getByText(/非官方、非商业工具/)).toBeVisible();
});

test("automatic first-party telemetry sends only the disclosed browser whitelist", async ({ page }) => {
  const telemetryBatches: Array<Array<Record<string, unknown>>> = [];
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "sendBeacon", {
      configurable: true,
      value: () => false,
    });
  });
  await mockApis(page, { telemetryBatches });
  await page.goto("/");
  await expect.poll(() => page.evaluate(() => window.localStorage.getItem("arknights-infra-telemetry-session"))).not.toBeNull();
  await page.getByRole("button", { name: "练卡建议", exact: true }).click();
  await expect(page).toHaveURL(/\/training$/);
  await expect(page.locator("[data-training-page]")).toBeVisible();
  await page.evaluate(() => window.dispatchEvent(new Event("pagehide")));
  await expect.poll(() => telemetryBatches.flat().some((event) => (
    event.name === "page_view" && event.page === "/training"
  ))).toBe(true);

  const events = telemetryBatches.flat();
  const allowedKeys = new Set(["sessionId", "type", "name", "durationMs", "value", "page", "meta"]);
  for (const event of events) {
    expect(Object.keys(event).every((key) => allowedKeys.has(key))).toBe(true);
    expect(event).not.toHaveProperty("createdAt");
    expect(event).not.toHaveProperty("userId");
    expect(event).not.toHaveProperty("dataOwnerTag");
  }
  expect(events.some((event) => event.name === "device_info")).toBe(true);
  expect(events).toEqual(expect.arrayContaining([
    expect.objectContaining({ name: "page_view", page: "/" }),
    expect.objectContaining({ name: "page_view", page: "/training" }),
  ]));
  expect(new Set(events.map((event) => event.sessionId)).size).toBe(1);
});

test("telemetry mock accepts a bodyless browser delivery", async ({ page }) => {
  const telemetryBatches: Array<Array<Record<string, unknown>>> = [];
  await mockApis(page, { telemetryBatches });
  await page.goto("/");

  const responseStatus = await page.evaluate(async () => {
    const response = await fetch("/api/telemetry", { method: "POST" });
    return response.status;
  });

  expect(responseStatus).toBe(200);
  expect(telemetryBatches).toContainEqual([]);
});
