import { expect, test, type Locator, type Page, type Route } from "@playwright/test";

import operatorCatalog from "../src/generated/arkntools/operator-catalog.json" with { type: "json" };

const amiyaPortrait = operatorCatalog.find((operator) => operator.id === "char_002_amiya")?.portrait;
if (!amiyaPortrait) throw new Error("Generated operator catalog is missing Amiya's portrait.");

const requestId = "11111111-1111-4111-8111-111111111111";
const diagnosticId = "22222222-2222-4222-8222-222222222222";
const now = Date.now();
const layout243 = {
  template: "243",
  drone_cap: 235,
  scenario: {},
  rooms: [
    { id: "workshop", kind: "workshop", level: 3 },
    { id: "training_room", kind: "training_room", level: 3 },
  ],
};

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

test("cold HTML contains the workbench shell instead of only the client loading placeholder", async ({ request }) => {
  const response = await request.get("/");
  expect(response.status()).toBe(200);
  const html = await response.text();
  expect(html).toContain("data-calculator-controls");
  expect(html).toContain("data-calculator-start-panel");
  expect(html).not.toContain("从可执行的排班开始");
  expect(html).not.toContain("把你的 BOX 变成今天就能照着换的三班方案");
  expect(html).not.toContain("登录只用于保护个人数据");
  expect(html).not.toContain("生成结果前，不需要先理解所有配置项");
  expect(html).not.toContain('data-schedule-view="compact"');
  expect(html).not.toContain('data-schedule-view="list"');
  expect(html).not.toContain("正在加载基建计算器");
});

test("an anonymous cold start probes the shared session once and does not touch Skland", async ({ page }) => {
  await page.unroute("**/api/auth/get-session");
  let sessionRequests = 0;
  const sklandRequests: string[] = [];
  page.on("request", (request) => {
    const pathname = new URL(request.url()).pathname;
    if (pathname === "/api/auth/get-session") sessionRequests += 1;
    if (pathname.startsWith("/api/skland/")) sklandRequests.push(pathname);
  });
  await page.route("**/api/auth/get-session", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: "null",
  }));
  await mockApis(page, { sklandConfigured: true });
  await page.goto("/");

  await expect(page.locator('[data-workbench-hydrated="true"]')).toBeVisible();
  await expect(page.locator('[data-calculator-start-panel][data-onboarding-active="true"]')).toBeVisible();
  await expect(page.getByText("登录网站账号", { exact: true })).toBeVisible();
  await expect(page.getByText("导入自己的 BOX", { exact: true })).toBeVisible();
  await expect(page.getByText("支持自主上传或第三方同步。", { exact: true })).toBeVisible();
  await expect(page.getByText("生成第一份方案", { exact: true })).toBeVisible();
  await expect(page.getByText("从可执行的排班开始", { exact: true })).toHaveCount(0);
  await expect(page.getByText("把你的 BOX 变成今天就能照着换的三班方案", { exact: true })).toHaveCount(0);
  await expect(page.getByText(/登录只用于保护个人数据|生成结果前，不需要先理解所有配置项/)).toHaveCount(0);
  const onboardingSteps = page.getByRole("list", { name: "生成个人排班的步骤" }).locator(":scope > li");
  await expect(onboardingSteps).toHaveCount(3);
  await expect(onboardingSteps.locator("article.infra-room-surface")).toHaveCount(3);
  await expect(page.getByRole("dialog", { name: "登录网站账号" })).toHaveCount(0);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByText(/正在恢复网站账号|正在确认网站账号|正在打开账号登录/)).toHaveCount(0);
  await expect.poll(() => sessionRequests).toBe(1);
  await page.waitForTimeout(100);
  expect(sklandRequests).toEqual([]);

  const importTrigger = page.getByRole("button", { name: "配置Box与布局" });
  await importTrigger.click();
  await expect(page.getByRole("dialog", { name: "登录网站账号" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "登录网站账号" })).toHaveCount(0);
  await expect(importTrigger).toBeFocused();
});

test("the onboarding cards reuse the Skland technical grid and dismiss into the empty schedule", async ({ page }) => {
  await mockApis(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  const onboardingList = page.getByRole("list", { name: "生成个人排班的步骤" });
  const cards = onboardingList.locator(":scope > li");
  const startPanel = page.getByRole("region", { name: "生成排班起步区" });
  const sidebarInset = page.locator('[data-slot="sidebar-inset"]');
  await expect(cards).toHaveCount(3);

  const expectFullScreenAndCentered = async (viewportHeight: number, mobile: boolean) => {
    const geometry = await page.evaluate(() => {
      const panel = document.querySelector<HTMLElement>('[data-calculator-start-panel]')?.getBoundingClientRect();
      const inset = document.querySelector<HTMLElement>('[data-slot="sidebar-inset"]')?.getBoundingClientRect();
      const list = document.querySelector<HTMLElement>('ol[aria-label="生成个人排班的步骤"]')?.getBoundingClientRect();
      const topbar = document.querySelector<HTMLElement>('[data-app-topbar]')?.getBoundingClientRect();
      if (!panel || !inset || !list) throw new Error("Onboarding geometry is unavailable.");
      return {
        panel: { left: panel.left, right: panel.right, top: panel.top, bottom: panel.bottom, height: panel.height },
        inset: { left: inset.left, right: inset.right, top: inset.top },
        topbarBottom: topbar?.bottom ?? null,
        listCenter: list.left + list.width / 2,
        panelCenter: panel.left + panel.width / 2,
      };
    });
    expect(geometry.panel.left).toBeCloseTo(geometry.inset.left, 0);
    expect(geometry.panel.right).toBeCloseTo(geometry.inset.right, 0);
    expect(geometry.panel.top).toBeCloseTo(mobile ? geometry.topbarBottom ?? 0 : geometry.inset.top, 0);
    expect(geometry.panel.bottom).toBeGreaterThanOrEqual(viewportHeight - 1);
    expect(geometry.panel.height).toBeGreaterThanOrEqual(viewportHeight - (mobile ? 56 : 0) - 1);
    expect(geometry.listCenter).toBeCloseTo(geometry.panelCenter, 0);
    await expect(startPanel).toBeVisible();
    await expect(sidebarInset).toBeVisible();
  };

  await expectFullScreenAndCentered(844, true);

  const mobileBoxes = await cards.evaluateAll((elements) => elements.map((element) => {
    const box = element.getBoundingClientRect();
    return { left: box.left, top: box.top, width: box.width };
  }));
  expect(mobileBoxes[0].left).toBeCloseTo(mobileBoxes[1].left, 0);
  expect(mobileBoxes[1].left).toBeCloseTo(mobileBoxes[2].left, 0);
  expect(mobileBoxes[0].width).toBeCloseTo(mobileBoxes[2].width, 0);
  expect(mobileBoxes[1].top).toBeGreaterThan(mobileBoxes[0].top);
  expect(mobileBoxes[2].top).toBeGreaterThan(mobileBoxes[1].top);
  let dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth + 1);

  await page.setViewportSize({ width: 768, height: 900 });
  await expectFullScreenAndCentered(900, false);
  const tabletBoxes = await cards.evaluateAll((elements) => elements.map((element) => {
    const box = element.getBoundingClientRect();
    return { left: box.left, top: box.top, width: box.width };
  }));
  expect(tabletBoxes[0].top).toBeCloseTo(tabletBoxes[1].top, 0);
  expect(tabletBoxes[0].width).toBeCloseTo(tabletBoxes[1].width, 0);
  expect(tabletBoxes[2].top).toBeGreaterThan(tabletBoxes[0].top);
  expect(tabletBoxes[2].width).toBeGreaterThan(tabletBoxes[0].width * 1.8);
  dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth + 1);

  await page.setViewportSize({ width: 1440, height: 900 });
  await expectFullScreenAndCentered(900, false);
  const desktopBoxes = await cards.evaluateAll((elements) => elements.map((element) => {
    const box = element.getBoundingClientRect();
    return { top: box.top, width: box.width };
  }));
  expect(desktopBoxes[0].top).toBeCloseTo(desktopBoxes[1].top, 0);
  expect(desktopBoxes[1].top).toBeCloseTo(desktopBoxes[2].top, 0);
  expect(desktopBoxes[0].width).toBeCloseTo(desktopBoxes[2].width, 0);

  dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth + 1);

  await page.getByRole("button", { name: "暂时跳过引导" }).click();
  await expect(page.locator("[data-calculator-start-panel]")).toHaveCount(0);
  await expect(page.locator("[data-calculator-regenerate-panel]")).toHaveCount(0);
  await expect(page.locator("[data-plan-board]")).toBeVisible();
  await expect(page.locator('[data-operator-identity="empty"]').first()).toBeVisible();
  await expect(onboardingList).toHaveCount(0);
  await expect(page.getByRole("button", { name: "重新查看三步起步卡" })).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => window.localStorage.getItem("arknights-infra-calc-beta-onboarding-v1"))).toBe("dismissed");
});

test("completed onboarding returns to the empty schedule after changing the layout", async ({ page }) => {
  await mockApis(page);
  await seedV4Session(page, planData, { boxSource: "maa" });
  await page.addInitScript(() => {
    window.localStorage.setItem("arknights-infra-calc-beta-onboarding-v1", "completed");
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");

  await expect(page.locator("[data-plan-board]")).toBeVisible();
  await page.getByRole("button", { name: "配置Box与布局" }).first().click();
  const setupDialog = page.getByRole("dialog");
  await setupDialog.getByRole("button", { name: /第 2 步，共 3 步：布局/ }).click();
  await setupDialog.getByRole("button", { name: /^342/ }).click();
  await setupDialog.getByRole("button", { name: "Close" }).click();
  await page.getByRole("dialog", { name: "关闭排班设置？" })
    .getByRole("button", { name: "关闭设置" })
    .click();

  for (const viewport of [
    { width: 390, height: 844 },
    { width: 768, height: 900 },
    { width: 1440, height: 900 },
  ]) {
    await page.setViewportSize(viewport);
    await expect(page.locator("[data-calculator-start-panel]")).toHaveCount(0);
    await expect(page.locator("[data-calculator-regenerate-panel]")).toHaveCount(0);
    await expect(page.locator("[data-plan-board]")).toBeVisible();
    await expect(page.locator(`[data-schedule-view="${viewport.width >= 1024 ? "compact" : "list"}"]`)).toBeVisible();
    await expect(page.locator('[data-operator-identity="empty"]').first()).toBeVisible();
    await expect(page.getByRole("button", { name: "生成排班" })).toBeVisible();
    await expect(page.getByText("生成第一份方案", { exact: true })).toHaveCount(0);
    const dimensions = await page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }));
    expect(dimensions.scrollWidth, JSON.stringify({ viewport, dimensions })).toBeLessThanOrEqual(dimensions.clientWidth + 1);
  }
  await expect.poll(() => page.evaluate(() => window.localStorage.getItem("arknights-infra-calc-beta-onboarding-v1"))).toBe("completed");
});

test("an authenticated personal plan stays disabled while the planner is unavailable", async ({ page }) => {
  await mockApis(page, { plannerReady: false });
  await seedV4Session(page, null, { boxSource: "maa" });
  let planRequests = 0;
  await page.route("**/api/plan", (route) => {
    planRequests += 1;
    return route.abort();
  });
  await page.goto("/");

  const runButton = page.getByRole("button", { name: "生成排班" }).first();
  await expect(runButton).toBeDisabled();
  await expect(runButton).toContainText("排班服务未就绪");
  await expect(runButton).toHaveAttribute("title", "排班服务尚未就绪");
  expect(planRequests).toBe(0);
});

test("a 768px solved plan defaults to list layout and stays inside the viewport", async ({ page }) => {
  await mockApis(page);
  await seedPreferences(page);
  await page.setViewportSize({ width: 768, height: 900 });
  await page.goto("/");
  await expect(page.locator('[data-workbench-hydrated="true"]')).toBeVisible();
  await page.getByRole("button", { name: "全角色导入" }).click();
  await page.getByRole("button", { name: "生成排班" }).click();
  await expect(page.locator('[data-schedule-view="list"]')).toBeVisible();
  await expect(page.getByRole("tab", { name: "一图流布局" })).toHaveCount(0);

  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth + 1);
});

test("Rainyun computing service credit stays at the page footer's right edge and opens safely", async ({ page }) => {
  await mockApis(page);
  await seedPreferences(page);
  await page.goto("/");

  const link = page.getByRole("link", { name: "由雨云提供计算服务（在新标签页打开雨云官网）" });
  const image = link.locator("img");
  await expect(link).toHaveAttribute("href", "https://www.rainyun.com/riic_");
  await expect(link).toHaveAttribute("target", "_blank");
  await expect(link).toHaveAttribute("rel", /noopener/);
  await expect(link).toHaveAttribute("rel", /noreferrer/);
  await expect(link).toContainText("由");
  await expect(link).toContainText("提供计算服务");
  await expect(image).toHaveAttribute("src", /rainyun-logo\.png/);
  await expect.poll(() => image.evaluate((element) => {
    const logo = element as HTMLImageElement;
    return logo.complete && logo.naturalWidth > 0 && logo.naturalHeight > 0;
  })).toBe(true);

  for (const viewport of [
    { width: 390, height: 844 },
    { width: 768, height: 900 },
    { width: 1440, height: 900 },
  ]) {
    await page.setViewportSize(viewport);
    await expect(link).toBeVisible();
    await link.focus();
    await expect(link).toBeFocused();

    const geometry = await link.evaluate((element) => {
      const linkBox = element.getBoundingClientRect();
      const logoBox = element.querySelector("img")?.getBoundingClientRect();
      const copyBoxes = Array.from(element.querySelectorAll<HTMLElement>("[data-rainyun-copy]"))
        .map((copy) => copy.getBoundingClientRect());
      const footer = element.closest("footer");
      const footerBox = footer?.getBoundingClientRect();
      const footerStyle = footer ? getComputedStyle(footer) : null;
      return {
        height: linkBox.height,
        logoWidth: logoBox?.width ?? Number.NaN,
        logoCenterY: logoBox ? logoBox.top + logoBox.height / 2 : Number.NaN,
        copyCenterYs: copyBoxes.map((copy) => copy.top + copy.height / 2),
        right: linkBox.right,
        footerRight: footerBox?.right ?? Number.NaN,
        footerPaddingRight: Number.parseFloat(footerStyle?.paddingRight ?? "0"),
      };
    });
    expect(geometry.height).toBeGreaterThanOrEqual(44 - 0.01);
    expect(geometry.logoWidth).toBeCloseTo(viewport.width < 640 ? 56 : 64, 0);
    for (const copyCenterY of geometry.copyCenterYs) {
      expect(Math.abs(copyCenterY - geometry.logoCenterY)).toBeLessThanOrEqual(1);
    }
    expect(geometry.right).toBeCloseTo(geometry.footerRight - geometry.footerPaddingRight, 0);
  }
});

test("primary pages prefetch after hydration and navigate on the first click", async ({ page }) => {
  const trainingRouteRequests: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.pathname === "/training") {
      trainingRouteRequests.push(request.url());
    }
  });
  await mockApis(page, { sklandConfigured: true, sklandSnapshot: authenticatedSklandSnapshot });
  await seedPreferences(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");

  const destinations = [
    { name: "练卡建议", href: "/training", root: "[data-training-page]" },
    { name: "技能查询", href: "/skills", root: "[data-skill-query-page]" },
    { name: "森空岛状态中心", href: "/skland", root: "[data-skland-page]" },
    { name: "账号管理", href: "/account", root: "[data-account-management]" },
  ];
  for (const destination of destinations) {
    await expect(page.getByRole("button", { name: destination.name, exact: true })).toHaveAttribute("href", destination.href);
  }
  await expect(page.locator('[data-workbench-hydrated="true"]')).toBeVisible();
  await expect(page.locator('[data-primary-navigation-prefetch="eager"]')).toBeVisible();
  await expect(page.locator('[data-navigation-pending]')).toHaveCount(0);

  for (const destination of destinations) {
    await page.getByRole("button", { name: destination.name, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`${destination.href.replace("/", "\\/")}$`));
    await expect(page.locator(destination.root)).toBeVisible({ timeout: 45_000 });
    if (destination.href === "/training") expect(trainingRouteRequests.length).toBeGreaterThan(0);
  }

  await page.getByRole("button", { name: "基建计算器", exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator("[data-calculator-controls]")).toBeVisible();
});

async function expectUnifiedDialogTypography(dialog: Locator, radius: "24px" | "32px" = "32px") {
  await expect(dialog).toHaveClass(/dialog-acrylic/);
  await expect(dialog).toHaveCSS("border-radius", radius);
  await expect(dialog.locator('[data-slot="dialog-title"]')).toHaveCSS("font-size", "18px");
  await expect(dialog.locator('[data-slot="dialog-title"]')).toHaveCSS("font-weight", "600");
  await expect(dialog.locator('[data-slot="dialog-description"]')).toHaveCSS("font-size", "13px");
}

async function expectUnifiedDialogAction(
  button: Locator,
  { width, height }: { width?: "176px" | "196px"; height: "44px" | "46px" }
) {
  if (width) await expect(button).toHaveCSS("width", width);
  await expect(button).toHaveCSS("height", height);
  await expect(button).toHaveCSS("border-radius", "22px");
  await expect(button).toHaveCSS("font-size", "13px");
}

async function expectButtonGeometryStable(button: Locator) {
  await expect(button).toBeVisible();
  await expect.poll(() => button.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return {
      hasSize: rect.width > 1 && rect.height > 1,
      inlineTransform: (element as HTMLElement).style.transform,
      collapsedTransform: style.transform === "matrix(0, 0, 0, 0, 0, 0)",
    };
  })).toEqual({
    hasSize: true,
    inlineTransform: "",
    collapsedTransform: false,
  });
}

async function armEndingTransitionCapture(element: Locator, label: string) {
  await element.evaluate((node, captureLabel) => {
    const attribute = `data-motion-exit-${captureLabel}`;
    const root = document.documentElement;
    root.removeAttribute(attribute);

    const capture = () => {
      if (!node.hasAttribute("data-ending-style")) return false;
      requestAnimationFrame(() => {
        const durations = node.getAnimations().map((animation) => animation.effect?.getTiming().duration ?? 0);
        root.setAttribute(attribute, JSON.stringify(durations));
      });
      return true;
    };

    if (capture()) return;
    const observer = new MutationObserver(() => {
      if (!capture()) return;
      observer.disconnect();
    });
    observer.observe(node, { attributes: true, attributeFilter: ["data-ending-style"] });
  }, label);
}

async function expectCapturedExitDuration(page: Page, label: string, durationMs: number) {
  await expect.poll(() => page.locator("html").getAttribute(`data-motion-exit-${label}`)).toContain(String(durationMs));
}

async function expectMotionDuration(element: Locator, durationMs: number, subtree = false) {
  await expect.poll(() => element.evaluate((node, options) => (
    node.getAnimations({ subtree: options.subtree }).some((animation) => {
      const duration = Number(animation.effect?.getTiming().duration ?? 0);
      return Math.abs(duration - options.durationMs) < 1;
    })
  ), { durationMs, subtree })).toBe(true);
}

async function armMotionCapture(page: Page, selector: string, label: string, durationMs: number) {
  await page.evaluate(({ selector, label, durationMs }) => {
    const attribute = `data-motion-enter-${label}`;
    const root = document.documentElement;
    const startedAt = performance.now();
    root.removeAttribute(attribute);

    const inspect = () => {
      const timing = Array.from(document.querySelectorAll(selector))
        .flatMap((element) => element.getAnimations())
        .map((animation) => animation.effect?.getTiming())
        .find((candidate) => Math.abs(Number(candidate?.duration ?? 0) - durationMs) < 1);
      if (timing) {
        root.setAttribute(attribute, JSON.stringify({
          duration: Number(timing.duration),
          delay: Number(timing.delay),
        }));
        return;
      }
      if (performance.now() - startedAt < 5_000) requestAnimationFrame(inspect);
    };

    inspect();
  }, { selector, label, durationMs });
}

async function armMotionCollectionCapture(page: Page, selector: string, label: string, durationMs: number) {
  await page.evaluate(({ selector, label, durationMs }) => {
    const attribute = `data-motion-enter-${label}`;
    const root = document.documentElement;
    const startedAt = performance.now();
    root.removeAttribute(attribute);

    const inspect = () => {
      const elements = Array.from(document.querySelectorAll(selector));
      const timings = elements.map((element) => element.getAnimations()
        .map((animation) => animation.effect?.getTiming())
        .find((candidate) => Math.abs(Number(candidate?.duration ?? 0) - durationMs) < 1));
      if (elements.length > 0 && timings.every(Boolean)) {
        root.setAttribute(attribute, JSON.stringify(timings.map((timing) => ({
          duration: Number(timing?.duration),
          delay: Number(timing?.delay),
        }))));
        return;
      }
      if (performance.now() - startedAt < 5_000) requestAnimationFrame(inspect);
    };

    inspect();
  }, { selector, label, durationMs });
}

async function expectCapturedMotion(page: Page, label: string, durationMs: number, delayMs = 0) {
  await expect.poll(async () => {
    const value = await page.locator("html").getAttribute(`data-motion-enter-${label}`);
    return value ? JSON.parse(value) as { duration: number; delay: number } : null;
  }).toEqual({ duration: durationMs, delay: delayMs });
}

async function expectCapturedMotionDelays(page: Page, label: string, durationMs: number, delays: number[]) {
  await expect.poll(async () => {
    const value = await page.locator("html").getAttribute(`data-motion-enter-${label}`);
    if (!value) return null;

    return (JSON.parse(value) as Array<{ duration: number; delay: number }>).map(({ duration, delay }) => ({
      duration: Math.round(duration),
      delay: Math.round(delay),
    }));
  }).toEqual(delays.map((delay) => ({ duration: durationMs, delay })));
}

async function armTransientStyleCapture(page: Page, selector: string, label: string) {
  await page.evaluate(({ selector, label }) => {
    const attribute = `data-motion-style-${label}`;
    const root = document.documentElement;
    const startedAt = performance.now();
    root.removeAttribute(attribute);

    const inspect = () => {
      for (const element of document.querySelectorAll(selector)) {
        const style = getComputedStyle(element);
        const opacity = Number(style.opacity);
        const transform = style.transform;
        const moved = !["none", "matrix(1, 0, 0, 1, 0, 0)", "matrix3d(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1)"].includes(transform);
        if (moved || opacity < 0.999) {
          root.setAttribute(attribute, JSON.stringify({ opacity, transform }));
          return;
        }
      }
      if (performance.now() - startedAt < 5_000) requestAnimationFrame(inspect);
    };

    inspect();
  }, { selector, label });
}

async function expectCapturedStyleMotion(page: Page, label: string) {
  await expect.poll(() => page.locator("html").getAttribute(`data-motion-style-${label}`)).not.toBeNull();
}

async function waitForOwnAnimations(element: Locator) {
  await element.evaluate(async (node) => {
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    });
    await Promise.race([
      Promise.all(node.getAnimations().map((animation) => animation.finished.catch(() => undefined))),
      new Promise<void>((resolve) => setTimeout(resolve, 500)),
    ]);
  });
}

async function gotoStable(page: Page, path: string) {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await page.goto(path, { waitUntil: "domcontentloaded" });
      if (new URL(page.url()).pathname === path) return;
    } catch (error) {
      lastError = error;
      if (!/interrupted by another navigation|Load failed/i.test(String(error))) throw error;
    }
    await page.waitForTimeout(250);
  }
  throw lastError instanceof Error
    ? lastError
    : new Error(`Unable to navigate to ${path} after a development reload.`);
}

async function expectVisibleNumbersUseNumberFont(page: Page, scope: Locator = page.locator("body")) {
  await page.evaluate(async () => {
    const numberFamily = getComputedStyle(document.documentElement)
      .getPropertyValue("--font-number-source")
      .split(",")[0]
      .trim()
      .replace(/^['"]|['"]$/g, "");
    if (numberFamily) {
      await document.fonts.load(`16px "${numberFamily}"`, "0123456789+-.,%/:−");
    }
    await document.fonts.ready;
  });
  const audit = await scope.evaluate((root) => {
    const numberFamily = getComputedStyle(document.documentElement)
      .getPropertyValue("--font-number-source")
      .split(",")[0]
      .trim()
      .replace(/^['"]|['"]$/g, "");
    const elements = [root, ...Array.from(root.querySelectorAll<HTMLElement>("*"))]
      .filter((element): element is HTMLElement => element instanceof HTMLElement);
    const failures: Array<{ tag: string; text: string; fontFamily: string }> = [];

    for (const element of elements) {
      if (element.closest("svg, [aria-hidden='true'], [data-ui-number-font]")) continue;
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      if (style.display === "none" || style.visibility === "hidden" || rect.width === 0 || rect.height === 0) continue;

      const directText = Array.from(element.childNodes)
        .filter((node) => node.nodeType === Node.TEXT_NODE)
        .map((node) => node.textContent ?? "")
        .join(" ");
      const controlValue = element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement
        ? element.value
        : "";
      const numericText = `${directText} ${controlValue}`.replace(/\s+/g, " ").trim();
      if (!/\d/.test(numericText) || style.fontFamily.includes(numberFamily)) continue;

      failures.push({
        tag: element.tagName.toLowerCase(),
        text: numericText.slice(0, 100),
        fontFamily: style.fontFamily,
      });
    }

    return {
      failures,
      loaded: Boolean(numberFamily) && document.fonts.check(`16px "${numberFamily}"`, "0123456789+-.,%/:−"),
      numberFamily,
    };
  });

  expect(audit.numberFamily).toBeTruthy();
  expect(audit.loaded).toBe(true);
  expect(audit.failures, JSON.stringify(audit.failures, null, 2)).toEqual([]);
}

const profile = {
  schema_version: 4,
  rotation_profile: "abc_12_6_6",
  layout_label: "243",
  operbox_label: "243 全精二示例",
  baseline_label: "产品推荐基准",
  summary: { owned: 1, tier_up_owned: 1, trade_pool_ready: 1, manufacture_pool_ready: 1 },
  domains: [],
  rotation: {},
  baseline_rotation: {},
  actions: [],
  flags: [],
  narration_hints: [],
};

function maaPlan(index: number) {
  return {
    name: `班次 ${index + 1}`,
    description: `固定测试班次 ${index + 1}`,
    rooms: {
      processing: [{ operators: ["阿米娅"] }],
    },
  };
}

const planData = {
  profile,
  maa: {
    title: "明日方舟基建排班助手 · 243",
    plans: [maaPlan(0), maaPlan(1), maaPlan(2)],
  },
  rotation: {
    profile: "abc_12_6_6",
    shifts: [0, 1, 2].map((index) => ({
      index,
      duration_hours: index === 0 ? 12 : 6,
      active_teams: ["A"],
      resting_team: "B",
      scores: { trade_score: 0, manu_prod_sum: 0, power_charge_sum: 0, room_lines: [] },
      weighted_trade: 0,
      weighted_manu: 0,
      weighted_power: 0,
    })),
    daily: {
      trade: 0,
      manufacture: 0,
      power: 0,
      production: { lmd: 34_254, pure_gold: 53_000, battle_records: 22_400, originium_shards: 48, orundum: 360 },
    },
  },
  durationMs: 42,
  diagnosticId,
};

function rotationResultData({
  rotationProfile,
  durations,
  profileOverrides = {},
}: {
  rotationProfile: "abc_12_6_6" | "main_backup_12_12" | "fiammetta_8_8_4_4" | "abyssal_7_5_7_5";
  durations: number[];
  profileOverrides?: Record<string, unknown>;
}) {
  return {
    ...planData,
    profile: {
      ...profile,
      rotation_profile: rotationProfile,
      ...profileOverrides,
    },
    maa: {
      ...planData.maa,
      plans: durations.map((_, index) => maaPlan(index)),
    },
    rotation: {
      profile: rotationProfile,
      shifts: durations.map((duration, index) => ({
        index,
        duration_hours: duration,
        active_teams: index % 2 === 0 ? ["alpha"] : ["beta"],
        resting_team: index % 2 === 0 ? "beta" : "alpha",
        scores: { trade_score: 0, manu_prod_sum: 0, power_charge_sum: 0, room_lines: [] },
        weighted_trade: 0,
        weighted_manu: 0,
        weighted_power: 0,
      })),
      daily: { trade: 5.288, manufacture: 9.175, power: 3.552 },
    },
  };
}

const twoShiftPlanBase = rotationResultData({
  rotationProfile: "main_backup_12_12",
  durations: [12, 12],
  profileOverrides: {
    rotation: {
      daily_trade_efficiency: 5.288,
      daily_manufacture_efficiency: 9.175,
      daily_power_efficiency: 3.552,
    },
    baseline_rotation: {
      daily_trade_efficiency: 4.968,
      daily_manufacture_efficiency: 8.5,
      daily_power_efficiency: 3.2,
    },
    domains: [{
      id: "manufacture",
      label: "制造站",
      current: {
        operators: ["阿米娅"],
        final_efficiency: 1.55,
        mechanic_equivalent_efficiency: 1.42,
      },
      baseline: {
        operators: ["基准组合"],
        final_efficiency: 1.4,
        mechanic_equivalent_efficiency: 1.31,
      },
      gap_ratio: 0.107,
      severity: "ok",
    }],
    actions: [{
      priority: "中",
      kind: "promote_tier_up",
      operator: "阿米娅",
      domain_id: "manufacture",
      message: "提升精英阶段以补齐制造轮换。",
      current_elite: 1,
      tier_up_requirement: "精2",
    }],
  },
});

const twoShiftPlanData = {
  ...twoShiftPlanBase,
  maa: {
    ...twoShiftPlanBase.maa,
    plans: twoShiftPlanBase.maa.plans.map((plan, index) => ({
      ...plan,
      drones: { enable: true, room: "manufacture" as const, index: index === 0 ? 1 : 3, order: "pre" as const },
      rooms: {
        ...plan.rooms,
        trading: [
          { product: "LMD", operators: [], sort: true, autofill: false },
          { product: "Originium Shard", operators: [], sort: true, autofill: false },
        ],
        manufacture: [
          { product: "Gold", operators: [], sort: true, autofill: false },
          { product: "Gold", operators: [], sort: true, autofill: false },
          { product: "Battle Record", operators: [], sort: true, autofill: false },
          { product: "Originium Shard", operators: [], sort: true, autofill: false },
        ],
        power: [0, 1, 2].map(() => ({ operators: [] })),
      },
    })),
  },
  rotation: {
    ...twoShiftPlanBase.rotation,
    daily: {
      ...twoShiftPlanBase.rotation.daily,
      production: { lmd: 34_254, pure_gold: 53_000, battle_records: 22_400, originium_shards: 48, orundum: 360 },
    },
    shifts: twoShiftPlanBase.rotation.shifts.map((shift) => ({
      ...shift,
      scores: {
        ...shift.scores,
        room_lines: [
          { room_id: "trade_1", final_efficiency: 3.337, trade_score: 3.337, trade_pct: 135, trade_skill_pct: 132, trade_gold_pct: 42 },
          { room_id: "trade_2", final_efficiency: 1.5, trade_score: 1.5, trade_pct: 50, trade_skill_pct: 50 },
          { room_id: "manu_1", final_efficiency: 2.36, manu_score: 236, manu_prod_skill: 130, manu_display_pct: 136 },
          { room_id: "manu_2", final_efficiency: 2, manu_prod_total: 100, manu_prod_skill: 94 },
          { room_id: "manu_3", final_efficiency: 2, manu_prod_total: 100, manu_prod_skill: 94 },
          { room_id: "manu_4", final_efficiency: 2, manu_prod_total: 100, manu_prod_skill: 94 },
          { room_id: "power_1", final_efficiency: 1.2, power_charge_speed_pct: 20 },
          { room_id: "power_2", final_efficiency: 1.2, power_charge_speed_pct: 20 },
          { room_id: "power_3", final_efficiency: 1.2, power_charge_speed_pct: 20 },
        ],
      },
    })),
  },
};

const fourShiftPlanData = rotationResultData({
  rotationProfile: "fiammetta_8_8_4_4",
  durations: [8, 8, 4, 4],
});

const scheduleVisualPlanData = {
  ...planData,
  maa: {
    ...planData.maa,
    plans: [0, 1, 2].map((index) => ({
      ...maaPlan(index),
      rooms: {
        trading: [{
          product: "LMD",
          operators: [{ name: "阿米娅", skill: 1 }, { name: "凯尔希", skill: 99 }, "贝洛内"],
          sort: true,
          autofill: false,
        }],
        processing: [{ operators: [{ name: "阿米娅", skill: 2 }] }],
      },
    })),
  },
};

const adjacentPortraitOperators = ["阿米娅", "凯尔希", "贝洛内"] as const;
const adjacentPortraitPlanData = {
  ...scheduleVisualPlanData,
  maa: {
    ...scheduleVisualPlanData.maa,
    plans: scheduleVisualPlanData.maa.plans.map((plan, index) => ({
      ...plan,
      rooms: {
        trading: [{
          product: "LMD",
          operators: [adjacentPortraitOperators[index] ?? adjacentPortraitOperators[0]],
          sort: true,
          autofill: false,
        }],
      },
    })),
  },
};

const lazyPortraitPlanData = {
  ...scheduleVisualPlanData,
  maa: {
    ...scheduleVisualPlanData.maa,
    plans: scheduleVisualPlanData.maa.plans.map((plan) => ({
      ...plan,
      rooms: {
        ...plan.rooms,
        processing: [{ operators: [{ name: "嘉辛塔", skill: 1 }] }],
      },
    })),
  },
};

const productChangePlanData = {
  ...scheduleVisualPlanData,
  maa: {
    ...scheduleVisualPlanData.maa,
    plans: scheduleVisualPlanData.maa.plans.map((plan) => ({
      ...plan,
      rooms: {
        ...plan.rooms,
        trading: [0, 1].map(() => ({ product: "LMD", operators: [], sort: true, autofill: false })),
        manufacture: [0, 1, 2, 3].map(() => ({ product: "Gold", operators: [], sort: true, autofill: false })),
      },
    })),
  },
};

const motionPlanBase = rotationResultData({
  rotationProfile: "abc_12_6_6",
  durations: [12, 6, 6],
});

const motionPlanData = {
  ...motionPlanBase,
  trainingRoom: {
    schema_version: 1 as const,
    shifts: [
      { trainee: "Training-A", trainer: "Trainer-A" },
      { trainee: "Training-B", trainer: null },
      { trainee: null, trainer: "Trainer-C" },
    ],
  },
  maa: {
    ...motionPlanBase.maa,
    plans: [0, 1, 2].map((index) => ({
      ...maaPlan(index),
      rooms: {
        control: [{ operators: [] }],
        trading: [0, 1].map((roomIndex) => ({
          product: "LMD",
          operators: roomIndex === 0 ? [{ name: ["阿米娅", "凯尔希", "贝洛内"][index], skill: 2 }] : [],
          sort: true,
          autofill: false,
        })),
        manufacture: [0, 1, 2, 3].map(() => ({ product: "Gold", operators: [], sort: true, autofill: false })),
        power: [0, 1, 2].map(() => ({ operators: [] })),
        dormitory: [0, 1, 2, 3].map(() => ({ operators: [], autofill: true })),
        meeting: [{ operators: [] }],
        hire: [{ operators: [] }],
        processing: [{ operators: [{ name: ["阿米娅", "凯尔希", "贝洛内"][index], skill: 2 }] }],
      },
    })),
  },
};

const sampleData = [{
  id: "char_002_amiya",
  name: "阿米娅",
  elite: 2,
  level: 80,
  own: true,
  potential: 6,
  rarity: 5,
}];

const authenticatedSklandSnapshot = {
  player: {
    uid: "123456789",
    nickname: "测试博士",
    level: 120,
    channelName: "官服",
    avatarUrl: null,
    registerTs: 1_600_000_000,
    mainStageProgress: "14-21",
    resume: "为了更好的明天。",
    subscriptionEnd: 1_800_000_000,
    storeTs: 1_700_000_090,
    lastOnlineTs: 1_700_000_080,
    sanity: { current: 120, max: 135, completeRecoveryTime: 1_700_010_000 },
    secretary: { id: "char_002_amiya", name: "阿米娅", skinName: "见习联结者" },
    counts: { operators: 2, furniture: 200, skins: 1 },
  },
  roles: [
    { uid: "123456789", nickname: "测试博士", channelName: "官服", isDefault: true },
    { uid: "987654321", nickname: "测试博士二号", channelName: "B服", isDefault: false },
  ],
  operbox: [
    { id: "char_002_amiya", name: "阿米娅", elite: 2, level: 80, own: true, potential: 6, rarity: 5 },
    { id: "char_003_kalts", name: "凯尔希", elite: 2, level: 90, own: true, potential: 1, rarity: 6 },
  ],
  infrastructure: {
    currentTs: 1_700_000_100,
    storeTs: 1_700_000_090,
    layoutLabel: "243",
    layoutSuggestion: layout243,
    layoutWarning: null,
    tiredOperators: ["阿米娅"],
    labor: { value: 235, maxValue: 235, remainSecs: 0, lastUpdateTime: 1_700_000_000 },
    furnitureTotal: 200,
    training: {
      trainee: "凯尔希",
      trainer: "阿米娅",
      skillIndex: 2,
      remainSecs: 3_600,
      remainPoint: 100,
      speed: 1.2,
      completeWorkTime: 1_700_003_700,
    },
    rooms: [
      {
        key: "control",
        group: "control",
        index: 0,
        level: 5,
        operators: [{ id: "char_002_amiya", name: "阿米娅", morale: 18, workTime: 7_200, lastMoraleUpdateTs: 1_700_000_050 }],
      },
      {
        key: "trade-0",
        group: "trading",
        index: 0,
        level: 3,
        product: "gold",
        operators: [],
        production: { stock: 10, capacity: 10, unitCapacity: null, completed: null, remaining: null, completeWorkTime: 1_700_001_200 },
        orders: [{ delivery: [{ type: "material", count: 3 }], reward: { type: "lmd", count: 1_500 } }],
        lastUpdateTime: 1_700_000_000,
      },
      {
        key: "factory-0",
        group: "manufacture",
        index: 0,
        level: 3,
        product: "battle_record",
        operators: [],
        production: { stock: 2, capacity: 10, unitCapacity: 78, completed: 2, remaining: 8, completeWorkTime: 1_700_001_000 },
        speed: 1.5,
        lastUpdateTime: 1_700_000_000,
      },
      {
        key: "dorm-0",
        group: "dormitory",
        index: 0,
        level: 5,
        operators: [
          { id: "char_003_kalts", name: "凯尔希", morale: 24, workTime: 0, lastMoraleUpdateTs: 1_700_000_050 },
          { id: "char_002_amiya", name: "阿米娅", morale: 18, workTime: 0, lastMoraleUpdateTs: 1_700_000_050 },
        ],
        comfort: 5_000,
      },
      {
        key: "meeting",
        group: "meeting",
        index: 0,
        level: 3,
        operators: [],
        clue: {
          board: ["莱茵生命", "罗德岛"],
          own: 4,
          received: 1,
          dailyReward: true,
          needReceive: 2,
          sharing: true,
          shareCompleteTime: 1_700_005_000,
        },
        completeWorkTime: 1_700_003_000,
        lastUpdateTime: 1_700_000_000,
      },
      {
        key: "hire",
        group: "hire",
        index: 0,
        level: 3,
        operators: [],
        refreshCount: 2,
        completeWorkTime: 1_700_002_000,
      },
      {
        key: "training-1",
        group: "training",
        index: 0,
        level: 3,
        operators: [
          { id: "char_003_kalts", name: "凯尔希", morale: 24, lastMoraleUpdateTs: 1_700_000_050, position: "trainee" },
          { id: "char_002_amiya", name: "阿米娅", morale: 18, lastMoraleUpdateTs: 1_700_000_050, position: "trainer" },
        ],
        occupancy: { current: 2, capacity: 2 },
      },
      {
        key: "workshop",
        group: "processing",
        index: 0,
        level: 3,
        operators: [],
      },
    ],
  },
  operators: [
    {
      id: "char_003_kalts",
      name: "凯尔希",
      rarity: 6,
      profession: "MEDIC",
      subProfessionName: "医师",
      elite: 2,
      level: 90,
      potential: 1,
      favorPercent: 200,
      mainSkillLevel: 7,
      skills: [{ index: 1, specializeLevel: 3 }, { index: 2, specializeLevel: 1 }],
      modules: [{ id: "uniequip_1", name: "医者意志", level: 3, locked: false, isDefault: true }],
      currentSkinName: "残余",
      acquiredAt: 1_650_000_000,
      isAssist: true,
    },
    {
      id: "char_002_amiya",
      name: "阿米娅",
      rarity: 5,
      profession: "CASTER",
      subProfessionName: "中坚术师",
      elite: 2,
      level: 80,
      potential: 6,
      favorPercent: 200,
      mainSkillLevel: 7,
      skills: [{ index: 1, specializeLevel: 3 }],
      modules: [],
      currentSkinName: "见习联结者",
      acquiredAt: 1_600_000_000,
      isAssist: false,
    },
  ],
  skins: [{
    id: "skin_amiya",
    name: "见习联结者",
    brandId: "EPOQUE",
    operatorId: "char_002_amiya",
    operatorName: "阿米娅",
    obtainedAt: 1_660_000_000,
    isCurrent: true,
  }],
  progress: {
    recruit: [{ index: 0, startTs: 1_699_990_000, finishTs: 1_700_000_050, state: "completed" }],
    routine: { daily: { current: 8, total: 10 }, weekly: { current: 80, total: 100 } },
    campaign: {
      records: [{ name: "切尔诺伯格", zoneName: "乌萨斯", maxKills: 400 }],
      reward: { current: 1_800, total: 1_800 },
    },
    tower: {
      records: [{ name: "钢铁萝卜矿场", subName: "测试周期", best: 8 }],
      reward: {
        higher: { current: 1, total: 2 },
        lower: { current: 3, total: 4 },
        termTs: 1_800_000_000,
      },
    },
    rogue: [{ name: "傀影与猩红孤钻", relicCount: 120, bankCurrent: 300, bankRecord: 500 }],
    activities: [{
      name: "测试活动",
      startTime: 1_700_000_000,
      endTime: 1_800_000_000,
      rewardEndTime: 1_800_100_000,
      isReplicate: false,
      clearedStages: 8,
      totalStages: 10,
    }],
    bossRush: [{ played: true, stageCode: "TN-1", stageName: "测试关卡", difficulty: "NORMAL" }],
  },
  sourceName: "森空岛同步",
  warnings: [],
};

function mockInfrastructureOperators(prefix: string, count: number) {
  return Array.from({ length: count }, (_, index) => ({
    id: `${prefix}-${index}`,
    name: `${prefix}-${index + 1}`,
    morale: 24 - index,
    workTime: 7_200 + index * 300,
    lastMoraleUpdateTs: 1_700_000_050,
  }));
}

const productionHeavySklandSnapshot = {
  ...authenticatedSklandSnapshot,
  infrastructure: {
    ...authenticatedSklandSnapshot.infrastructure,
    rooms: [
      {
        ...authenticatedSklandSnapshot.infrastructure.rooms[0],
        operators: mockInfrastructureOperators("control", 5),
      },
      ...Array.from({ length: 2 }, (_, index) => ({
        ...authenticatedSklandSnapshot.infrastructure.rooms[1],
        key: `trade-${index}`,
        index,
        operators: mockInfrastructureOperators(`trade-${index}`, 3),
      })),
      ...Array.from({ length: 4 }, (_, index) => ({
        ...authenticatedSklandSnapshot.infrastructure.rooms[2],
        key: `factory-${index}`,
        index,
        operators: mockInfrastructureOperators(`factory-${index}`, 3),
      })),
      ...Array.from({ length: 3 }, (_, index) => ({
        key: `power-${index}`,
        group: "power",
        index,
        level: 3,
        operators: mockInfrastructureOperators(`power-${index}`, 1),
      })),
      authenticatedSklandSnapshot.infrastructure.rooms[4],
      authenticatedSklandSnapshot.infrastructure.rooms[5],
      authenticatedSklandSnapshot.infrastructure.rooms[6],
      ...Array.from({ length: 4 }, (_, index) => ({
        ...authenticatedSklandSnapshot.infrastructure.rooms[3],
        key: `dorm-${index}`,
        index,
        operators: mockInfrastructureOperators(`dorm-${index}`, 5),
      })),
    ],
  },
};

const primarySklandAccount = {
  accountId: "account_primary",
  selectedUid: authenticatedSklandSnapshot.player.uid,
  roles: authenticatedSklandSnapshot.roles,
  credentialExpiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
};

type MockSklandSnapshot = Omit<typeof authenticatedSklandSnapshot, "infrastructure" | "player"> & {
  player: Omit<typeof authenticatedSklandSnapshot.player, "avatarUrl"> & {
    avatarUrl: string | null;
  };
  infrastructure: Omit<typeof authenticatedSklandSnapshot.infrastructure, "layoutSuggestion"> & {
    layoutSuggestion: typeof layout243 | null;
  };
};

async function mockApis(
  page: Page,
  options: {
    debugTools?: boolean;
    sklandConfigured?: boolean;
    sklandSnapshot?: MockSklandSnapshot;
    sklandAccounts?: typeof primarySklandAccount[];
    activeAccountId?: string | null;
    sklandBindingCount?: number;
    sklandRenewalDueCount?: number;
    sklandSessionDelayMs?: number;
    sklandSummaryDelayMs?: number;
    sklandSessionFailure?: boolean;
    plannerReady?: boolean;
    telemetryBatches?: Array<Array<Record<string, unknown>>>;
  } = {}
) {
  await page.route("**/api/health", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    headers: { "X-Request-Id": requestId },
    body: JSON.stringify({
      success: true,
      data: {
        status: "ready",
        plannerReady: options.plannerReady ?? true,
        skland: {
          available: Boolean(options.sklandConfigured),
          message: options.sklandConfigured ? null : "当前未开放森空岛登录，可使用 MAA 导入。",
        },
        features: { debugTools: Boolean(options.debugTools), rateLimit: false },
      },
      requestId,
    }),
  }));
  await page.route(/\/api\/skland\/accounts(?:[/?]|$)/, async (route) => {
    const mode = new URL(route.request().url()).searchParams.get("mode");
    const isSummary = mode === "summary";
    const isLogout = route.request().method() === "DELETE";
    if (isSummary && options.sklandSummaryDelayMs) {
      await new Promise((resolve) => setTimeout(resolve, options.sklandSummaryDelayMs));
    } else if (!isSummary && !isLogout && options.sklandSessionDelayMs) {
      await new Promise((resolve) => setTimeout(resolve, options.sklandSessionDelayMs));
    }
    if (!isSummary && !isLogout && options.sklandSessionFailure) {
      return route.fulfill({
        status: 500,
        contentType: "application/json",
        headers: { "X-Request-Id": requestId },
        body: JSON.stringify({
          success: false,
          error: { code: "AIC-SYS-5000", message: "森空岛会话恢复失败，请稍后刷新。", retryable: true },
          requestId,
        }),
      });
    }
    const accounts = options.sklandAccounts
      ?? (options.sklandSnapshot ? [{
        ...primarySklandAccount,
        selectedUid: options.sklandSnapshot.player.uid,
        roles: options.sklandSnapshot.roles,
      }] : []);
    const activeAccountId = options.activeAccountId
      ?? (accounts.length ? accounts[0].accountId : null);
    const bindingCount = options.sklandBindingCount ?? accounts.length;
    const renewalDueCount = Math.min(bindingCount, options.sklandRenewalDueCount ?? 0);
    const activeBindingCount = bindingCount - renewalDueCount;
    const bindingSummary = {
      totalCount: bindingCount,
      activeCount: activeBindingCount,
      renewalDueCount,
      nextExpiresAt: activeBindingCount > 0 ? Date.now() + 7 * 24 * 60 * 60 * 1000 : null,
      latestExpiredAt: renewalDueCount > 0 ? Date.now() - 60_000 : null,
    };
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "X-Request-Id": requestId },
      body: JSON.stringify({
        success: true,
        data: isLogout
          ? {
              authenticated: false,
              configured: Boolean(options.sklandConfigured),
              authMethods: { qr: true },
              accounts: [],
              activeAccountId: null,
              bindingCount: 0,
              bindingSummary: { totalCount: 0, activeCount: 0, renewalDueCount: 0, nextExpiresAt: null, latestExpiredAt: null },
            }
          : {
              authenticated: isSummary ? accounts.length > 0 : Boolean(options.sklandSnapshot),
              configured: Boolean(options.sklandConfigured),
              authMethods: { qr: true },
              accounts,
              activeAccountId,
              bindingCount,
              bindingSummary,
              disabledReason: options.sklandConfigured
                ? null
                : "当前未开放森空岛登录，可使用 MAA 导入。",
              ...(!isSummary && options.sklandSnapshot ? { scheduleSnapshot: options.sklandSnapshot } : {}),
              ...(!isSummary && options.sklandSnapshot ? { statusSnapshot: options.sklandSnapshot } : {}),
            },
        requestId,
      }),
    });
  });
  await page.route("**/api/skland/status/refresh", (route) => {
    const accounts = (options.sklandAccounts
      ?? (options.sklandSnapshot ? [primarySklandAccount] : []));
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "X-Request-Id": requestId },
      body: JSON.stringify({
        success: true,
        data: {
          accounts,
          activeAccountId: options.activeAccountId ?? accounts[0]?.accountId ?? null,
          ...(options.sklandSnapshot ? { snapshot: options.sklandSnapshot } : {}),
        },
        requestId,
      }),
    });
  });
  await page.route("**/api/skland/account-data", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    headers: { "X-Request-Id": requestId },
    body: JSON.stringify({ success: true, data: { deleted: true, runs: 1, feedback: 0 }, requestId }),
  }));
  await page.route("**/api/sample-operbox", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      success: true,
      data: { sourceName: "243 全精二示例", operbox: sampleData },
      requestId,
    }),
  }));
  await page.route("**/api/plan", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      success: true,
      data: options.debugTools
        ? {
            ...planData,
            debug: {
              command: "infra-cli serve",
              stdout: "test output",
              stderr: "",
              debugBundle: { version: "test" },
            },
          }
        : planData,
      requestId,
    }),
  }));
  await page.route("**/api/feedback", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      success: true,
      data: { feedbackId: "feedback-001", savedAt: "2026-07-28T00:00:00.000Z" },
      requestId,
    }),
  }));
  await page.route("**/api/telemetry", async (route) => {
    const body = route.request().postDataJSON() as { events?: Array<Record<string, unknown>> } | null;
    const events = Array.isArray(body?.events) ? body.events : [];
    options.telemetryBatches?.push(events);
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "X-Request-Id": requestId },
      body: JSON.stringify({ success: true, data: { accepted: events.length }, requestId }),
    });
  });
}

async function openSklandOverview(page: Page) {
  await page.getByRole("button", { name: "森空岛状态中心", exact: true }).click();
  await expect(page.locator("[data-skland-page]")).toBeVisible();
  await expect(page.locator('[data-slot="dialog-overlay"]')).toHaveCount(0);
}

async function navigateToPrimaryPage(
  page: Page,
  destination: { name: string; href: string; root: string },
  mobile: boolean,
) {
  if (mobile) {
    await page.locator("[data-app-topbar]").getByRole("button", { name: "Toggle Sidebar" }).click();
    await expect(page.getByRole("dialog", { name: "Sidebar" })).toBeVisible();
  }
  await page.getByRole("button", { name: destination.name, exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`${destination.href.replace("/", "\\/")}$`));
  await expect(page.locator(destination.root)).toBeVisible({ timeout: 45_000 });
  await expect(page.locator('[data-navigation-pending]')).toHaveCount(0);
  if (mobile) {
    await expect(page.getByRole("dialog", { name: "Sidebar" })).toHaveCount(0);
    await expect(page.locator('[data-slot="dialog-overlay"]')).toHaveCount(0);
  }
}

async function seedPreferences(page: Page) {
  await page.addInitScript(() => {
    window.localStorage.setItem("arknights-infra-calc-beta-onboarding-v1", "1");
  });
}

async function seedV4Session(
  page: Page,
  seededResult: unknown = planData,
  options: {
    activeShift?: number;
    rotationProfile?: string;
    layoutDirty?: boolean;
    operbox?: Array<Record<string, unknown>>;
    boxSource?: "sample" | "maa" | "skland";
  } = {}
) {
  await page.addInitScript(({ layout, result, savedAt, expiresAt, activeShift, rotationProfile, layoutDirty, operbox, boxSource }) => {
    window.localStorage.setItem("arknights-infra-calc-beta-onboarding-v1", "1");
    if (!window.localStorage.getItem("arknights-infra-calc-session-v4")) window.localStorage.setItem("arknights-infra-calc-session-v4", JSON.stringify({
      version: 4,
      savedAt,
      expiresAt,
      presetLabel: "243",
      layout,
      operbox: operbox ?? [{
        id: "char_002_amiya",
        name: "阿米娅",
        elite: 2,
        level: 80,
        own: true,
        potential: 6,
        rarity: 5,
      }],
      sourceName: "243 全精二示例",
      boxSource,
      layoutDirty,
      rotationProfile,
      result,
      activeShift,
    }));
  }, {
    layout: layout243,
    result: seededResult,
    savedAt: new Date(now).toISOString(),
    expiresAt: new Date(now + 30 * 24 * 60 * 60 * 1000).toISOString(),
    activeShift: options.activeShift ?? 0,
    rotationProfile: options.rotationProfile ?? "abc_12_6_6",
    layoutDirty: options.layoutDirty ?? false,
    operbox: options.operbox,
    boxSource: options.boxSource ?? "sample",
  });
}

test("legacy plans API identifies the account saved-plans successor", async ({ request }) => {
  const legacy = await request.get("/api/plans");
  expect(legacy.headers().deprecation).toBe("true");
  expect(legacy.headers().link).toContain("</api/account/saved-plans>");

  const canonical = await request.get("/api/account/saved-plans");
  expect(canonical.headers().deprecation).toBeUndefined();
});

test("legacy overloaded APIs identify their resource-oriented successors", async ({ request }) => {
  const cases = [
    { method: "DELETE", path: "/api/workspace", successor: "/api/account/data-consent" },
    { method: "GET", path: "/api/admin/users?userId=user_test", successor: "/api/admin/users/user_test/sessions" },
    { method: "GET", path: "/api/admin/records?kind=runs", successor: "/api/admin/plan-runs" },
    { method: "GET", path: "/api/skland/session", successor: "/api/skland/accounts" },
    { method: "GET", path: "/api/skland/status", successor: "/api/skland/status/refresh" },
    { method: "DELETE", path: "/api/skland/data", successor: "/api/skland/account-data" },
  ] as const;
  for (const entry of cases) {
    const response = await request.fetch(entry.path, { method: entry.method });
    expect(response.headers().deprecation, `${entry.method} ${entry.path}`).toBe("true");
    expect(response.headers().link, `${entry.method} ${entry.path}`).toContain(`<${entry.successor}>`);
  }
  const legacyAdminAction = await request.post("/api/admin/users", {
    data: { userId: "user_test", action: "revokeSessions" },
  });
  expect(legacyAdminAction.headers().deprecation).toBe("true");
  expect(legacyAdminAction.headers().link).toContain("</api/admin/users/user_test/sessions>");

  const legacyFeedbackUpdate = await request.patch("/api/admin/records", {
    data: { feedbackId: "feedback_test", status: "working", note: "test" },
  });
  expect(legacyFeedbackUpdate.headers().deprecation).toBe("true");
  expect(legacyFeedbackUpdate.headers().link).toContain("</api/admin/feedback/feedback_test>");

  const legacySingleLogout = await request.delete("/api/skland/session", {
    data: { accountId: "account_test" },
  });
  expect(legacySingleLogout.headers().deprecation).toBe("true");
  expect(legacySingleLogout.headers().link).toContain("</api/skland/accounts/account_test>");
});

test("resource-oriented admin APIs keep authentication and method boundaries", async ({ request }) => {
  const reads = [
    "/api/admin/users/user_test/sessions",
    "/api/admin/plan-runs",
    "/api/admin/feedback",
  ];
  for (const path of reads) expect((await request.get(path)).status(), path).toBe(401);

  expect((await request.patch("/api/admin/users/user_test", {
    data: { banned: true },
  })).status()).toBe(401);
  expect((await request.delete("/api/admin/users/user_test/sessions")).status()).toBe(401);
  expect((await request.patch("/api/admin/feedback/feedback_test", {
    data: { status: "working", note: "test" },
  })).status()).toBe(401);
});

for (const viewport of [
  { width: 390, height: 844 },
  { width: 768, height: 900 },
  { width: 1440, height: 900 },
]) {
  test(`website account registration is reachable and explains consent at ${viewport.width}px`, async ({ page }) => {
    await page.unroute("**/api/auth/get-session");
    await page.route("**/api/auth/get-session", (route) => route.fulfill({ status: 200, contentType: "application/json", body: "null" }));
    await page.route("**/api/auth/sign-up/email", async (route) => {
      const body = route.request().postDataJSON() as { email?: string; password?: string };
      expect(body.email).toBe(`account-${viewport.width}@example.test`);
      expect(body.password).toBe("secure-password-1");
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ token: null, user: { id: "new-user", name: "测试用户", email: body.email, emailVerified: false } }),
      });
    });
    await page.route("**/api/auth/email-otp/verify-email", async (route) => {
      const body = route.request().postDataJSON() as { email?: string; otp?: string };
      expect(body).toEqual({ email: `account-${viewport.width}@example.test`, otp: "123456" });
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ status: true, token: null, user: { id: "new-user", name: "测试用户", email: body.email, emailVerified: true } }),
      });
    });
    await mockApis(page);
    await seedPreferences(page);
    await page.setViewportSize(viewport);
    await page.goto("/");

    if (viewport.width < 768) await page.getByRole("button", { name: "Toggle Sidebar" }).click();
    const accountNavigation = page.getByRole("button", { name: "账号管理", exact: true });
    await expect(accountNavigation.locator(".lucide-user-round")).toBeVisible();
    await accountNavigation.click();
    await expect(page.locator("[data-account-management]")).toHaveCount(0);
    const accountDialog = page.getByRole("dialog", { name: "登录网站账号" });
    await expect(accountDialog).toBeVisible();
    const accountPanel = accountDialog.locator("[data-website-account-panel]");
    await expect(accountPanel.locator("[data-wizard-steps]")).toHaveCount(0);
    await accountPanel.getByRole("button", { name: "忘记密码" }).click();
    await expect(accountPanel.getByRole("button", { name: /第 1 步，共 2 步：确认邮箱/ })).toHaveAttribute("aria-current", "step");
    await accountPanel.getByRole("button", { name: "返回登录" }).click();
    await expect(accountPanel.locator("[data-wizard-steps]")).toHaveCount(0);
    await accountPanel.getByRole("button", { name: "创建账号" }).click();
    await expect(accountPanel.locator("[data-wizard-steps]")).toHaveCount(0);
    await expect(accountPanel.getByRole("heading", { name: "创建网站账号" })).toBeVisible();
    await expect(accountPanel.getByRole("link", { name: "服务条款", exact: true })).toHaveAttribute("href", "/terms");
    await expect(accountPanel.getByRole("link", { name: "隐私政策", exact: true })).toHaveAttribute("href", "/privacy");
    await expect(accountPanel.getByText("2–20 个字符，可使用中文、英文字母、数字、空格、下划线和短横线。", { exact: true })).toBeVisible();
    await accountPanel.getByRole("textbox", { name: "邮箱", exact: true }).fill(`account-${viewport.width}@example.test`);
    await page.getByLabel("密码", { exact: true }).fill("secure-password-1");
    await page.getByLabel("昵称").fill("博士😀");
    await page.getByRole("button", { name: "创建账号并发送验证码" }).click();
    await expect(accountPanel.getByText(/昵称只能使用中文、英文字母、数字/)).toBeVisible();
    await page.getByLabel("昵称").fill("测试用户");
    await expect(accountPanel.getByRole("meter", { name: "密码强度" })).toHaveAttribute("aria-valuetext", "强");
    await page.getByRole("button", { name: "创建账号并发送验证码" }).click();
    await expect(accountPanel.locator("[data-wizard-steps]")).toHaveCount(0);
    for (const [index, digit] of [..."123456"].entries()) {
      await accountPanel.getByRole("textbox", { name: `邮箱验证码第 ${index + 1} 位，共 6 位` }).fill(digit);
    }
    await accountPanel.getByRole("button", { name: "验证邮箱", exact: true }).click();
    await expect(accountPanel.getByText("邮箱验证完成", { exact: true })).toBeVisible();
    await expect(accountPanel.getByText("邮箱验证完成，现在可以登录网站账号。")).toBeVisible();
  });
}

for (const viewport of [
  { width: 390, height: 844 },
  { width: 768, height: 900 },
  { width: 1440, height: 900 },
]) {
  test(`cloud consent, sync, restore, plan controls, and deletion work at ${viewport.width}px`, async ({ page }) => {
    let consentCurrent = false;
    let workspace: Record<string, unknown> | null = null;
    let workspaceWrites = 0;
    let restoreRequests = 0;
    let revokeRequests = 0;
    let deleteRequests = 0;
    let failNextDelete = viewport.width === 390;
    let planDeleted = false;
    let planPinned = false;
    const revisionId = "33333333-3333-4333-8333-333333333333";
    const timestamp = "2026-08-21T08:00:00.000Z";
    const savedPlanContext = {
      presetLabel: "333",
      layout: { ...layout243, template: "333" },
      rotationProfile: "abc_12_6_6",
      fiammettaEnabled: false,
    };
    const fulfill = (route: Route, data: unknown) => route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "X-Request-Id": requestId },
      body: JSON.stringify({ success: true, data, requestId }),
    });

    await page.route("**/api/account/data-consent", async (route) => {
      if (route.request().method() === "POST") {
        const body = route.request().postDataJSON() as Record<string, unknown>;
        expect(body).toMatchObject({ termsAccepted: true, privacyAccepted: true });
        consentCurrent = true;
      } else if (route.request().method() === "DELETE") {
        consentCurrent = false;
        revokeRequests += 1;
        return fulfill(route, { revoked: true, deleted: true });
      }
      return fulfill(route, {
        current: consentCurrent,
        termsVersion: "2026-08-21-cloud-workspace",
        privacyVersion: "2026-08-27-detailed-telemetry",
        acceptedAt: consentCurrent ? timestamp : null,
        revokedAt: null,
        cloudSyncEnabled: true,
      });
    });
    await page.route("**/api/workspace", async (route) => {
      if (route.request().method() === "GET") {
        return fulfill(route, workspace ?? {
          exists: false,
          revision: 0,
          state: null,
          operbox: null,
          result: null,
          updatedAt: null,
          syncedAt: null,
          revisions: [],
        });
      }
      if (route.request().method() === "PUT") {
        const body = route.request().postDataJSON() as Record<string, unknown>;
        if (body.restoreRevisionId) {
          expect(body.restoreRevisionId).toBe(revisionId);
          expect(workspace).not.toBeNull();
          restoreRequests += 1;
          workspace = { ...workspace!, revision: 3, updatedAt: timestamp, syncedAt: timestamp };
          return fulfill(route, workspace);
        }
        workspaceWrites += 1;
        expect((body.state as { boxSource?: string }).boxSource).toBe("maa");
        expect(Array.isArray(body.operbox)).toBe(true);
        expect(JSON.stringify(body)).not.toContain("debugBundle");
        workspace = {
          exists: true,
          revision: 2,
          state: body.state,
          operbox: body.operbox,
          result: body.result,
          updatedAt: timestamp,
          syncedAt: timestamp,
          revisions: [{ id: revisionId, revision: 1, createdAt: timestamp, expiresAt: "2026-09-20T08:00:00.000Z" }],
        };
        return fulfill(route, workspace);
      }
      return fulfill(route, { deleted: true });
    });
    await page.route("**/api/account/saved-plans", (route) => fulfill(route, {
      plans: [
        ...(planDeleted ? [] : [{
          id: "saved-plan-1",
          diagnosticId,
          title: "333 · 本地 MAA",
          calculationContext: savedPlanContext,
          boxMatchesWorkspace: true,
          pinned: planPinned,
          createdAt: timestamp,
          updatedAt: timestamp,
          expiresAt: planPinned ? null : "2026-09-20T08:00:00.000Z",
          result: planData,
        }]),
        {
          id: "saved-plan-legacy",
          diagnosticId: null,
          title: "旧版排班",
          calculationContext: null,
          boxMatchesWorkspace: true,
          pinned: false,
          createdAt: timestamp,
          updatedAt: timestamp,
          expiresAt: "2026-09-20T08:00:00.000Z",
          result: planData,
        },
        {
          id: "saved-plan-box-mismatch",
          diagnosticId: "saved-plan-box-mismatch-diagnostic",
          title: "Box 已变化的排班",
          calculationContext: savedPlanContext,
          boxMatchesWorkspace: false,
          pinned: false,
          createdAt: timestamp,
          updatedAt: timestamp,
          expiresAt: "2026-09-20T08:00:00.000Z",
          result: planData,
        },
      ],
    }));
    await page.route("**/api/account/saved-plans/*", async (route) => {
      if (route.request().method() === "PATCH") {
        planPinned = Boolean((route.request().postDataJSON() as { pinned?: boolean }).pinned);
        return fulfill(route, {
          id: "saved-plan-1",
          diagnosticId,
          title: "333 · 本地 MAA",
          calculationContext: savedPlanContext,
          boxMatchesWorkspace: true,
          pinned: planPinned,
          createdAt: timestamp,
          updatedAt: timestamp,
          expiresAt: null,
          result: planData,
        });
      }
      deleteRequests += 1;
      if (failNextDelete) {
        failNextDelete = false;
        return route.fulfill({
          status: 500,
          contentType: "application/json",
          headers: { "X-Request-Id": requestId },
          body: JSON.stringify({
            success: false,
            error: {
              code: "AIC-SYS-5000",
              message: "排班删除失败，请稍后重试。",
              requestId,
              retryable: true,
            },
            requestId,
          }),
        });
      }
      planDeleted = true;
      return fulfill(route, { deleted: true });
    });

    await mockApis(page);
    await seedV4Session(page, planData, { boxSource: "maa" });
    await page.setViewportSize(viewport);
    await page.goto("/");
    await expect(page.locator('[data-workbench-hydrated="true"]')).toBeVisible();

    const dialog = page.getByRole("dialog", { name: "启用账号云端工作区" });
    await expect(dialog).toBeVisible();
    await dialog.evaluate(async (element) => {
      await Promise.all(element.getAnimations({ subtree: true }).map((animation) => animation.finished.catch(() => undefined)));
    });
    const dialogBox = await dialog.boundingBox();
    expect(dialogBox?.width ?? 0).toBeLessThanOrEqual(viewport.width - 16);
    expect(dialogBox?.height ?? 0).toBeLessThanOrEqual(viewport.height - 16);
    const dialogBody = dialog.locator('[data-slot="dialog-body"]');
    const dialogBodyBox = await dialogBody.boundingBox();
    expect(dialogBodyBox).not.toBeNull();
    const bodyPadding = await dialogBody.evaluate((element) => {
      const style = getComputedStyle(element);
      return { left: Number.parseFloat(style.paddingLeft), right: Number.parseFloat(style.paddingRight) };
    });
    expect(bodyPadding.left).toBeGreaterThanOrEqual(20);
    expect(bodyPadding.right).toBeGreaterThanOrEqual(20);
    const decline = dialog.getByRole("button", { name: "继续纯本地模式" });
    const accept = dialog.getByRole("button", { name: "同意并开始同步" });
    const declineBox = await decline.boundingBox();
    const acceptBox = await accept.boundingBox();
    expect(declineBox).not.toBeNull();
    expect(acceptBox).not.toBeNull();
    const [declineHeight, acceptHeight] = await Promise.all([
      decline.evaluate((element) => Number.parseFloat(getComputedStyle(element).height)),
      accept.evaluate((element) => Number.parseFloat(getComputedStyle(element).height)),
    ]);
    expect(declineHeight).toBeGreaterThanOrEqual(44);
    expect(acceptHeight).toBeGreaterThanOrEqual(44);
    if (viewport.width < 640) {
      expect(acceptBox!.y).toBeGreaterThan(declineBox!.y);
      expect(Math.abs(acceptBox!.width - declineBox!.width)).toBeLessThanOrEqual(1);
    } else {
      expect(Math.abs(acceptBox!.y - declineBox!.y)).toBeLessThanOrEqual(1);
    }
    if (viewport.width === 390) {
      await page.setViewportSize({ width: 390, height: 480 });
      const compactDialogBox = await dialog.boundingBox();
      expect(compactDialogBox?.height ?? 0).toBeLessThanOrEqual(464);
      await expect(dialog.getByRole("heading", { name: "启用账号云端工作区" })).toBeVisible();
      await expect(decline).toBeVisible();
      await expect(accept).toBeVisible();
      expect(await dialogBody.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true);
      await page.setViewportSize(viewport);
    }
    await expect(accept).toBeDisabled();
    await dialog.getByRole("checkbox").nth(0).check();
    await dialog.getByRole("checkbox").nth(1).check();
    await accept.click();
    await expect(dialog).toHaveCount(0);
    await expect.poll(() => workspaceWrites).toBe(1);

    await navigateToPrimaryPage(page, {
      name: "账号管理",
      href: "/account",
      root: "[data-account-management]",
    }, viewport.width < 768);
    const cloudPanel = page.locator("[data-cloud-data-panel]");
    await expect(cloudPanel).toBeVisible();
    await expect(cloudPanel).toContainText("已同步 · 最近同步");
    await expect(cloudPanel).not.toContainText("可恢复版本");
    await expect(cloudPanel).not.toContainText("修订 1");
    await expect(cloudPanel).not.toContainText("最多 10 版");
    await expect(cloudPanel).not.toContainText("最近 5 条");
    const devicesCard = page.locator("[data-infra-technical-card]").filter({ has: page.getByRole("heading", { name: "登录设备" }) });
    const cloudCard = page.locator('[data-slot="cloud-workspace-card"]');
    const devicesTitle = devicesCard.getByRole("heading", { name: "登录设备" });
    const cloudTitle = cloudCard.getByRole("heading", { name: "账号云端工作区" });
    const restorePlan = cloudCard.getByRole("button", { name: "恢复排班：333 · 本地 MAA" });
    const pinPlan = cloudCard.getByRole("button", { name: "固定排班：333 · 本地 MAA" });
    const deletePlan = cloudCard.getByRole("button", { name: "删除排班：333 · 本地 MAA" });
    const legacyRestore = cloudCard.getByRole("button", { name: "恢复排班：旧版排班" });
    const mismatchRestore = cloudCard.getByRole("button", { name: "恢复排班：Box 已变化的排班" });
    await expect(cloudCard).toBeVisible();
    await expect(cloudPanel.locator("button svg")).toHaveCount(0);
    expect(await cloudPanel.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
    await expect(cloudPanel.getByText("333 · 本地 MAA", { exact: true })).toBeVisible();
    await expect(cloudPanel.getByText("旧版排班", { exact: true })).toBeVisible();
    await expect(cloudPanel.getByText("缺少计算配置，无法恢复", { exact: true })).toBeVisible();
    await expect(cloudPanel.getByText("MAA Box 不一致，无法恢复", { exact: true })).toBeVisible();
    await expect(legacyRestore).toBeDisabled();
    await expect(mismatchRestore).toBeDisabled();
    const matchingStyles = await Promise.all([
      devicesTitle.evaluate((element) => getComputedStyle(element).fontSize),
      cloudTitle.evaluate((element) => getComputedStyle(element).fontSize),
      restorePlan.evaluate((element) => Number.parseFloat(getComputedStyle(element).height)),
      pinPlan.evaluate((element) => Number.parseFloat(getComputedStyle(element).height)),
      deletePlan.evaluate((element) => Number.parseFloat(getComputedStyle(element).height)),
    ]);
    expect(matchingStyles[1]).toBe(matchingStyles[0]);
    expect(matchingStyles.slice(2)).toEqual([44, 44, 44]);
    expect(restoreRequests).toBe(0);
    await pinPlan.click();
    await expect.poll(() => planPinned).toBe(true);
    await expect(cloudPanel.getByRole("button", { name: "取消固定排班：333 · 本地 MAA" })).toBeVisible();
    await cloudPanel.getByRole("button", { name: "恢复排班：333 · 本地 MAA" }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.locator("[data-plan-result-summary]")).toContainText("333 基建方案");
    await navigateToPrimaryPage(page, {
      name: "账号管理",
      href: "/account",
      root: "[data-account-management]",
    }, viewport.width < 768);
    const restoredCloudPanel = page.locator("[data-cloud-data-panel]");
    await expect(restoredCloudPanel).toBeVisible();
    await restoredCloudPanel.getByRole("button", { name: "删除排班：333 · 本地 MAA" }).click();
    expect(deleteRequests).toBe(0);
    await expect(restoredCloudPanel.getByRole("button", { name: "取消删除排班：333 · 本地 MAA" })).toBeVisible();
    const confirmDelete = restoredCloudPanel.getByRole("button", { name: "确认删除排班：333 · 本地 MAA" });
    await expect(confirmDelete).toBeVisible();
    await expect(restoredCloudPanel.locator("[data-cloud-delete-status]")).toContainText("请确认是否删除排班");

    if (viewport.width === 390) {
      await restoredCloudPanel.getByRole("button", { name: "取消删除排班：333 · 本地 MAA" }).click();
      expect(deleteRequests).toBe(0);
      await expect(restoredCloudPanel.locator("[data-cloud-delete-status]")).toContainText("已取消删除排班");

      await restoredCloudPanel.getByRole("button", { name: "删除排班：333 · 本地 MAA" }).click();
      await page.waitForTimeout(8_200);
      expect(deleteRequests).toBe(0);
      await expect(restoredCloudPanel.getByRole("button", { name: "确认删除排班：333 · 本地 MAA" })).toHaveCount(0);
      await expect(restoredCloudPanel.locator("[data-cloud-delete-status]")).toContainText("删除确认已超时");

      await restoredCloudPanel.getByRole("button", { name: "删除排班：333 · 本地 MAA" }).click();
      await restoredCloudPanel.getByRole("button", { name: "确认删除排班：333 · 本地 MAA" }).click();
      await expect.poll(() => deleteRequests).toBe(1);
      expect(planDeleted).toBe(false);
      await expect(restoredCloudPanel).toContainText("排班删除失败，请稍后重试。");

      await restoredCloudPanel.getByRole("button", { name: "删除排班：333 · 本地 MAA" }).click();
    }
    await restoredCloudPanel.getByRole("button", { name: "确认删除排班：333 · 本地 MAA" }).click();
    await expect.poll(() => planDeleted).toBe(true);
    expect(deleteRequests).toBe(viewport.width === 390 ? 2 : 1);

    const revoke = restoredCloudPanel.getByRole("button", { name: /按住撤销并删除/ });
    await revoke.scrollIntoViewIfNeeded();
    await expect(revoke).toBeVisible();
    const revokeBox = await revoke.boundingBox();
    expect(revokeBox).not.toBeNull();
    const revokeX = revokeBox!.x + revokeBox!.width / 2;
    const revokeY = revokeBox!.y + revokeBox!.height / 2;
    await page.mouse.move(revokeX, revokeY);
    await page.mouse.down();
    for (let frame = 0; frame < 20; frame += 1) {
      await page.mouse.move(revokeX + (frame % 2), revokeY);
      await page.waitForTimeout(100);
    }
    await page.mouse.up();
    await expect.poll(() => revokeRequests).toBe(1);
    await expect(restoredCloudPanel).toContainText("当前保持纯本地模式，不会上传已有数据。");
  });
}

test("website login lazy-loads its UI without probing the shared session again", async ({ page }) => {
  await page.addInitScript(() => {
    window.requestIdleCallback = () => 1;
    window.cancelIdleCallback = () => undefined;
  });
  await page.unroute("**/api/auth/get-session");
  let sessionRequests = 0;
  await page.route("**/api/auth/get-session", async (route) => {
    sessionRequests += 1;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: "null",
    });
  });
  let releaseChunks: (() => void) | undefined;
  const chunkGate = new Promise<void>((resolve) => {
    releaseChunks = resolve;
  });
  let deferredChunkRequests = 0;
  await page.route("**/_next/static/chunks/*.js", async (route) => {
    const response = await route.fetch();
    const body = await response.body();
    if (body.toString("utf8").includes("function WebsiteAccountDialog({")) {
      deferredChunkRequests += 1;
      await chunkGate;
    }
    await route.fulfill({ response, body });
  });
  await mockApis(page);
  await seedPreferences(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await expect.poll(() => sessionRequests).toBe(1);
  await page.waitForTimeout(100);

  await page.getByRole("button", { name: "账号管理", exact: true }).click();
  const loadingDialog = page.locator("[data-website-account-dialog-loading]");
  await expect(loadingDialog).toBeVisible();
  await expect(loadingDialog.getByRole("status")).toContainText("正在加载登录界面…");
  await expect(loadingDialog.locator('[data-slot="skeleton"]')).toHaveCount(0);
  await expect(page.locator("[data-website-account-panel]")).toHaveCount(0);
  await expect(page.getByRole("dialog")).toHaveCount(1);
  await expect.poll(() => deferredChunkRequests).toBeGreaterThan(0);

  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(loadingDialog.locator("[data-website-account-loading-spinner]")).toHaveCSS("animation-name", "none");
  await page.keyboard.press("Escape");
  await expect(loadingDialog).toHaveCount(0);
  await expect(page.getByRole("button", { name: "账号管理", exact: true })).toBeFocused();
  await page.getByRole("button", { name: "账号管理", exact: true }).click();
  await expect(loadingDialog).toBeVisible();

  for (const viewport of [
    { width: 390, height: 844 },
    { width: 768, height: 900 },
    { width: 1440, height: 900 },
  ]) {
    await page.setViewportSize(viewport);
    await expect(loadingDialog).toBeVisible();
    const box = await loadingDialog.boundingBox();
    expect(box).not.toBeNull();
    expect(box?.width ?? 0).toBeLessThanOrEqual(viewport.width - 16);
    expect(box?.height ?? 0).toBeLessThanOrEqual(viewport.height - 16);
  }

  releaseChunks?.();
  await page.unroute("**/_next/static/chunks/*.js");
  await expect(loadingDialog).toHaveCount(0);
  const accountDialog = page.getByRole("dialog", { name: "登录网站账号" });
  await expect(accountDialog.locator("[data-website-account-panel]")).toBeVisible();
  expect(sessionRequests).toBe(1);
  await expect(accountDialog.locator('[data-slot="skeleton"]')).toHaveCount(0);
  await expect(accountDialog.locator("[data-account-action-cards]")).toHaveCount(0);
  await expect(page.getByRole("dialog")).toHaveCount(1);

  await page.keyboard.press("Escape");
  await expect(accountDialog).toHaveCount(0);
  await expect(page.getByRole("button", { name: "账号管理", exact: true })).toBeFocused();
  await page.getByRole("button", { name: "账号管理", exact: true }).click();
  await expect(accountDialog.locator("[data-website-account-panel]")).toBeVisible();
  expect(sessionRequests).toBe(1);
});

test("website login opens account management after the gated navigation dialog", async ({ page }) => {
  let authenticated = false;
  await page.unroute("**/api/auth/get-session");
  await page.route("**/api/auth/get-session", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: authenticated ? JSON.stringify({
      session: { id: "signed-in-session", token: "token", userId: "signed-in-user", expiresAt: new Date(Date.now() + 3_600_000).toISOString(), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
      user: { id: "signed-in-user", name: "新用户", email: "signed-in@example.test", emailVerified: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
    }) : "null",
  }));
  await page.route("**/api/auth/sign-in/email", (route) => {
    authenticated = true;
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ redirect: false, token: "token", user: { id: "signed-in-user", name: "新用户", email: "signed-in@example.test", emailVerified: true } }) });
  });
  await mockApis(page, { sklandConfigured: true });
  await seedPreferences(page);
  await page.goto("/");
  await page.getByRole("button", { name: "账号管理", exact: true }).click();
  const accountPanel = page.locator("[data-website-account-panel]");
  await accountPanel.getByRole("textbox", { name: "邮箱", exact: true }).fill("signed-in@example.test");
  await accountPanel.getByLabel("密码", { exact: true }).fill("secure-password-1");
  await accountPanel.getByRole("button", { name: "登录", exact: true }).click();

  await expect(page.getByRole("dialog", { name: "登录网站账号" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "账号管理", exact: true })).toHaveAttribute("data-active", "");
  await expect(page.locator("[data-account-management]")).toBeVisible();
  await expect(page.getByText("signed-in@example.test", { exact: true })).toBeVisible();
  const websiteAvatar = page.locator("[data-website-account-avatar]");
  await expect(websiteAvatar).toBeVisible();
  await expect(websiteAvatar).toHaveAttribute("data-account-orb-color", /^#[0-9A-F]{6}$/);
  await expect(websiteAvatar.locator("canvas")).toBeVisible();
  await expect(websiteAvatar.locator("[data-fluid-orb-fallback]")).toBeVisible();
  await expect(websiteAvatar.locator("[data-fluid-orb-fallback]")).toHaveCSS("opacity", "0");
  await expect(websiteAvatar).not.toContainText("新");
  const websiteAvatarBox = await websiteAvatar.boundingBox();
  expect(websiteAvatarBox?.width).toBeCloseTo(56, 0);
  expect(websiteAvatarBox?.height).toBeCloseTo(56, 0);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(websiteAvatar).toHaveAttribute("data-fluid-orb-motion", /^(still|fallback)$/);
});

test("website login resumes the protected personal plan intent", async ({ page }) => {
  let authenticated = false;
  await page.unroute("**/api/auth/get-session");
  await page.route("**/api/auth/get-session", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: authenticated ? JSON.stringify({
      session: { id: "signed-in-session", token: "token", userId: "signed-in-user", expiresAt: new Date(Date.now() + 3_600_000).toISOString(), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
      user: { id: "signed-in-user", name: "新用户", email: "signed-in@example.test", emailVerified: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
    }) : "null",
  }));
  await page.route("**/api/auth/sign-in/email", (route) => {
    authenticated = true;
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ redirect: false, token: "token", user: { id: "signed-in-user", name: "新用户", email: "signed-in@example.test", emailVerified: true } }) });
  });
  await mockApis(page);
  await seedV4Session(page, null, { boxSource: "maa" });
  await page.goto("/");

  await page.getByRole("button", { name: "生成排班" }).click();
  const accountPanel = page.locator("[data-website-account-panel]");
  await accountPanel.getByRole("textbox", { name: "邮箱", exact: true }).fill("signed-in@example.test");
  await accountPanel.getByLabel("密码", { exact: true }).fill("secure-password-1");
  await accountPanel.getByRole("button", { name: "登录", exact: true }).click();

  await expect(page.getByRole("dialog", { name: "登录网站账号" })).toHaveCount(0);
  await expect(page.locator("[data-plan-board]")).toHaveAttribute("data-plan-revision", diagnosticId);
  await expect(page.getByRole("button", { name: "导出到 MAA" })).toBeEnabled();
});

test("website account Fluid Orb keeps its CSS fallback without WebGL", async ({ page }) => {
  await page.addInitScript(() => {
    const originalGetContext = HTMLCanvasElement.prototype.getContext;
    Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
      configurable: true,
      value(contextId: string, ...args: unknown[]) {
        if (contextId === "webgl") return null;
        return Reflect.apply(originalGetContext, this, [contextId, ...args]);
      },
    });
  });
  await mockApis(page, { sklandConfigured: true });
  await seedPreferences(page);
  await page.goto("/account");

  const websiteAvatar = page.locator("[data-website-account-avatar]");
  await expect(websiteAvatar).toBeVisible();
  await expect(websiteAvatar).toHaveAttribute("data-fluid-orb-motion", "fallback");
  await expect(websiteAvatar.locator("[data-fluid-orb-fallback]")).toBeVisible();
  await expect(websiteAvatar.locator("[data-fluid-orb-fallback]")).toHaveCSS("opacity", "1");
});

test("seven-day bindings stay visible and require QR renewal", async ({ page }) => {
  await mockApis(page, { sklandConfigured: true, sklandBindingCount: 1, sklandRenewalDueCount: 1 });
  await seedPreferences(page);
  await page.goto("/");
  const sklandNavigation = page.getByRole("button", { name: "森空岛状态中心", exact: true });
  await expect(sklandNavigation.locator(".lucide-cloud")).toBeVisible();
  await sklandNavigation.click();
  await expect(page.getByText("ACCOUNT TERMINAL", { exact: true })).toHaveCount(0);
  await expect(page.getByText("统一管理网站账号、登录设备和森空岛授权。森空岛凭据固定七天失效，到期后需要重新扫码。", { exact: true })).toHaveCount(0);
  await expect(page.locator("[data-skland-binding-summary]")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "七天授权期已结束，请扫码续期" })).toBeVisible();
  await expect(page.locator("[data-skland-login-panel]")).toBeVisible();
});

test("a cached Skland box is labeled separately when the website binding needs browser reauthorization", async ({ page }) => {
  await mockApis(page, { sklandConfigured: true, sklandBindingCount: 1 });
  await seedV4Session(page, planData, { boxSource: "skland" });
  await page.goto("/");

  await openSklandOverview(page);
  await expect(page.getByRole("heading", { name: "森空岛已绑定，请授权当前浏览器" })).toBeVisible();
  await expect(page.getByText(/网站账号仍保留 1 个森空岛绑定/)).toBeVisible();

  await page.getByRole("button", { name: "Toggle Sidebar" }).click();
  await page.getByRole("button", { name: "基建计算器", exact: true }).click();
  await page.getByRole("button", { name: "配置Box与布局" }).first().click();
  const setupDialog = page.getByRole("dialog");
  await setupDialog.getByRole("button", { name: /第 1 步，共 3 步：干员数据/ }).click();
  await expect(setupDialog.getByText("上次同步的森空岛数据", { exact: true })).toBeVisible();
});

test("account settings revokes every session and returns to the app", async ({ page }) => {
  let revokeRequests = 0;
  let authenticated = true;
  await page.unroute("**/api/auth/get-session");
  await page.route("**/api/auth/get-session", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: authenticated ? JSON.stringify({
      session: { id: "test-session", token: "test-token", userId: "test-user", expiresAt: new Date(Date.now() + 3_600_000).toISOString(), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
      user: { id: "test-user", name: "测试用户", email: "test@example.com", emailVerified: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
    }) : "null",
  }));
  await page.route("**/api/auth/revoke-sessions", (route) => {
    revokeRequests += 1;
    authenticated = false;
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ status: true }) });
  });
  await mockApis(page);
  await seedPreferences(page);
  await page.goto("/");
  await page.getByRole("button", { name: "账号管理", exact: true }).click();

  const accountManagement = page.locator("[data-account-management]");
  await expect(accountManagement).toBeVisible();
  await expect(page.getByText("test@example.com", { exact: true }).last()).toBeVisible();
  await page.getByRole("button", { name: "退出全部设备" }).last().click();
  await expect.poll(() => revokeRequests).toBe(1);
  await expect(page.locator("[data-account-management]")).toHaveCount(0);
  await expect(page.locator("[data-calculator-controls]")).toBeVisible();
  await expect(page.getByRole("dialog", { name: "登录网站账号" })).toHaveCount(0);
  const accountRoute = await page.request.get("/account");
  expect(accountRoute.status()).toBe(200);
  expect(await accountRoute.text()).toContain("data-workbench-hydrated");
});

test("password reset rejects a link without a token before making a request", async ({ page }) => {
  let resetRequests = 0;
  await page.route("**/api/auth/reset-password", (route) => {
    resetRequests += 1;
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ status: true }) });
  });
  await page.goto("/account/reset-password");
  await expect(page.getByText("重置链接无效或缺少令牌，请重新申请密码重置邮件。")).toBeVisible();
  await expect(page.getByRole("button", { name: "确认重置" })).toBeDisabled();
  expect(resetRequests).toBe(0);
});

test("anonymous MAA data cannot drive planning or training advice", async ({ page }) => {
  await page.unroute("**/api/auth/get-session");
  await page.route("**/api/auth/get-session", (route) => route.fulfill({ status: 200, contentType: "application/json", body: "null" }));
  await mockApis(page);
  await seedV4Session(page, planData, { boxSource: "maa" });
  await page.goto("/");

  await expect(page.locator("[data-calculator-controls]")).toBeVisible({ timeout: 15_000 });
  const protectedRun = page.getByRole("button", { name: "生成排班" });
  await expect(protectedRun).toBeEnabled();
  await protectedRun.click();
  await expect(page.getByRole("dialog", { name: "登录网站账号" })).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "练卡建议" }).click();
  await expect(page.locator('[data-primary-page="training"]')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator("[data-training-page]")).toBeVisible({ timeout: 45_000 });
  await expect(page.getByRole("heading", { name: "登录后查看练卡建议" })).toBeVisible();
  await expect(page.getByText("当前数据来自自主上传或第三方同步。请前往账号管理登录；匿名状态仍可改用全角色样例生成建议。", { exact: true })).toBeVisible();
  await expect(page.locator("[data-training-advice-list]")).toHaveCount(0);
});

test("server auth boundaries reject anonymous planning and every development Skland route", async ({ request }) => {
  const maaResponse = await request.post("/api/plan", {
    data: { layout: layout243, operbox: [], sourceName: "anonymous.json", boxSource: "maa", rotation: "abc_12_6_6" },
  });
  expect(maaResponse.status()).toBe(401);
  expect((await maaResponse.json()).error.code).toBe("AIC-AUTH-2008");

  const forgedSample = await request.post("/api/plan", {
    data: { layout: layout243, operbox: [], sourceName: "forged.json", boxSource: "sample", rotation: "abc_12_6_6" },
  });
  expect(forgedSample.status()).toBe(400);
  expect((await forgedSample.json()).error.code).toBe("AIC-REQ-1001");

  for (const [method, path] of [
    ["GET", "/api/skland/session"],
    ["GET", "/api/skland/session?mode=summary"],
    ["DELETE", "/api/skland/session"],
    ["GET", "/api/skland/accounts"],
    ["GET", "/api/skland/accounts?mode=summary"],
    ["DELETE", "/api/skland/accounts"],
    ["DELETE", "/api/skland/accounts/account_test"],
    ["POST", "/api/skland/auth/qr"],
    ["POST", "/api/skland/auth/qr/status"],
    ["POST", "/api/skland/sync"],
    ["POST", "/api/skland/role"],
    ["GET", "/api/skland/status"],
    ["POST", "/api/skland/status/refresh"],
    ["DELETE", "/api/skland/data"],
    ["DELETE", "/api/skland/account-data"],
  ] as const) {
    const response = await request.fetch(path, { method });
    expect(response.status(), `${method} ${path}`).toBe(401);
    expect((await response.json()).error.code, `${method} ${path}`).toBe("AIC-AUTH-2008");
  }

  const nativeAdmin = await request.post("/api/auth/admin/list-users", { data: {} });
  expect(nativeAdmin.status()).toBe(404);
  expect((await request.get("/admin/users")).status()).toBe(404);
});

test("serves versioned WebP portraits with immutable caching only when versioned", async ({ request }) => {
  expect(amiyaPortrait).toMatch(/^\/images\/operator-portraits\/002_amiya\.webp\?v=\d+-[0-9a-f]{12}$/);
  const versioned = await request.get(amiyaPortrait);
  expect(versioned.ok()).toBe(true);
  expect(versioned.headers()["content-type"]).toContain("image/webp");
  expect(versioned.headers()["cache-control"]).toContain("max-age=31536000");
  expect(versioned.headers()["cache-control"]).toContain("immutable");

  const unversioned = await request.get(amiyaPortrait.split("?")[0]);
  expect(unversioned.ok()).toBe(true);
  expect(unversioned.headers()["cache-control"]).toBe("public, max-age=0");
});

test("prefetches only the adjacent shift portrait during browser idle time", async ({ page }) => {
  await mockApis(page);
  await seedV4Session(page, adjacentPortraitPlanData);
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "connection", {
      configurable: true,
      value: { effectiveType: "4g", saveData: false },
    });
    window.requestIdleCallback = (callback) => window.setTimeout(() => callback({
      didTimeout: false,
      timeRemaining: () => 50,
    }), 0);
    window.cancelIdleCallback = (handle) => window.clearTimeout(handle);
  });

  const requestedPortraits: string[] = [];
  page.on("request", (request) => {
    if (request.resourceType() === "image" && request.url().includes("/images/operator-portraits/")) {
      requestedPortraits.push(request.url());
    }
  });
  await page.goto("/");
  await expect(page.locator("[data-plan-board]")).toHaveAttribute("data-plan-revision", diagnosticId);

  await expect.poll(() => requestedPortraits.some((url) => url.includes("/003_kalts.webp?"))).toBe(true);
  expect(requestedPortraits.some((url) => url.includes("/4037_demetr.webp?"))).toBe(false);

  const shiftTabs = page.locator('[data-shift-tabs] [role="tab"]');
  await shiftTabs.nth(1).click();
  await expect(shiftTabs.nth(1)).toHaveAttribute("aria-selected", "true");
  await expect.poll(() => requestedPortraits.some((url) => url.includes("/4037_demetr.webp?"))).toBe(true);
});

test("defers a portrait far below the mobile viewport until it approaches view", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "Chromium owns the deterministic native lazy-loading threshold assertion.");
  await mockApis(page);
  await seedV4Session(page, lazyPortraitPlanData);
  await page.addInitScript(() => {
    const styleId = "deferred-portrait-test-style";
    const installDeferredPortraitStyle = () => {
      const target = document.head ?? document.documentElement;
      if (!target) return false;
      let style = document.getElementById(styleId) as HTMLStyleElement | null;
      if (!style) {
        style = document.createElement("style");
        style.id = styleId;
        style.textContent = '[data-room-group="processing"] { margin-top: 3000px !important; }';
      }
      if (!style.isConnected) target.append(style);
      return true;
    };
    installDeferredPortraitStyle();
    const observer = new MutationObserver(installDeferredPortraitStyle);
    observer.observe(document, { childList: true, subtree: true });
    window.addEventListener("DOMContentLoaded", installDeferredPortraitStyle, { once: true });
    window.addEventListener("load", () => {
      installDeferredPortraitStyle();
      observer.disconnect();
    }, { once: true });
  });
  await page.setViewportSize({ width: 390, height: 844 });
  const requestedPortraits: string[] = [];
  page.on("request", (request) => {
    if (request.resourceType() === "image" && request.url().includes("/images/operator-portraits/")) {
      requestedPortraits.push(request.url());
    }
  });
  await page.goto("/");

  const deferredPortrait = page.locator('[data-schedule-view="list"] img[alt="嘉辛塔"]');
  await expect(deferredPortrait).toHaveAttribute("loading", "lazy");
  const viewportHeight = await page.evaluate(() => window.innerHeight);
  await expect.poll(() => deferredPortrait.evaluate((element) => {
    window.scrollTo(0, 0);
    return element.getBoundingClientRect().top;
  })).toBeGreaterThan(viewportHeight * 2);
  await page.waitForTimeout(300);
  expect(requestedPortraits).toHaveLength(3);
  expect(requestedPortraits.some((url) => url.includes("/4237_jcinta.webp?"))).toBe(false);

  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await expect.poll(() => requestedPortraits.some((url) => url.includes("/4237_jcinta.webp?"))).toBe(true);
});

test("restores a v4 schedule without hydration errors and keeps only safe data", async ({ page }) => {
  await mockApis(page);
  await seedV4Session(page);
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });

  await page.goto("/");
  await expect(page.locator("[data-plan-board]")).toHaveAttribute("data-plan-revision", diagnosticId);
  await expect(page.locator('[data-slot="live-activity"]')).toHaveCount(0);
  await page.reload();
  await expect(page.locator("[data-plan-board]")).toHaveAttribute("data-plan-revision", diagnosticId);
  await expect(page.locator('[data-slot="live-activity"]')).toHaveCount(0);
  expect(consoleErrors.filter((message) => /hydration|did not match/i.test(message))).toEqual([]);

  const persisted = await page.evaluate(() => JSON.parse(
    window.localStorage.getItem("arknights-infra-calc-session-v5") ?? "{}"
  ));
  expect(persisted.savedAt).toBeTruthy();
  expect(persisted.expiresAt).toBeTruthy();
  expect(persisted.result.debug).toBeUndefined();
  expect(JSON.stringify(persisted)).not.toContain("cliPath");
  expect(JSON.stringify(persisted)).not.toContain("stdout");
});

test("planning preloads every versioned product icon and renders direct immutable WebP requests", async ({ page }) => {
  await mockApis(page);
  await seedV4Session(page, null);
  await page.unroute("**/api/plan");

  let releasePlan!: () => void;
  const planBarrier = new Promise<void>((resolve) => {
    releasePlan = resolve;
  });
  let planReleased = false;
  const productsRequestedBeforePlanResponse = new Set<string>();
  page.on("request", (request) => {
    if (!planReleased && request.url().includes("/images/products/")) {
      productsRequestedBeforePlanResponse.add(new URL(request.url()).pathname);
    }
  });
  await page.route("**/api/plan", async (route) => {
    await planBarrier;
    planReleased = true;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, data: planData, requestId }),
    });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "生成排班" }).click();
  await expect.poll(() => productsRequestedBeforePlanResponse.size).toBe(5);
  releasePlan();

  const productImages = page.locator("[data-daily-production-summary] img");
  await expect(productImages).toHaveCount(5);
  const imageAttributes = await productImages.evaluateAll((images) => images.map((image) => ({
    src: image.getAttribute("src"),
    width: image.getAttribute("width"),
    height: image.getAttribute("height"),
    loading: image.getAttribute("loading"),
  })));
  for (const image of imageAttributes) {
    expect(image.src).toMatch(/^\/images\/products\/[a-z_]+\.webp\?v=\d+-[0-9a-f]{12}$/);
    expect(image.src).not.toContain("/_next/image");
    expect(["16", "32"]).toContain(image.width);
    expect(image.height).toBe(image.width);
    expect(image.loading).toBe("eager");
  }

  const versionedPath = imageAttributes[0].src;
  if (!versionedPath) throw new Error("Missing versioned product image path.");
  const versionedResponse = await page.request.get(versionedPath);
  expect(versionedResponse.headers()["cache-control"]).toContain("max-age=31536000");
  expect(versionedResponse.headers()["cache-control"]).toContain("immutable");

  const unversionedResponse = await page.request.get(versionedPath.split("?")[0]);
  expect(unversionedResponse.headers()["cache-control"] ?? "").not.toContain("immutable");
});

test("a failed complete Skland restore keeps the independently restored identity visible", async ({ page }) => {
  await mockApis(page, {
    sklandConfigured: true,
    sklandSnapshot: authenticatedSklandSnapshot,
    sklandSessionFailure: true,
  });
  await page.unroute("**/api/skland/status/refresh");
  let releaseStatus!: () => void;
  const statusBarrier = new Promise<void>((resolve) => {
    releaseStatus = resolve;
  });
  await page.route("**/api/skland/status/refresh", async (route) => {
    await statusBarrier;
    await route.fulfill({ status: 500, contentType: "application/json", body: "{}" });
  });
  await seedPreferences(page);
  const fullRestoreFailed = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return url.pathname === "/api/skland/accounts"
      && !url.searchParams.has("mode")
      && response.status() === 500;
  });
  await page.goto("/");

  const accountControl = page.locator("[data-skland-account-control]");
  await expect(accountControl).toHaveAttribute("aria-label", "测试博士，进入森空岛状态中心");
  const accountAvatar = accountControl.locator("[data-skland-account-avatar]");
  await expect(accountAvatar).toBeVisible();
  await expect(accountAvatar.locator("img")).toHaveCount(0);
  const emptyRemoteAvatar = accountAvatar.locator('[data-remote-avatar-state="fallback"]');
  await expect(emptyRemoteAvatar).toBeVisible();
  await expect(emptyRemoteAvatar.locator('[data-slot="skeleton"]')).toHaveCount(0);
  expect(await emptyRemoteAvatar.evaluate((element) => element.childElementCount)).toBe(0);
  await expect(accountControl).not.toContainText("测");
  await fullRestoreFailed;
  await accountControl.click();
  await expect(page.getByText(/森空岛会话恢复失败，请稍后刷新。/)).toBeVisible();
  await page.getByRole("button", { name: "基建计算器", exact: true }).click();
  await expect(accountControl).toHaveAttribute("aria-label", "测试博士，进入森空岛状态中心");
  releaseStatus();
});

test("a failed Skland avatar request leaves the logged-in calculator control blank", async ({ page }) => {
  const avatarUrl = "https://example.com/unavailable-skland-avatar.png";
  await page.route(avatarUrl, (route) => route.abort("failed"));
  await mockApis(page, {
    sklandConfigured: true,
    sklandSnapshot: {
      ...authenticatedSklandSnapshot,
      player: { ...authenticatedSklandSnapshot.player, avatarUrl },
    },
  });
  await seedPreferences(page);
  await page.goto("/");

  const accountControl = page.locator("[data-skland-account-control]");
  const accountAvatar = accountControl.locator("[data-skland-account-avatar]");
  await expect(accountControl).toBeVisible();
  await expect(accountControl).toHaveAttribute("aria-label", "测试博士，进入森空岛状态中心");
  await expect(accountAvatar.locator("img")).toHaveCount(0);
  const failedRemoteAvatar = accountAvatar.locator('[data-remote-avatar-state="fallback"]');
  await expect(failedRemoteAvatar).toBeVisible();
  await expect(failedRemoteAvatar.locator('[data-slot="skeleton"]')).toHaveCount(0);
  expect(await failedRemoteAvatar.evaluate((element) => element.childElementCount)).toBe(0);
});

test("two-shift output drives product estimates, room formulas, and profile details", async ({ page, browserName }) => {
  await mockApis(page);
  await seedV4Session(page, twoShiftPlanData, { rotationProfile: "main_backup_12_12" });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");

  const shiftTabs = page.getByRole("tab", { name: /第 \d 班 · 12h/ });
  await expect(shiftTabs).toHaveCount(2);
  await expect(page.locator("[data-shift-tabs]")).toHaveCSS("overflow-y", "hidden");
  await expect(page.getByRole("tab", { name: /第 3 班/ })).toHaveCount(0);
  await expect(shiftTabs.first()).toHaveAttribute("aria-label", /主力 上班 · 替补 休息/);

  const dailyProducts = page.locator("[data-daily-production-summary]");
  await expect(dailyProducts).toHaveAttribute("data-production-source", "solver");
  await expect(page.getByText("PLAN ONLINE", { exact: true })).toHaveCount(0);
  await expect(dailyProducts.locator("[data-daily-product-group]")).toHaveCount(3);
  await expect(dailyProducts.locator("[data-daily-product-group]").nth(0)).toHaveAttribute("data-daily-product-group", "experience");
  await expect(dailyProducts.locator("[data-daily-product-group]").nth(1)).toHaveAttribute("data-daily-product-group", "lmd");
  await expect(dailyProducts.locator("[data-daily-product-group]").nth(2)).toHaveAttribute("data-daily-product-group", "orundum");
  await expect(dailyProducts.locator("[data-daily-product]")).toHaveCount(5);
  await expect(dailyProducts.locator('[data-daily-product-group="lmd"] [data-daily-product]').nth(0)).toHaveAttribute("data-daily-product", "lmd-orders");
  await expect(dailyProducts.locator('[data-daily-product-group="lmd"] [data-daily-product]').nth(1)).toHaveAttribute("data-daily-product", "gold");
  await expect(dailyProducts.locator('[data-daily-product-group="orundum"] [data-daily-product]').nth(0)).toHaveAttribute("data-daily-product", "orundum");
  await expect(dailyProducts.locator('[data-daily-product-group="orundum"] [data-daily-product]').nth(1)).toHaveAttribute("data-daily-product", "shards");
  await expect(dailyProducts.locator('[data-daily-product="lmd-orders"]')).toContainText(/龙门币.*34,254.*龙门币/s);
  await expect(dailyProducts.locator('[data-daily-product="gold"]')).toContainText(/赤金.*106.*枚/s);
  await expect(dailyProducts.locator('[data-daily-product="experience"]')).toContainText(/经验.*22,400.*经验/s);
  await expect(dailyProducts.locator('[data-daily-product="shards"]')).toContainText(/源石碎片.*48.*枚/s);
  await expect(dailyProducts.locator('[data-daily-product="orundum"]')).toContainText(/合成玉.*360.*合成玉/s);
  await expect(dailyProducts.getByText("龙门币订单", { exact: true })).toHaveCount(0);
  await waitForOwnAnimations(dailyProducts.locator("[data-plan-metric]").last());

  const primaryProductOffsets = await Promise.all(
    ["experience", "lmd", "orundum"].map((group) => dailyProducts.locator(`[data-daily-product-group="${group}"]`).evaluate((card) => {
      const product = card.querySelector<HTMLElement>("[data-daily-product]");
      if (!product) throw new Error(`Missing primary product in ${card.getAttribute("data-daily-product-group") ?? "unknown"} card`);
      const cardBounds = card.getBoundingClientRect();
      const productBounds = product.getBoundingClientRect();
      return { inlineStart: productBounds.left - cardBounds.left, blockStart: productBounds.top - cardBounds.top };
    })),
  );
  expect(primaryProductOffsets[0].inlineStart).toBeCloseTo(primaryProductOffsets[1].inlineStart, 0);
  expect(primaryProductOffsets[0].inlineStart).toBeCloseTo(primaryProductOffsets[2].inlineStart, 0);
  expect(primaryProductOffsets[0].blockStart).toBeCloseTo(primaryProductOffsets[1].blockStart, 0);
  expect(primaryProductOffsets[0].blockStart).toBeCloseTo(primaryProductOffsets[2].blockStart, 0);

  const manufactureFormula = page.locator('[data-room-title="制造站 1"]');
  const tradeFormula = page.locator('[data-room-title="贸易站 1"]');
  await expect(manufactureFormula).toContainText(/236%\s*=\s*100%\s*\+\s*130%\s*纯技能\s*\+\s*6%\s*跨设施/);
  await expect(tradeFormula).toContainText(/333\.7%\s*=\s*100%\s*\+\s*135%\s*综合加成\s*×\s*1\.42\s*订单机制/);
  await expect(manufactureFormula.getByText("基础", { exact: true })).toHaveCount(0);
  await expect(tradeFormula.getByText("基础", { exact: true })).toHaveCount(0);

  for (const viewport of [{ width: 390, height: 844 }, { width: 768, height: 900 }, { width: 1440, height: 900 }]) {
    await page.setViewportSize(viewport);
    const fit = await dailyProducts.evaluate((element) => ({ clientWidth: element.clientWidth, scrollWidth: element.scrollWidth }));
    expect(fit.scrollWidth).toBeLessThanOrEqual(fit.clientWidth);
    for (const product of await dailyProducts.locator("[data-daily-product-group]").all()) {
      const cardFit = await product.evaluate((element) => ({ clientWidth: element.clientWidth, scrollWidth: element.scrollWidth }));
      expect(cardFit.scrollWidth).toBeLessThanOrEqual(cardFit.clientWidth + 1);
    }
  }

  await page.getByRole("tab", { name: /第 2 班 · 12h/ }).click();
  await expect(shiftTabs.nth(1)).toHaveAttribute("aria-label", /替补 上班 · 主力 休息/);

  await expect(page.getByRole("button", { name: "查看详情", exact: true })).toHaveCount(0);
  const detailsTrigger = page.locator("[data-plan-primary-details-trigger]");
  await detailsTrigger.click();
  const detailsSheet = page.locator('[data-slot="drawer-content"]');
  await expect(detailsSheet).toBeVisible();
  await expect(detailsSheet.getByRole("heading", { name: "预计日产物" })).toBeVisible();
  await expect(detailsSheet.locator("[data-production-details]")).toHaveAttribute("data-production-source", "solver");
  await expect(detailsSheet.getByText("DAILY OUTPUT", { exact: true })).toHaveCount(0);
  await expect(detailsSheet.getByText("完整精度汇总 · 显示取整", { exact: true })).toHaveCount(0);
  await expect(detailsSheet.locator("[data-production-group]").nth(0)).toHaveAttribute("data-production-group", "experience");
  await expect(detailsSheet.locator("[data-production-group]").nth(1)).toHaveAttribute("data-production-group", "lmd");
  await expect(detailsSheet.locator("[data-production-group]").nth(2)).toHaveAttribute("data-production-group", "orundum");
  await expect(detailsSheet.locator('[data-production-group="lmd"] [data-production-detail]').nth(0)).toHaveAttribute("data-production-detail", "lmd-orders");
  await expect(detailsSheet.locator('[data-production-group="lmd"] [data-production-detail]').nth(1)).toHaveAttribute("data-production-detail", "gold");
  await expect(detailsSheet.getByText("龙门币订单", { exact: true })).toHaveCount(0);
  await expect(detailsSheet.locator('[data-production-detail="gold"]')).toContainText("订单原料");
  await expect(detailsSheet.locator('[data-production-group="orundum"] [data-production-detail]').nth(0)).toHaveAttribute("data-production-detail", "orundum");
  await expect(detailsSheet.locator('[data-production-group="orundum"] [data-production-detail]').nth(1)).toHaveAttribute("data-production-detail", "shards");
  await expect(detailsSheet.locator('[data-production-detail="shards"]')).toContainText("制造环节");
  await expect(detailsSheet.locator('[data-production-detail="experience"]')).toContainText(/求解器日产量.*22,400 经验/s);
  await expect(detailsSheet.locator('[data-production-detail="lmd-orders"]')).toContainText(/求解器日产量.*34,254 龙门币/s);
  await expect(detailsSheet.locator('[data-production-detail="gold"]')).toContainText(/求解器日产量.*106 枚/s);
  await expect(detailsSheet.locator('[data-production-detail="orundum"]')).toContainText(/求解器日产量.*360 合成玉/s);
  await expect(detailsSheet.locator('[data-production-detail="shards"]')).toContainText(/求解器日产量.*48 枚/s);
  await expect(detailsSheet.getByText(/限制环节：/)).toHaveCount(0);
  await expect(detailsSheet.locator("[data-production-method]")).toHaveCount(0);
  await expect(detailsSheet.getByRole("heading", { name: "产线提升空间" })).toBeVisible();
  await expect(detailsSheet.getByText("贸易产线", { exact: true }).locator("..")).toContainText("领先推荐方案 6.4%");
  await expect(detailsSheet.getByText("制造产线", { exact: true }).locator("..")).toContainText("领先推荐方案 7.9%");
  await expect(detailsSheet.locator('[data-efficiency-insights] [data-insight-state="positive"]')).toHaveCount(3);
  await expect(detailsSheet.getByRole("heading", { name: "设施组合提升空间" })).toBeVisible();
  await expect(detailsSheet.getByText("领先推荐组合 10.7%", { exact: true })).toBeVisible();
  await expect(detailsSheet.getByText("状态良好", { exact: true })).toBeVisible();
  await expect(detailsSheet.getByText("下一步建议", { exact: true })).toBeVisible();
  await expect(detailsSheet.getByText("原效率与基准", { exact: true })).toHaveCount(0);
  await expect(detailsSheet.getByText("领域指标", { exact: true })).toHaveCount(0);
  await expect(detailsSheet.getByText(/机制等效|当前 1\.42|参考 1\.31/)).toHaveCount(0);
  await expect(detailsSheet.locator('[data-recommendation-card="compact"]')).toHaveCount(1);
  await page.keyboard.press("Escape");
  await expect(page.locator('[data-slot="drawer-root"]')).toHaveCount(0);
  await expect(detailsTrigger).toBeFocused();

  await detailsTrigger.click();
  await expect(detailsSheet).toBeVisible();
  await expect.poll(async () => (await detailsSheet.boundingBox())?.x).toBeCloseTo(880, 0);
  if (browserName === "webkit") {
    await detailsSheet.getByRole("button", { name: "关闭详情" }).click();
  } else {
    const drawerHandle = page.locator('[data-slot="drawer-handle"]');
    const handleBox = await drawerHandle.boundingBox();
    expect(handleBox).not.toBeNull();
    await page.mouse.move(handleBox!.x + 40, handleBox!.y + handleBox!.height / 2);
    await page.mouse.down();
    await page.mouse.move(handleBox!.x + handleBox!.width - 10, handleBox!.y + handleBox!.height / 2, { steps: 12 });
    await page.mouse.up();
  }
  await expect(page.locator('[data-slot="drawer-root"]')).toHaveCount(0);
  await expect(detailsTrigger).toBeFocused();

  await page.getByRole("button", { name: "练卡建议" }).click();
  await expect(page.getByText("练度提升", { exact: true })).toBeVisible();
  await expect(page.getByText("当前 精1 → 目标 精2", { exact: true })).toBeVisible();
});

test("old sessions normalize duplicate operator names before training advice renders", async ({ page }) => {
  await mockApis(page);
  await seedV4Session(page, planData, {
    operbox: [
      { id: "char_amiya_guard", name: "阿米娅", elite: 1, level: 70, own: true, potential: 6, rarity: 5 },
      { id: "char_002_amiya", name: "阿米娅", elite: 2, level: 80, own: true, potential: 6, rarity: 5 },
    ],
  });
  await page.goto("/");

  await page.getByRole("button", { name: "练卡建议" }).click();
  await expect(page.getByText(/干员名称重复：阿米娅/)).toHaveCount(0);
  await expect.poll(async () => page.evaluate(() => JSON.parse(
    window.localStorage.getItem("arknights-infra-calc-session-v5") ?? "{}"
  ).operbox)).toEqual([
    { id: "char_002_amiya", name: "阿米娅", elite: 2, level: 80, own: true, potential: 6, rarity: 5 },
  ]);
});

test("four-shift output persists the fourth tab and migrates an old v4 profile", async ({ page }) => {
  const legacyResult = structuredClone(fourShiftPlanData);
  delete (legacyResult.profile as { rotation_profile?: string }).rotation_profile;
  delete (legacyResult.rotation as { profile?: string }).profile;

  await mockApis(page);
  await seedV4Session(page, legacyResult, {
    activeShift: 0,
    rotationProfile: "fiammetta_8_8_4_4",
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  const fourthShift = page.getByRole("tab", { name: /第 4 班 · 4h/ });
  await expect(page.getByRole("tab", { name: /第 \d 班 · (?:8|4)h/ })).toHaveCount(4);
  await fourthShift.click();
  await expect(fourthShift).toHaveAttribute("aria-selected", "true");
  await expect.poll(async () => page.evaluate(() => JSON.parse(
    window.localStorage.getItem("arknights-infra-calc-session-v5") ?? "{}"
  ).activeShift)).toBe(3);

  await page.reload();
  await expect(page.getByRole("tab", { name: /第 4 班 · 4h/ })).toHaveAttribute(
    "aria-selected",
    "true",
    { timeout: 15_000 },
  );
  const persisted = await page.evaluate(() => JSON.parse(
    window.localStorage.getItem("arknights-infra-calc-session-v5") ?? "{}"
  ));
  expect(persisted.activeShift).toBe(3);
  expect(persisted.result.rotation.profile).toBe("fiammetta_8_8_4_4");
});

test("ignores root attributes injected by browser extensions during hydration", async ({ page }) => {
  await mockApis(page);
  await seedPreferences(page);
  await page.route("**/", async (route) => {
    const response = await fetch(route.request().url(), { headers: route.request().headers() });
    const body = (await response.text()).replace(
      /<html([^>]*)>/,
      '<html$1 data-fabric-scheme="dark">'
    );
    await route.fulfill({
      status: response.status,
      contentType: response.headers.get("content-type") ?? "text/html; charset=utf-8",
      body,
    });
  });
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });

  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("data-fabric-scheme", "dark");
  expect(consoleErrors.filter((message) => /hydration|did not match/i.test(message))).toEqual([]);
});

test("the legacy beta query is inert and never opts plan requests into debug data", async ({ page }) => {
  await mockApis(page, { debugTools: true });
  await seedV4Session(page);
  const planRequests: URL[] = [];
  await page.route(/\/api\/plan(?:\?.*)?$/, (route) => {
    const requestUrl = new URL(route.request().url());
    planRequests.push(requestUrl);
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        data: { ...planData, debug: { command: "infra-cli serve", stdout: "test output", stderr: "" } },
        requestId,
      }),
    });
  });

  await page.goto("/?beta");
  await expect(page.getByText("开启调试工具", { exact: true })).toHaveCount(0);
  await expect(page.getByText("退出调试工具", { exact: true })).toHaveCount(0);
  await expect(page.getByText("调试输出", { exact: true })).toHaveCount(0);
  await expect(page.getByText("问题上下文", { exact: true })).toHaveCount(0);

  await page.getByRole("button", { name: "生成排班" }).click();
  await expect.poll(() => planRequests.length).toBe(1);
  expect(planRequests[0].searchParams.has("beta")).toBe(false);

  await page.getByRole("button", { name: "练卡建议" }).click();
  await expect(page).toHaveURL(/\/training$/);
});

test("shows the thinking activity and indeterminate progress only while a plan request is running", async ({ page }) => {
  await mockApis(page);
  let releasePlan!: () => void;
  const planGate = new Promise<void>((resolve) => {
    releasePlan = resolve;
  });
  await page.route("**/api/plan", async (route) => {
    await planGate;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, data: planData, requestId }),
    });
  });
  await seedPreferences(page);
  await page.goto("/");

  await page.getByRole("button", { name: "全角色导入" }).click();
  await page.getByRole("button", { name: "生成排班" }).click();

  const status = page.locator('[data-slot="live-activity"]');
  const solvingOrb = status.locator('[data-slot="solving-orb"]');
  const progress = status.locator('[data-slot="activity-progress-indicator"]');
  await expect(status).toContainText("正在生成排班");
  await expect(status).toHaveCSS("background-color", "rgb(250, 250, 248)");
  await expect(solvingOrb).toBeVisible();
  await expect(status.locator(".live-activity-shimmer")).toBeVisible();
  await expect(progress).toBeVisible();
  await expect(progress).toHaveCSS("width", /.+/);

  releasePlan();
  await expect(status).toContainText("排班已生成");
  await expect(solvingOrb).toHaveCount(0);
  await expect(status.locator('[data-slot="activity-progress-indicator"]')).toHaveCSS("width", /.+/);
});

test("Skland calculator keeps the schedule visible before and after sidebar navigation", async ({ page }) => {
  await mockApis(page, {
    sklandConfigured: true,
    sklandSnapshot: {
      ...authenticatedSklandSnapshot,
      infrastructure: {
        ...authenticatedSklandSnapshot.infrastructure,
        layoutSuggestion: null,
      },
    },
  });
  await seedPreferences(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");

  await expect(page.locator("[data-skland-account-control]")).toBeVisible();
  const runButton = page.getByRole("button", { name: "生成排班" });
  await expect(runButton).toBeEnabled();

  await expect(page.locator("[data-plan-board]")).toBeVisible();
  await expect(page.locator("[data-calculator-regenerate-panel]")).toHaveCount(0);

  await runButton.click();
  await expect(page.locator('[data-slot="live-activity"]')).toHaveAttribute("data-activity-phase", "success");
  await expect(page.locator("[data-plan-board]")).toHaveAttribute("data-plan-revision", diagnosticId);
  await expect(page.getByRole("button", { name: "导出到 MAA" })).toBeEnabled();
  const comparisonTrigger = page.locator('[data-plan-details-trigger="comparison"]');
  await expect(comparisonTrigger).toBeVisible();
  await comparisonTrigger.click();
  const comparisonSheet = page.locator('[data-slot="drawer-content"]');
  await expect(comparisonSheet.locator("[data-plan-details-section]")).toHaveAttribute("data-plan-details-section", "comparison");
  await expect(comparisonSheet.locator("[data-shift-comparison-details]")).toBeVisible();
  await expect(comparisonSheet.getByText("非宿舍匹配", { exact: true })).toBeVisible();
  await expect(comparisonSheet.getByRole("progressbar", { name: "非宿舍设施匹配百分比" })).toBeVisible();
  const desktopAdjustmentGroups = comparisonSheet.locator("[data-desktop-adjustment-groups]");
  await expect(desktopAdjustmentGroups).toBeVisible();
  await expect(desktopAdjustmentGroups.getByRole("heading", { level: 4 })).toContainText(["需换出", "需换入", "位置调整"]);
  const mobileIssueTone = { unexpected: "bg-amber-100", missing: "bg-sky-100", misplaced: "bg-zinc-200" } as const;
  for (const issue of ["unexpected", "missing", "misplaced"] as const) {
    const group = desktopAdjustmentGroups.locator(`[data-adjustment-group="${issue}"]`);
    const declaredCount = Number((await group.locator(".font-number").textContent())?.match(/\d+/)?.[0] ?? 0);
    const table = group.locator(`[data-desktop-adjustment-table="${issue}"]`);
    if (declaredCount === 0) {
      await expect(table).toHaveCount(0);
      await expect(group.getByText("无", { exact: true })).toBeVisible();
      continue;
    }
    await expect(table.locator("tbody tr")).toHaveCount(declaredCount);
    const tableColumnOffsets = await table.evaluate((element) => {
      const headers = Array.from(element.querySelectorAll("th"));
      const firstRowCells = Array.from(element.querySelectorAll("tbody tr:first-child td"));
      return headers.map((header, index) => Math.abs(header.getBoundingClientRect().x - firstRowCells[index].getBoundingClientRect().x));
    });
    expect(tableColumnOffsets.every((offset) => offset < 0.5)).toBe(true);
  }
  const desktopRoomLabels = desktopAdjustmentGroups.locator("[data-room-label]");
  await expect(desktopRoomLabels.first()).toBeVisible();
  await expect(desktopRoomLabels.first()).toHaveCSS("border-width", "0px");
  await expect(desktopRoomLabels.first().locator("[data-room-indicator]")).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  const mobileAdjustmentGroups = comparisonSheet.locator("[data-mobile-adjustment-groups]");
  await expect(mobileAdjustmentGroups).toBeVisible();
  await expect(mobileAdjustmentGroups.getByRole("heading", { level: 4 })).toContainText(["需换出", "需换入", "位置调整"]);
  for (const issue of ["unexpected", "missing", "misplaced"] as const) {
    const group = mobileAdjustmentGroups.locator(`[data-adjustment-group="${issue}"]`);
    const declaredCount = Number((await group.locator(".font-number").textContent())?.match(/\d+/)?.[0] ?? 0);
    await expect(group.locator("li strong")).toHaveCount(declaredCount);
    await expect(group.getByRole("heading", { level: 4 }).locator("span")).toHaveClass(new RegExp(mobileIssueTone[issue]));
    if (declaredCount === 0) await expect(group.getByText("无", { exact: true })).toBeVisible();
  }
  await expect(mobileAdjustmentGroups.locator("[data-room-label]").first()).toBeVisible();
  await expect(mobileAdjustmentGroups.locator("[data-room-label]").first()).toHaveCSS("border-width", "0px");
  const firstMobileAdjustmentRow = mobileAdjustmentGroups.locator("[data-mobile-adjustment-row]").first();
  const mobileRowAlignment = await firstMobileAdjustmentRow.evaluate((row) => {
    const operator = row.querySelector("strong")?.getBoundingClientRect();
    const action = row.querySelector("[data-mobile-adjustment-action]")?.getBoundingClientRect();
    return operator && action ? Math.abs((operator.top + operator.height / 2) - (action.top + action.height / 2)) : Number.POSITIVE_INFINITY;
  });
  expect(mobileRowAlignment).toBeLessThan(2);
  await expect(firstMobileAdjustmentRow.locator("strong")).toHaveCSS("font-size", "14px");
  const mobileComparisonWidth = await mobileAdjustmentGroups.evaluate((element) => ({ client: element.clientWidth, scroll: element.scrollWidth }));
  expect(mobileComparisonWidth.scroll).toBeLessThanOrEqual(mobileComparisonWidth.client);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.keyboard.press("Escape");
  await expect(page.locator('[data-slot="drawer-root"]')).toHaveCount(0);
  await expect(comparisonTrigger).toBeFocused();

  const returnToCalculator = async (destination: "练卡建议" | "森空岛状态中心", marker: string, label: string) => {
    await page.getByRole("button", { name: destination, exact: true }).click();
    await expect(page.locator(marker)).toBeVisible();
    await armMotionCapture(page, "[data-plan-board]", label, 320);
    await armMotionCapture(page, "[data-plan-result-summary]", `${label}-summary`, 460);
    await armMotionCapture(page, "[data-plan-result-summary] [data-plan-metric]", `${label}-metrics`, 360);
    await page.getByRole("button", { name: "基建计算器", exact: true }).click();

    const returnedBoard = page.locator("[data-plan-board]");
    await expect(returnedBoard).toBeVisible();
    await expect(returnedBoard).toHaveCSS("opacity", "1");
    await expect(returnedBoard).toHaveAttribute("data-plan-revision", diagnosticId);
    await expect(page.getByRole("button", { name: "导出到 MAA" })).toBeEnabled();
    await page.waitForTimeout(650);
    expect(await page.locator("html").getAttribute(`data-motion-enter-${label}`)).toBeNull();
    expect(await page.locator("html").getAttribute(`data-motion-enter-${label}-summary`)).toBeNull();
    expect(await page.locator("html").getAttribute(`data-motion-enter-${label}-metrics`)).toBeNull();
  };

  await returnToCalculator("练卡建议", '[data-slot="training-summary"]', "calculator-return-training");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await returnToCalculator("森空岛状态中心", "[data-skland-view-tabs]", "calculator-return-skland-reduced");
});

test("100% Skland match does not count fatigue-only notices as adjustments", async ({ page }) => {
  await mockApis(page, {
    sklandConfigured: true,
    sklandSnapshot: {
      ...authenticatedSklandSnapshot,
      infrastructure: {
        ...authenticatedSklandSnapshot.infrastructure,
        layoutSuggestion: null,
      },
    },
  });
  const exactPlacementPlanData = {
    ...planData,
    maa: {
      ...planData.maa,
      plans: planData.maa.plans.map((plan) => ({
        ...plan,
        rooms: {
          control: [{ operators: ["阿米娅"] }],
        },
      })),
    },
  };
  await page.route("**/api/plan", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ success: true, data: exactPlacementPlanData, requestId }),
  }));
  await seedPreferences(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");

  await expect(page.locator("[data-skland-account-control]")).toBeVisible();
  await expect(page.locator("[data-plan-board]")).toBeVisible();
  await expect(page.locator("[data-plan-board]")).not.toHaveAttribute("data-plan-revision", /.+/);
  const runButton = page.getByRole("button", { name: "生成排班" });
  await expect(runButton).toBeEnabled();
  await runButton.click();
  await expect(page.locator('[data-slot="live-activity"]')).toHaveAttribute("data-activity-phase", "success");

  const comparisonSummary = page.locator('[data-plan-details-trigger="comparison"]');
  await expect(comparisonSummary).toContainText(/匹配率\s*100%/);
  await expect(comparisonSummary).toContainText("无需调整");
  await expect(comparisonSummary).not.toContainText(/需调整\s*1\s*处/);
  for (const width of [768, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(comparisonSummary).toBeVisible();
    await expect(comparisonSummary).toContainText("无需调整");
  }
});

test("empty returning calculator shows the empty compact schedule", async ({ page }) => {
  await mockApis(page);
  await seedPreferences(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");

  await expect(page.locator("[data-calculator-regenerate-panel]")).toHaveCount(0);
  await expect(page.locator('[data-schedule-view="compact"]')).toBeVisible({ timeout: 45_000 });
  await expect(page.locator('[data-operator-identity="empty"]').first()).toBeVisible();
  await page.getByRole("button", { name: "练卡建议", exact: true }).click();
  await expect(page.locator("[data-training-page]")).toBeVisible({ timeout: 45_000 });
  await expect(page.getByText("ADVICE QUEUE · 00", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "前往生成排班", exact: true })).toHaveCSS("border-radius", "22px");
  await page.getByRole("button", { name: "基建计算器", exact: true }).click();

  await expect(page.locator("[data-calculator-regenerate-panel]")).toHaveCount(0);
  await expect(page.locator('[data-schedule-view="compact"]')).toBeVisible();
  await expect(page.locator('[data-operator-identity="empty"]').first()).toBeVisible();
});

test("plan completion reveals status, metrics, and schedule once without resetting board state", async ({ page, browserName }) => {
  const invalidTransformWarnings: string[] = [];
  page.on("console", (message) => {
    if (/Invalid keyframe value for property transform|translate0d/i.test(message.text())) {
      invalidTransformWarnings.push(message.text());
    }
  });
  await mockApis(page);
  let releasePlan!: () => void;
  const planGate = new Promise<void>((resolve) => {
    releasePlan = resolve;
  });
  await page.route("**/api/plan", async (route) => {
    await planGate;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, data: motionPlanData, requestId }),
    });
  });
  await seedPreferences(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");

  await page.getByRole("button", { name: "全角色导入" }).click();
  const listTab = page.getByRole("tab", { name: "列表式布局" });
  const board = page.locator("[data-plan-board]");
  await expect(listTab).toBeVisible();
  await expect(board).toBeVisible();
  await expect(board).not.toHaveAttribute("data-plan-revision", /.+/);

  if (browserName === "webkit") {
    await armTransientStyleCapture(page, '[data-activity-phase="running"]', "loading-status");
  } else {
    await armMotionCapture(
      page,
      '[data-activity-phase="running"]',
      "loading-status",
      260,
    );
  }
  await page.getByRole("button", { name: "生成排班" }).click();
  const status = page.locator('[data-slot="live-activity"]');
  await expect(status).toHaveAttribute("data-activity-phase", "running");
  if (browserName === "webkit") await expectCapturedStyleMotion(page, "loading-status");
  else await expectCapturedMotion(page, "loading-status", 260);

  if (browserName === "webkit") {
    await armTransientStyleCapture(page, "[data-plan-summary]", "plan-summary");
    await armTransientStyleCapture(page, "[data-plan-metric]", "plan-metrics");
  } else {
    await armMotionCapture(page, "[data-plan-summary]", "plan-summary", 460);
    await armMotionCollectionCapture(page, "[data-plan-metric]", "plan-metrics", 360);
  }
  releasePlan();
  await expect(status).toHaveAttribute("data-activity-phase", "success");
  const summary = page.locator("[data-plan-summary]");
  await expect(summary).toBeVisible();
  await expect(summary).toHaveAttribute("data-plan-entrance", "animated");
  await expect(board).toHaveAttribute("data-plan-revision", diagnosticId);
  await listTab.click();
  const listTrainingRoom = board.locator('[data-schedule-view="list"] [data-room-group="training"]');
  await expect(listTrainingRoom).toBeVisible();
  await expect(listTrainingRoom.locator('[data-position="训练位"]')).toContainText("Training-A");
  await expect(listTrainingRoom.locator('[data-position="协助位"]')).toContainText("Trainer-A");
  await expect(listTrainingRoom).not.toContainText("不参与 MAA 导出");
  expect(await board.evaluate((element) => element.getAnimations().filter((animation) => animation.playState === "running").length)).toBe(0);
  await expect(listTab).toHaveAttribute("aria-selected", "true");
  const dormitorySection = page.locator('section[aria-label="宿舍"]');
  await dormitorySection.locator('button[aria-expanded="true"]').click();
  await dormitorySection.getByRole("button", { name: "暂不显示" }).click();
  const restoreHidden = page.getByRole("button").filter({ hasText: "恢复已隐藏" });
  await expect(restoreHidden).toBeVisible();

  if (browserName === "webkit") {
    await expectCapturedStyleMotion(page, "plan-summary");
    await expectCapturedStyleMotion(page, "plan-metrics");
  } else {
    await expectCapturedMotion(page, "plan-summary", 460, 40);
    await expectCapturedMotionDelays(page, "plan-metrics", 360, [100, 150, 215, 280]);
  }
  const renderingBudget = await page.evaluate(() => {
    const summaryElement = document.querySelector<HTMLElement>("[data-plan-summary]")!;
    const boardElement = document.querySelector<HTMLElement>("[data-plan-board]")!;
    const summaryCalligraphCount = summaryElement.querySelectorAll("[data-calligraph]").length;
    const boardCalligraphCount = boardElement.querySelectorAll("[data-calligraph]").length;
    const roomPrimaryCount = boardElement.querySelectorAll("[data-room-primary-efficiency]").length;
    const animatedTextCalligraphCount = document.querySelectorAll('[data-animated-value="text"] [data-calligraph]').length;
    const clipPathAnimationCount = [summaryElement, boardElement]
      .flatMap((element) => element.getAnimations({ subtree: true }))
      .filter((animation) => {
        const effect = animation.effect;
        return effect instanceof KeyframeEffect && effect.getKeyframes().some((frame) => (
          typeof frame.clipPath === "string" && frame.clipPath !== "none"
        ));
      }).length;
    return {
      animatedTextCalligraphCount,
      boardCalligraphCount,
      clipPathAnimationCount,
      roomPrimaryCount,
      summaryCalligraphCount,
      totalCalligraphCount: document.querySelectorAll("[data-calligraph]").length,
      totalElementCount: document.querySelectorAll("*").length,
    };
  });
  expect(renderingBudget.summaryCalligraphCount).toBe(5);
  expect(renderingBudget.boardCalligraphCount).toBe(renderingBudget.roomPrimaryCount);
  expect(renderingBudget.totalCalligraphCount).toBe(
    renderingBudget.summaryCalligraphCount + renderingBudget.boardCalligraphCount
  );
  expect(renderingBudget.totalCalligraphCount).toBeLessThanOrEqual(20);
  expect(renderingBudget.animatedTextCalligraphCount).toBe(0);
  expect(renderingBudget.clipPathAnimationCount).toBe(0);
  expect(renderingBudget.totalElementCount).toBeLessThan(1_500);

  await page.waitForTimeout(650);
  await board.evaluate((element) => {
    element.setAttribute("data-motion-sentinel", "stable");
  });
  await armTransientStyleCapture(page, "[data-plan-board] [data-operator-identity]", "shift-slots");
  const operatorIdentitiesBefore = await board.locator("[data-operator-identity]").evaluateAll((nodes) => (
    nodes.map((node) => node.getAttribute("data-operator-identity"))
  ));
  const firstShift = page.getByRole("tab", { name: /第 1 班 · 12h/ });
  const secondShift = page.getByRole("tab", { name: /第 2 班 · 6h/ });
  const thirdShift = page.getByRole("tab", { name: /第 3 班 · 6h/ });
  await expect(page.getByText("最近记录", { exact: true })).toHaveCount(0);
  await expect(page.getByText(/较上次求解变更/)).toHaveCount(0);
  await expect(page.locator("[data-shift-actions] [data-shift-tabs]")).toBeVisible();
  await secondShift.click();
  await expect(secondShift).toHaveAttribute("aria-selected", "true");
  await expect(listTrainingRoom.locator('[data-position="训练位"]')).toContainText("Training-B");
  const emptyTrainerPosition = listTrainingRoom.locator('[data-position="协助位"]');
  await expect(emptyTrainerPosition).not.toContainText("空置");
  await expect(emptyTrainerPosition.locator('[aria-label="协助位：空置"]')).toHaveCount(1);
  await expect(board).toHaveAttribute("data-motion-sentinel", "stable");
  expect(await board.evaluate((element) => element.getAnimations().filter((animation) => animation.playState === "running").length)).toBe(0);
  await expectCapturedStyleMotion(page, "shift-slots");
  await expect.poll(() => board.locator("[data-operator-identity]").evaluateAll((nodes) => (
    nodes.map((node) => node.getAttribute("data-operator-identity"))
  ))).not.toEqual(operatorIdentitiesBefore);

  await firstShift.click();
  await thirdShift.click();
  await secondShift.click();
  await expect(secondShift).toHaveAttribute("aria-selected", "true");
  await page.waitForTimeout(320);
  await expect(board.locator('[data-operator-identity="凯尔希"]').first()).toBeVisible();
  await expect(board.locator('[data-operator-identity="阿米娅"], [data-operator-identity="贝洛内"]')).toHaveCount(0);
  if (browserName === "webkit") {
    await armTransientStyleCapture(page, '[data-schedule-view="compact"]', "compact-view");
  } else {
    await armMotionCapture(page, '[data-schedule-view="compact"]', "compact-view", 280);
  }

  await page.getByRole("tab", { name: "一图流布局" }).click();
  await expect(board).toHaveAttribute("data-motion-sentinel", "stable");
  expect(await board.evaluate((element) => element.getAnimations().filter((animation) => animation.playState === "running").length)).toBe(0);
  const compactView = board.locator('[data-schedule-view="compact"]');
  await expect(compactView).toBeVisible();
  const compactTrainingRoom = compactView.locator('[data-room-group="training"]');
  await expect(compactTrainingRoom).toBeVisible();
  await expect(compactTrainingRoom.locator('[data-position="训练位"]')).toContainText("Training-B");
  await expect(compactView.locator(".compact-auxiliary-grid")).toHaveCSS("grid-template-columns", /px/);
  if (browserName === "webkit") {
    await expectCapturedStyleMotion(page, "compact-view");
  } else {
    await expectCapturedMotion(page, "compact-view", 280);
  }
  const auxiliaryGrid = compactView.locator(".compact-auxiliary-grid");
  await expect.poll(() => auxiliaryGrid.evaluate((element) => ({
    columns: getComputedStyle(element).gridTemplateColumns.split(" ").length,
    rows: new Set(Array.from(element.children).map((child) => child.getBoundingClientRect().y)).size,
    fits: element.scrollWidth <= element.clientWidth + 1,
  }))).toEqual({ columns: 2, rows: 2, fits: true });
  for (const group of ["hire", "processing"]) {
    const avatar = auxiliaryGrid.locator(`[data-room-group="${group}"] .infra-operator-slot`).first();
    await expect.poll(() => avatar.evaluate((element) => element.getBoundingClientRect().width)).toBeGreaterThanOrEqual(64);
  }

  await page.setViewportSize({ width: 768, height: 900 });
  await expect(board.locator('[data-schedule-view="list"]')).toBeVisible();
  await expect(board.locator('[data-schedule-view="compact"]')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(board.locator('[data-schedule-view="list"]')).toBeVisible();
  await expect(board.locator('[data-schedule-view="compact"]')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
  expect(invalidTransformWarnings).toEqual([]);
});

test("reduced motion keeps feedback timing while removing movement, clipping, and staggering", async ({ page, browserName }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await mockApis(page);
  let releasePlan!: () => void;
  const planGate = new Promise<void>((resolve) => {
    releasePlan = resolve;
  });
  await page.route("**/api/plan", async (route) => {
    await planGate;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, data: twoShiftPlanData, requestId }),
    });
  });
  await seedPreferences(page);
  await page.setViewportSize({ width: 768, height: 900 });
  await page.goto("/");

  await page.getByRole("button", { name: "全角色导入" }).click();
  await page.getByRole("button", { name: "生成排班" }).click();
  await expect(page.locator('[data-slot="live-activity"]')).toHaveAttribute("data-activity-phase", "running");
  await expect(page.locator('[data-slot="live-activity"] .animate-spin')).toHaveCount(0);

  const board = page.locator("[data-plan-board]");
  await expect(board).toBeVisible();
  await expect(board).not.toHaveAttribute("data-plan-revision", /.+/);

  if (browserName === "webkit") {
    await armTransientStyleCapture(page, "[data-plan-summary]", "reduced-summary");
    await armTransientStyleCapture(page, "[data-plan-metric]", "reduced-metric");
  } else {
    await armMotionCapture(page, "[data-plan-summary]", "reduced-summary", 140);
    await armMotionCapture(page, "[data-plan-metric]", "reduced-metric", 140);
  }
  releasePlan();
  await expect(page.locator('[data-slot="live-activity"]')).toHaveAttribute("data-activity-phase", "success");
  const summary = page.locator("[data-plan-summary]");
  await expect(summary).toBeVisible();
  await expect(summary).toHaveAttribute("data-plan-entrance", "animated");
  await expect(board).toHaveAttribute("data-plan-revision", diagnosticId);
  expect(await board.evaluate((element) => element.getAnimations().filter((animation) => animation.playState === "running").length)).toBe(0);
  if (browserName === "webkit") {
    await expectCapturedStyleMotion(page, "reduced-summary");
    await expectCapturedStyleMotion(page, "reduced-metric");
  } else {
    await expectCapturedMotion(page, "reduced-summary", 140);
    await expectCapturedMotion(page, "reduced-metric", 140);
  }
  const reduced = await page.evaluate(() => {
    const activity = document.querySelector<HTMLElement>('[data-slot="live-activity"]')!;
    const boardElement = document.querySelector<HTMLElement>("[data-plan-board]")!;
    const movingFrames = boardElement.getAnimations({ subtree: true }).flatMap((animation) => {
      const effect = animation.effect;
      return effect instanceof KeyframeEffect ? effect.getKeyframes() : [];
    }).filter((frame) => (
      (typeof frame.transform === "string" && !["none", "matrix(1, 0, 0, 1, 0, 0)"].includes(frame.transform))
      || (typeof frame.clipPath === "string" && frame.clipPath !== "none")
    ));
    return {
      activityAnimationCount: activity.getAnimations({ subtree: true }).filter((animation) => animation.playState === "running").length,
      movingFrameCount: movingFrames.length,
      calligraphCount: boardElement.querySelectorAll("[data-calligraph]").length,
    };
  });
  expect(reduced.activityAnimationCount).toBe(0);
  expect(reduced.movingFrameCount).toBe(0);
  expect(reduced.calligraphCount).toBe(0);
});

test("live activity survives navigation and calculator search occupies the released toolbar space", async ({ page }) => {
  await mockApis(page);
  let releasePlan!: () => void;
  const planGate = new Promise<void>((resolve) => {
    releasePlan = resolve;
  });
  await page.route("**/api/plan", async (route) => {
    await planGate;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, data: twoShiftPlanData, requestId }),
    });
  });
  await seedPreferences(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");

  await expect(page.locator('[data-slot="live-activity"]')).toHaveCount(0);
  await page.getByRole("button", { name: "全角色导入" }).click();
  await page.getByRole("button", { name: "生成排班" }).click();
  const activity = page.locator('[data-slot="live-activity"]');
  await expect(activity).toHaveAttribute("data-activity-phase", "running");

  await page.getByRole("button", { name: "技能查询" }).click();
  await expect(page.getByRole("heading", { name: "技能查询" })).toBeVisible();
  await expect(activity).toHaveAttribute("data-activity-phase", "running");
  releasePlan();
  await expect(activity).toHaveAttribute("data-activity-phase", "success");
  await expect(activity).toHaveCount(0, { timeout: 5_000 });

  await expect(page.getByRole("textbox", { name: "搜索干员名称" })).toBeVisible();
  await expect(page.getByRole("button", { name: "筛选制造站" })).toBeVisible();

  await page.getByRole("button", { name: "基建计算器", exact: true }).click();
  const search = page.getByRole("textbox", { name: "搜索排班中的干员或房间" });
  const toolbar = page.locator("[data-calculator-controls]");
  await expect(search).toBeVisible();
  for (const buttonName of ["配置Box与布局", "生成排班"]) {
    await expect(toolbar.getByRole("button", { name: buttonName })).toHaveCSS("height", "36px");
  }
  await expect(page.locator("[data-calculator-export-actions]").getByRole("button", { name: "全角色导入" })).toHaveCSS("height", "28px");
  await page.keyboard.press("Control+k");
  await expect(search).toBeFocused();
  await search.fill("阿米娅");
  await expect(page.locator("[data-plan-board]")).toContainText("阿米娅");
  await expect(page.getByRole("button", { name: "清空排班搜索" })).toBeVisible();
  await page.getByRole("button", { name: "清空排班搜索" }).click();
  await expect(search).toHaveValue("");

  await page.getByRole("button", { name: "查看快捷键" }).click();
  const shortcutDialog = page.getByRole("dialog");
  await expect(shortcutDialog).toBeVisible();
  await expect(shortcutDialog).toHaveCSS("max-width", "672px");
  await expect(shortcutDialog.locator('[data-slot="kbd"]')).toHaveCount(5);
  await expect(shortcutDialog.locator('[data-slot="kbd-group"]')).toHaveCount(2);
  const shortcutRows = shortcutDialog.locator('[data-slot="kbd-group"]').first().locator("xpath=..");
  await expect(shortcutRows).toHaveCSS("min-height", "56px");
  await page.keyboard.press("Escape");
  await expect(shortcutDialog).toBeHidden();

  await page.setViewportSize({ width: 390, height: 844 });
  const mobileToolbar = await toolbar.evaluate((element) => ({ client: element.clientWidth, scroll: element.scrollWidth }));
  expect(mobileToolbar.scroll).toBeLessThanOrEqual(mobileToolbar.client);
  await expect(search).toHaveCSS("height", "44px");
});

test("failed plan remains expanded with retry and diagnostic actions", async ({ page }) => {
  await mockApis(page);
  let requestCount = 0;
  await page.route("**/api/plan", async (route) => {
    requestCount += 1;
    if (requestCount === 1) {
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({
          success: false,
          error: { code: "AIC-PLAN-3001", message: "排班服务暂不可用，请稍后重试。", retryable: true },
          requestId,
        }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, data: twoShiftPlanData, requestId }),
    });
  });
  await seedPreferences(page);
  await page.goto("/");
  await page.getByRole("button", { name: "全角色导入" }).click();
  await page.getByRole("button", { name: "生成排班" }).click();

  const activity = page.locator('[data-slot="live-activity"]');
  await expect(activity).toHaveAttribute("data-activity-phase", "error");
  await expect(activity).toHaveAttribute("data-activity-view", "expanded");
  await page.waitForTimeout(2_800);
  await expect(activity).toHaveAttribute("data-activity-view", "expanded");
  await activity.hover();
  await expect(activity).toHaveAttribute("data-activity-view", "expanded");
  await activity.getByRole("button", { name: "复制诊断" }).click();
  await expect(activity.getByRole("button", { name: "已复制" })).toBeVisible();
  await activity.getByRole("button", { name: "重试" }).click();
  await expect(page.locator('[data-slot="live-activity"][data-activity-phase="success"]')).toBeVisible();
});

test("dialog and mobile sheet motion preserve direction, exit timing, and focus", async ({ page }) => {
  await mockApis(page);
  await seedV4Session(page, scheduleVisualPlanData);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");

  const setupTrigger = page.getByRole("button", { name: "配置Box与布局" }).first();
  await setupTrigger.click();
  const setupDialog = page.getByRole("dialog");
  await expect(setupDialog).toBeVisible({ timeout: 30_000 });
  await expect(setupDialog).toHaveCSS("transform-origin", /.+/);
  await setupDialog.getByRole("button", { name: "Close" }).click();
  await expect(setupDialog).toHaveCount(0);
  await expect(setupTrigger).toBeFocused();

  await setupTrigger.click();
  await expectMotionDuration(setupDialog, 300);
  await expect(setupDialog).toHaveCSS("transform-origin", /.+/);
  await page.setViewportSize({ width: 768, height: 900 });
  await armEndingTransitionCapture(setupDialog, "setup");
  await setupDialog.getByRole("button", { name: "Close" }).click();
  await expectCapturedExitDuration(page, "setup", 180);
  await expect(setupDialog).toHaveCount(0);
  await expect(setupTrigger).toBeFocused();

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole("tab", { name: "列表式布局" }).click();
  const issueTrigger = page.getByRole("button", { name: /反馈排班问题/ }).first();
  await issueTrigger.click();
  const feedbackDialog = page.getByRole("dialog");
  await expect(feedbackDialog).toBeVisible({ timeout: 30_000 });
  await feedbackDialog.getByRole("button", { name: "取消" }).click();
  await expect(feedbackDialog).toHaveCount(0);
  await expect(issueTrigger).toBeFocused();

  await issueTrigger.click();
  await expectMotionDuration(feedbackDialog, 300);
  await armEndingTransitionCapture(feedbackDialog, "feedback");
  await feedbackDialog.getByRole("button", { name: "取消" }).click();
  await expectCapturedExitDuration(page, "feedback", 180);
  await expect(feedbackDialog).toHaveCount(0);
  await expect(issueTrigger).toBeFocused();

  await page.setViewportSize({ width: 390, height: 844 });
  const sidebarTrigger = page.getByRole("button", { name: "Toggle Sidebar" });
  await sidebarTrigger.click();
  const sheet = page.locator('[data-mobile="true"][data-sidebar="sidebar"]');
  await expect(sheet).toHaveAttribute("data-side", "left");
  await expectMotionDuration(sheet, 320);
  await armEndingTransitionCapture(sheet, "sidebar");
  await page.keyboard.press("Escape");
  await expectCapturedExitDuration(page, "sidebar", 220);
  await expect(sheet).toHaveCount(0);
  await expect(sidebarTrigger).toBeFocused();
});

test("shared action buttons keep their geometry after WebKit interactions", async ({ page }) => {
  await mockApis(page);
  await seedPreferences(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  const moreTools = page.locator("[data-calculator-more-tools]");
  await moreTools.getByText("更多工具", { exact: true }).click();
  const setupTrigger = moreTools.getByRole("button", { name: "配置Box与布局" });
  await setupTrigger.click();
  const setupDialog = page.getByRole("dialog");
  await expect(setupDialog).toBeVisible();
  await setupDialog.getByRole("button", { name: "Close" }).click();
  await expect(setupDialog).toHaveCount(0);
  await expect(setupTrigger).toBeFocused();
  await expectButtonGeometryStable(setupTrigger);
  await moreTools.getByText("更多工具", { exact: true }).click();

  const importButton = page.getByRole("button", { name: "全角色导入" });
  await importButton.click();

  const planButton = page.getByRole("button", { name: "生成排班" });
  await expect(planButton).toBeEnabled();
  await expectButtonGeometryStable(planButton);
  await planButton.click();
  await expect(page.getByText("排班已生成")).toBeVisible();
  await expectButtonGeometryStable(planButton);
});

test("tooltips wait once and then open adjacent help instantly within the provider window", async ({ page, browserName }) => {
  await mockApis(page);
  await seedPreferences(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");

  const calculatorTrigger = page.getByRole("button", { name: "基建计算器" });
  const adviceTrigger = page.getByRole("button", { name: "练卡建议" });
  await expect(calculatorTrigger).toBeVisible();
  await calculatorTrigger.evaluate((trigger) => {
    const root = document.documentElement;
    root.removeAttribute("data-tooltip-entered-at");
    root.removeAttribute("data-tooltip-open-delay");
    const markEntered = () => {
      if (!root.hasAttribute("data-tooltip-entered-at")) {
        root.setAttribute("data-tooltip-entered-at", String(performance.now()));
      }
    };
    trigger.addEventListener("pointerenter", markEntered, { once: true });
    trigger.addEventListener("mouseenter", markEntered, { once: true });
    const observer = new MutationObserver(() => {
      const enteredAt = Number(root.getAttribute("data-tooltip-entered-at"));
      if (!enteredAt || !document.querySelector('[data-slot="tooltip-content"][data-open]')) return;
      root.setAttribute("data-tooltip-open-delay", String(performance.now() - enteredAt));
      observer.disconnect();
    });
    observer.observe(document.body, { attributes: true, childList: true, subtree: true });
  });
  if (browserName === "webkit") {
    await armTransientStyleCapture(page, '[data-slot="tooltip-content"][data-open]', "tooltip");
  }
  await calculatorTrigger.hover();
  const firstTooltip = page.locator('[data-slot="tooltip-content"][data-open]');
  await expect(firstTooltip).toBeVisible({ timeout: 1_500 });
  if (browserName === "webkit") {
    await expectCapturedStyleMotion(page, "tooltip");
  } else {
    await expectMotionDuration(firstTooltip, 240);
  }
  await expect(page.locator("html")).toHaveAttribute("data-tooltip-open-delay", /.+/);
  const firstOpenDelay = Number(await page.locator("html").getAttribute("data-tooltip-open-delay"));
  expect(firstOpenDelay).toBeGreaterThanOrEqual(300);
  expect(firstOpenDelay).toBeLessThan(1_200);

  await adviceTrigger.hover();
  const instantTooltip = page.locator('[data-slot="tooltip-content"][data-instant][data-open]');
  await expect(instantTooltip).toBeVisible({ timeout: 200 });
  expect(await instantTooltip.evaluate((node) => node.getAnimations().every((animation) => (
    Number(animation.effect?.getTiming().duration ?? 0) === 0
  )))).toBe(true);
});

test("Full E2 stays in place and completes generation, shifts, MAA export, and feedback", async ({ page }) => {
  await mockApis(page);
  await seedPreferences(page);
  await page.goto("/");
  await expect(page.getByRole("button", { name: "全角色导入" })).toBeVisible();

  const fullE2 = page.getByRole("button", { name: "全角色导入" });
  await expect(fullE2).toBeVisible();
  await fullE2.click();
  await expect(page.getByText("先导入干员数据")).toHaveCount(0);
  await expect(page.getByRole("tab", { name: "列表式布局" })).toBeVisible();
  await expect(page.locator("[data-plan-board]")).not.toHaveAttribute("data-plan-revision", /.+/);
  await page.getByRole("button", { name: "生成排班" }).click();
  await expect(page.getByText("排班已生成")).toBeVisible();
  await page.getByRole("tab", { name: "列表式布局" }).click();

  const secondShift = page.getByRole("tab", { name: /第 2 班 · 6h/ });
  await secondShift.click();
  await expect(secondShift).toHaveAttribute("aria-selected", "true");

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出到 MAA" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("arknights-infra-schedule-maa.json");
  const downloadStream = await download.createReadStream();
  const downloadChunks: Buffer[] = [];
  for await (const chunk of downloadStream) downloadChunks.push(Buffer.from(chunk));
  const downloadedMaa = JSON.parse(Buffer.concat(downloadChunks).toString("utf8")) as {
    plans?: Array<{ rooms?: Record<string, unknown> }>;
  };
  expect(downloadedMaa.plans?.every((plan) => !("training" in (plan.rooms ?? {})))).toBe(true);

  await page.getByRole("button", { name: "加工站 反馈排班问题" }).click();
  const feedbackDialog = page.getByRole("dialog");
  await expectUnifiedDialogTypography(feedbackDialog);
  const feedbackFooter = feedbackDialog.locator('[data-slot="dialog-footer"]');
  await expect(feedbackFooter).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await expect(feedbackFooter).toHaveCSS("border-top-width", "0px");
  await expect(feedbackFooter).toHaveCSS("box-shadow", "none");
  await expectUnifiedDialogAction(feedbackDialog.getByRole("button", { name: "取消" }), { height: "46px" });
  await expectUnifiedDialogAction(feedbackDialog.getByRole("button", { name: "提交反馈" }), { width: "196px", height: "46px" });
  await page.getByPlaceholder(/这组应该换成/).fill("加工站排班与预期不一致");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "提交反馈" }).click();
  await expect(page.getByText("反馈已提交，编号：feedback-001")).toBeVisible();
});

test("plan timing stays passive and performance feedback waits for result details to close", async ({ page }) => {
  await mockApis(page);
  const feedbackPayloads: Record<string, unknown>[] = [];
  await page.unroute("**/api/feedback");
  await page.route("**/api/feedback", async (route) => {
    feedbackPayloads.push(route.request().postDataJSON() as Record<string, unknown>);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        data: { feedbackId: "feedback-performance", savedAt: "2026-08-20T00:00:00.000Z" },
        requestId,
      }),
    });
  });
  await seedV4Session(page, { ...planData, durationMs: 2764 });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");

  const resultSummary = page.locator("[data-plan-primary-details-trigger]");
  await expect(resultSummary).toContainText("用时 2.8 秒 · 点击查看详情");
  await expect(page.getByText(/本次求解耗时/)).toHaveCount(0);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(feedbackPayloads).toHaveLength(0);

  for (const viewport of [{ width: 390, height: 844 }, { width: 768, height: 900 }, { width: 1440, height: 900 }]) {
    await page.setViewportSize(viewport);
    await resultSummary.click();
    const detailsDrawer = page.getByRole("dialog", { name: "排班结果详情" });
    const performanceAction = detailsDrawer.getByRole("button", { name: "反馈本次求解速度" });
    await expect(performanceAction).toBeVisible();
    const horizontalFit = await detailsDrawer.evaluate((element) => {
      const action = element.querySelector<HTMLElement>("[data-plan-performance-feedback]");
      if (!action) throw new Error("Missing performance feedback action");
      const drawerBox = element.getBoundingClientRect();
      const actionBox = action.getBoundingClientRect();
      return {
        left: actionBox.left >= drawerBox.left,
        right: actionBox.right <= drawerBox.right + 1,
      };
    });
    expect(horizontalFit).toEqual({ left: true, right: true });
    await page.keyboard.press("Escape");
    await expect(page.locator('[data-slot="drawer-root"]')).toHaveCount(0);
    await expect(resultSummary).toBeFocused();
  }

  await page.emulateMedia({ reducedMotion: "reduce" });
  await resultSummary.press("Enter");
  const detailsDrawer = page.getByRole("dialog", { name: "排班结果详情" });
  const performanceAction = detailsDrawer.getByRole("button", { name: "反馈本次求解速度" });
  await performanceAction.focus();
  await page.keyboard.press("Enter");
  const feedbackDialog = page.getByRole("dialog", { name: "提交性能反馈" });
  await expect(feedbackDialog).toBeVisible();
  await expect(detailsDrawer).toHaveCount(0);
  await expect(page.getByRole("dialog")).toHaveCount(1);
  expect(feedbackPayloads).toHaveLength(0);
  await expect(feedbackDialog.getByText(/不会附带任意房间或完整干员数据/)).toBeVisible();
  await feedbackDialog.getByRole("textbox").fill("同一份 Box 之前通常可以更快完成。");
  await feedbackDialog.getByRole("checkbox").check();
  await feedbackDialog.getByRole("button", { name: "提交反馈" }).click();

  await expect.poll(() => feedbackPayloads).toHaveLength(1);
  const feedbackPayload = feedbackPayloads[0];
  expect(feedbackPayload).toMatchObject({
    kind: "performance_issue",
    diagnosticId,
    consent: true,
  });
  expect(feedbackPayload).not.toHaveProperty("room");
  expect(feedbackPayload?.note).toContain("求解耗时：2764 ms");
  await expect(page.getByText("反馈已提交，编号：feedback-performance")).toBeVisible();
  await expect(resultSummary).toBeFocused();
});

test("scheduled product changes require destructive confirmation and rerun with the updated layout", async ({ page }) => {
  test.setTimeout(60_000);
  await mockApis(page);
  let planRequests = 0;
  let rerunPayload: Record<string, unknown> | null = null;
  let releaseRerun: (() => void) | undefined;
  const rerunGate = new Promise<void>((resolve) => {
    releaseRerun = resolve;
  });
  await page.route("**/api/plan", async (route) => {
    planRequests += 1;
    if (planRequests === 2) {
      rerunPayload = route.request().postDataJSON() as Record<string, unknown>;
      await rerunGate;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, data: productChangePlanData, requestId }),
    });
  });
  await seedPreferences(page);
  await page.setViewportSize({ width: 1088, height: 900 });
  await page.goto("/");

  await page.getByRole("button", { name: "全角色导入" }).click();
  await page.getByRole("button", { name: "生成排班" }).click();
  await expect(page.getByText("排班已生成")).toBeVisible();
  await expect.poll(() => planRequests).toBe(1);
  await page.getByRole("tab", { name: "列表式布局" }).click();

  const factoryControls = page.getByRole("group", { name: "制造站 1 配方" });
  await factoryControls.getByRole("button", { name: "作战记录" }).click();
  const confirmation = page.getByRole("alertdialog");
  await expect(confirmation).toBeVisible();
  await expectUnifiedDialogTypography(confirmation);
  await expect(confirmation.getByRole("heading", { name: "更改配置并重新排班？" })).toBeVisible();
  await expect(confirmation).toContainText("制造站 1 的制造配方将切换为「作战记录」");
  const confirmationFooter = confirmation.locator('[data-slot="dialog-footer"]');
  await expect(confirmationFooter).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await expect(confirmationFooter).toHaveCSS("border-top-width", "0px");
  await expect(confirmationFooter).toHaveCSS("box-shadow", "none");
  await expectUnifiedDialogAction(confirmation.getByRole("button", { name: "取消" }), { height: "46px" });
  await expectUnifiedDialogAction(confirmation.getByRole("button", { name: "确认并重新排班" }), { width: "196px", height: "46px" });
  await expect(confirmation.getByRole("button", { name: "确认并重新排班" })).toHaveClass(/text-destructive/);
  await confirmation.getByRole("button", { name: "取消" }).click();
  await expect(confirmation).toBeHidden();
  expect(planRequests).toBe(1);
  await expect(factoryControls.getByRole("button", { name: "贵金属" })).toHaveAttribute("aria-pressed", "true");

  const tradeControls = page.getByRole("group", { name: "贸易站 1 订单" });
  await tradeControls.getByRole("button", { name: "开采协力" }).click();
  await expect(confirmation).toContainText("贸易站 1 的贸易策略将切换为「开采协力」");
  await confirmation.getByRole("button", { name: "确认并重新排班" }).click();
  await expect.poll(() => planRequests).toBe(2);
  await expect(confirmation).toHaveAttribute("aria-busy", "true");
  await expect(confirmation.getByRole("button", { name: "重新排班中" })).toBeDisabled();

  const rerunLayout = (rerunPayload as Record<string, unknown> | null)?.layout as { rooms?: Array<{ id?: string; product?: { trade?: { order?: string } } }> } | undefined;
  expect(rerunLayout?.rooms?.find((room) => room.id === "trade_1")?.product?.trade?.order).toBe("originium");
  releaseRerun?.();
  await expect(confirmation).toBeHidden();
  await expect(page.getByText("排班已生成")).toBeVisible();
  await page.getByRole("tab", { name: "列表式布局" }).click();
  const updatedTradeControls = page.getByRole("group", { name: "贸易站 1 订单" });
  await expect(updatedTradeControls.getByRole("button", { name: "开采协力" })).toHaveAttribute("aria-pressed", "true");
});

test("responsive navigation and the two locked areas keep their current behavior", async ({ page }) => {
  test.setTimeout(60_000);
  await page.addInitScript(() => {
    const history: string[] = [];
    Object.defineProperty(window, "__scheduleViewHistory", { value: history, configurable: true });
    const capture = () => {
      const mode = document.querySelector<HTMLElement>("[data-schedule-view]")?.dataset.scheduleView;
      if (mode && history.at(-1) !== mode) history.push(mode);
    };
    const observer = new MutationObserver(capture);
    observer.observe(document, { attributes: true, childList: true, subtree: true });
  });
  await mockApis(page);
  await seedV4Session(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  const listViewTab = page.getByRole("tab", { name: "列表式布局" });
  const compactViewTab = page.getByRole("tab", { name: "一图流布局" });
  await expect(compactViewTab).toHaveCount(0);
  await expect(listViewTab).toHaveCount(0);
  await expect(page.locator('[data-schedule-view="list"]')).toBeVisible();
  await expect(page.locator('[data-schedule-view="compact"]')).toHaveCount(0);
  await expect(page.locator("[data-compact-schedule-loading]")).toHaveCount(0);
  const mobileViewHistory = await page.evaluate(() => (
    (window as Window & { __scheduleViewHistory?: string[] }).__scheduleViewHistory ?? []
  ));
  expect(mobileViewHistory).toEqual(["list"]);
  await expect(page.getByText("加工站")).toBeVisible();

  await page.getByRole("button", { name: /功能设施/ }).click();
  const keepHiddenButton = page.getByRole("button", { name: "暂不显示" });
  await expect(keepHiddenButton).toBeVisible();
  await keepHiddenButton.click();
  await expect(page.getByRole("button", { name: /恢复已隐藏.*1/ })).toBeVisible();

  await page.setViewportSize({ width: 768, height: 900 });
  await page.reload();
  await expect(page.locator("[data-plan-board]")).toHaveAttribute("data-plan-revision", diagnosticId);
  await expect(page.locator('[data-slot="live-activity"]')).toHaveCount(0);
  await expect(page.getByRole("button", { name: "全角色导入" })).toBeVisible();
  await expect(compactViewTab).toHaveCount(0);
  await expect(listViewTab).toHaveCount(0);
  await expect(page.locator('[data-schedule-view="list"]')).toBeVisible();

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.reload();
  await expect(compactViewTab).toBeEnabled();
  await expect(compactViewTab).toHaveAttribute("aria-selected", "true");
  await listViewTab.click();
  await expect(listViewTab).toHaveAttribute("aria-selected", "true");
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(compactViewTab).toHaveCount(0);
  await expect(page.locator('[data-schedule-view="list"]')).toBeVisible();
  await page.setViewportSize({ width: 768, height: 900 });
  await expect(listViewTab).toHaveCount(0);
  await expect(compactViewTab).toHaveCount(0);
  await expect(page.locator('[data-schedule-view="list"]')).toBeVisible();
  await page.reload();
  await expect(listViewTab).toHaveCount(0);
  await expect(compactViewTab).toHaveCount(0);
  await expect(page.locator('[data-schedule-view="list"]')).toBeVisible();

  await expect(page.getByRole("button", { name: "基建计算器" })).toBeVisible();
  await expect(page.getByRole("button", { name: "练卡建议" })).toBeVisible();
  await expect(page.getByRole("button", { name: "森空岛状态中心", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "账号管理", exact: true })).toBeVisible();
});

test("the compact mobile navigation stays pinned while the account control belongs to the calculator", async ({ page }) => {
  test.setTimeout(60_000);
  await mockApis(page, {
    sklandConfigured: true,
    sklandSnapshot: authenticatedSklandSnapshot,
    sklandSessionDelayMs: 4_000,
  });
  await seedV4Session(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  const topbar = page.locator("[data-app-topbar]");
  await expect(topbar).toBeVisible({ timeout: 15_000 });
  const topbarStyle = await topbar.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      backgroundColor: style.backgroundColor,
      borderBottomWidth: style.borderBottomWidth,
      boxShadow: style.boxShadow,
    };
  });
  expect(topbarStyle.backgroundColor).not.toBe("rgba(0, 0, 0, 0)");
  expect(topbarStyle.borderBottomWidth).toBe("1px");
  expect(topbarStyle.boxShadow).toBe("none");
  await expect(topbar.locator("[data-skland-account-control]")).toHaveCount(0);
  await expect(page.locator("[data-skland-account-control]")).toHaveAttribute(
    "aria-label",
    "测试博士，进入森空岛状态中心",
    { timeout: 2_000 },
  );
  await expect(page.locator("[data-skland-account-loading]")).toHaveCount(0);
  await expect(page.locator("[data-skland-sidebar-account]")).toHaveCount(0);

  const mobileBar = topbar.locator(".app-content-track");
  await expect(mobileBar).toHaveCSS("height", "56px");

  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await expect.poll(async () => (await topbar.boundingBox())?.y ?? -1).toBeCloseTo(0, 0);

  for (const destination of ["练卡建议", "森空岛状态中心", "账号管理"]) {
    await topbar.getByRole("button", { name: "Toggle Sidebar" }).click();
    await page.getByRole("button", { name: destination, exact: true }).click();
    await expect(page.locator("[data-skland-account-control]")).toHaveCount(0);
  }
  await topbar.getByRole("button", { name: "Toggle Sidebar" }).click();
  await page.getByRole("button", { name: "基建计算器", exact: true }).click();
  await expect(page.locator("[data-skland-account-control]")).toBeVisible();

  await page.setViewportSize({ width: 768, height: 900 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(topbar).toBeHidden();
  await expect.poll(async () => (await page.locator("[data-app-content]").boundingBox())?.y ?? -1).toBeCloseTo(0, 0);
});

test("the initial onboarding is full-screen while other primary pages keep one content offset", async ({ page }) => {
  test.setTimeout(60_000);
  await mockApis(page, { sklandConfigured: true, sklandSnapshot: authenticatedSklandSnapshot });

  for (const viewport of [
    { width: 390, height: 844 },
    { width: 768, height: 900 },
    { width: 1440, height: 900 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto("/");
    await expect(page.locator('[data-workbench-hydrated="true"]')).toBeVisible();
    await expect(page.locator('[data-navigation-pending]')).toHaveCount(0);
    const calculatorTop = (await page.locator('[data-primary-page="calculator"]').boundingBox())?.y ?? -1;
    const regularPageTops: number[] = [];

    for (const destination of [
      { name: "练卡建议", pageKey: "training", root: "[data-training-page]" },
      { name: "技能查询", pageKey: "skill-query", root: "[data-skill-query-page]" },
      { name: "森空岛状态中心", pageKey: "skland", root: "[data-skland-page]" },
      { name: "账号管理", pageKey: "account", root: "[data-account-management]" },
    ]) {
      const href = destination.pageKey === "skill-query" ? "/skills" : `/${destination.pageKey}`;
      await navigateToPrimaryPage(page, {
        name: destination.name,
        href,
        root: destination.root,
      }, viewport.width < 768);
      await page.evaluate(() => window.scrollTo(0, 0));
      await waitForOwnAnimations(page.locator(`[data-primary-page="${destination.pageKey}"]`));
      const pageTop = (await page.locator(`[data-primary-page="${destination.pageKey}"]`).boundingBox())?.y ?? -1;
      regularPageTops.push(pageTop);
    }

    for (const [index, pageTop] of regularPageTops.entries()) {
      expect(pageTop, `${viewport.width}px regular page ${index + 1}`).toBeCloseTo(regularPageTops[0], 0);
    }
    expect(regularPageTops[0] - calculatorTop, `${viewport.width}px full-screen inset`).toBeCloseTo(16, 0);
  }
});

test("Skland and account centers share header geometry and account actions use technical cards", async ({ page }) => {
  await mockApis(page, { sklandConfigured: true, sklandSnapshot: authenticatedSklandSnapshot });
  await seedPreferences(page);

  for (const viewport of [
    { width: 390, height: 844 },
    { width: 768, height: 900 },
    { width: 1440, height: 900 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto("/");
    await expect(page.locator('[data-workbench-hydrated="true"]')).toBeVisible();
    await expect(page.locator('[data-navigation-pending]')).toHaveCount(0);

    await navigateToPrimaryPage(page, {
      name: "森空岛状态中心",
      href: "/skland",
      root: "[data-skland-page]",
    }, viewport.width < 768);
    const sklandRoot = page.locator("[data-skland-page]");
    await waitForOwnAnimations(page.locator('[data-primary-page="skland"]'));
    const sklandHeader = sklandRoot.locator(":scope > header");
    const sklandLogout = sklandRoot.locator("[data-skland-logout]");
    await expect(sklandLogout).toBeVisible();
    const dialogButtonHeight = viewport.width < 640 ? "44px" : "46px";
    for (const label of ["前往生成排班", "继续配置布局"]) {
      await expect(sklandRoot.getByRole("button", { name: label })).toHaveCSS("height", dialogButtonHeight);
      await expect(sklandRoot.getByRole("button", { name: label })).toHaveCSS("border-radius", "22px");
    }
    const sklandGeometry = await Promise.all([
      sklandHeader.boundingBox(),
      sklandLogout.boundingBox(),
    ]);

    await navigateToPrimaryPage(page, {
      name: "账号管理",
      href: "/account",
      root: "[data-account-management]",
    }, viewport.width < 768);
    const accountRoot = page.locator("[data-account-management]");
    await waitForOwnAnimations(page.locator('[data-primary-page="account"]'));
    const accountHeader = accountRoot.locator("header").first();
    const accountLogout = accountRoot.locator("[data-account-logout]");
    await expect(accountLogout).toBeVisible();
    const accountGeometry = await Promise.all([
      accountHeader.boundingBox(),
      accountLogout.boundingBox(),
    ]);

    expect(accountGeometry[0]?.y).toBeCloseTo(sklandGeometry[0]?.y ?? 0, 0);
    expect(accountGeometry[0]?.height).toBeCloseTo(sklandGeometry[0]?.height ?? 0, 0);
    expect(accountGeometry[1]?.y).toBeCloseTo(sklandGeometry[1]?.y ?? 0, 0);
    expect(accountGeometry[1]?.height).toBeCloseTo(sklandGeometry[1]?.height ?? 0, 0);
    expect((accountGeometry[1]?.x ?? 0) + (accountGeometry[1]?.width ?? 0))
      .toBeCloseTo((sklandGeometry[1]?.x ?? 0) + (sklandGeometry[1]?.width ?? 0), 0);

    const actionCards = accountRoot.locator("[data-account-action-cards] [data-infra-technical-card]");
    await expect(actionCards).toHaveCount(2);
    await expect(actionCards.nth(0).getByRole("heading", { name: "登录设备" })).toBeVisible();
    await expect(actionCards.nth(1).getByRole("heading", { name: "永久注销账号" })).toBeVisible();
    for (const label of ["退出全部设备", "永久注销账号"]) {
      await expect(accountRoot.getByRole("button", { name: label })).toHaveCSS("height", dialogButtonHeight);
      await expect(accountRoot.getByRole("button", { name: label })).toHaveCSS("border-radius", "22px");
    }
  }
});

test("mobile interactive targets remain at least 44 CSS pixels", async ({ page }) => {
  await mockApis(page);
  await seedV4Session(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  const undersized = await page.locator('button:not(:disabled), a[href], input:not([type="hidden"]), [role="tab"]:not([aria-disabled="true"])').evaluateAll((elements) => (
    elements.flatMap((element) => {
      if (element.getAttribute("aria-label") === "Open Next.js Dev Tools") return [];
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

test("an empty generated profile explains that no training action is needed", async ({ page }) => {
  await mockApis(page);
  await seedV4Session(page);
  await page.goto("/");
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

test("setup exposes and persists only worker-supported rotation profiles", async ({ page }) => {
  await mockApis(page);
  await seedV4Session(page);
  let planRequests = 0;
  let requestedRotation: unknown;
  await page.route("**/api/plan", async (route) => {
    planRequests += 1;
    requestedRotation = (route.request().postDataJSON() as { rotation?: unknown }).rotation;
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
  await dialog.getByRole("button", { name: "收起", exact: true }).click();
  await dialog.getByRole("button", { name: /第 2 步，共 3 步：布局/ }).click();
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
  await rotationTrigger.fill("一天两换");
  await expect(page.getByRole("option")).toHaveCount(1);
  await rotationTrigger.press("Enter");
  await expect(rotationTrigger).toHaveValue("一天两换 · 12/12/12");
  await rotationTrigger.click();
  await expect(page.locator('[data-slot="combobox-content"]')).toBeVisible();
  await rotationTrigger.fill("不存在的方案");
  await expect(page.getByText("没有匹配的换班方式", { exact: true })).toBeVisible();
  await rotationTrigger.press("Escape");
  await expect(rotationTrigger).toHaveValue("一天两换 · 12/12/12");
  await expect(dialog.getByText("完整循环 24 小时")).toHaveCount(0);
  await expect(dialog.getByText("第 4 班 4h")).toHaveCount(0);
  await dialog.getByRole("button", { name: "继续", exact: true }).click();
  await dialog.getByRole("button", { name: "完成", exact: true }).click();

  await page.getByRole("button", { name: "生成排班" }).click();
  await expect.poll(() => planRequests).toBe(1);
  expect(requestedRotation).toBe("abc_12_12_12");
  const persisted = await page.evaluate(() => JSON.parse(
    window.localStorage.getItem("arknights-infra-calc-session-v5") ?? "{}"
  ));
  expect(persisted.rotationProfile).toBe("abc_12_12_12");
});

test("layout level controls clamp edits and expose the power-safe 342 defaults", async ({ page }) => {
  await mockApis(page);
  await seedV4Session(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");

  await page.getByRole("button", { name: "配置Box与布局" }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: /第 2 步，共 3 步：布局/ }).click();

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
  const activeTradeOrder = dialog.getByRole("group", { name: "trade_1 订单" }).getByRole("button", { name: "龙门商法" });
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
  const fullE2 = page.locator('[data-calculator-export-actions="desktop"] [data-full-e2]');
  await expect(calculatorControls).toBeVisible();
  const exportMaa = page.getByRole("button", { name: "导出到 MAA" });
  const desktopExportHeights = await Promise.all([
    fullE2.evaluate((element) => element.getBoundingClientRect().height),
    exportMaa.evaluate((element) => element.getBoundingClientRect().height),
  ]);
  expect(desktopExportHeights[0]).toBe(desktopExportHeights[1]);
  const controlOrder = await calculatorControls.locator("button").allTextContents();
  expect(controlOrder.at(-1)).toContain("生成排班");
  expect(controlOrder.some((label) => label.includes("全角色导入"))).toBe(false);
  const exportOrder = await page.locator("[data-calculator-export-actions]").locator("button").allTextContents();
  expect(exportOrder[0]).toContain("全角色导入");
  expect(exportOrder[1]).toContain("导出到 MAA");

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
    page.locator('[data-calculator-export-actions="mobile"] [data-full-e2]').evaluate((element) => element.getBoundingClientRect().height),
    page.getByRole("button", { name: "生成排班" }).evaluate((element) => element.getBoundingClientRect().height),
  ]);
  expect(Math.min(...mobileHeights)).toBeGreaterThanOrEqual(44 - 0.01);
});

for (const scenario of [
  { status: "shown", expectedSlot: "training-newbie-list", hasFactory: true },
  { status: "complete", expectedSlot: "training-newbie-complete", hasFactory: false },
  { status: "skipped_by_efficiency", expectedSlot: "training-newbie-skipped", hasFactory: true },
] as const) {
  test(`structured training advice obeys newbie status ${scenario.status}`, async ({ page }) => {
    const structuredAdviceResult = {
      ...planData,
      trainingAdvice: {
        schema_version: 2,
        context: {
          has_originium_shard_factory: scenario.hasFactory,
          engineering_robot_count: 12,
          trade_average_efficiency_percent: 31,
          manufacturing_average_efficiency_percent: 26,
        },
        newbie_section_status: scenario.status,
        incomplete_newbie: [{
          operator: "芬",
          product: "trade",
          action: "train",
          current: { elite: 0, level: 30 },
          target: { kind: "derive_from_skill_binding" },
        }],
        recommendations: [{
          operator: "泡泡",
          action: "acquire",
          target: { kind: "needs_review" },
          priority: "high_efficiency_standalone",
          priority_rank: 100,
          reason: "standalone",
          product: "originium_shards",
          acquisition: { kind: "public_recruitment", detail: "公开招募获取" },
        }],
        combinations: [{
          id: "bubble_group",
          name: "泡泡火神组",
          product: "originium_shards",
          consumer_products: ["gold"],
          tier: "high_efficiency",
          scale: "small",
          facilities: ["manufacturing_station"],
          state: "needs_review",
          completed_slots: 0,
          total_slots: 1,
          completion_percent: 0,
          members: [{
            operator: "泡泡",
            role: "core",
            progress: "needs_review",
            owned: false,
            target_met: false,
            target: { kind: "needs_review" },
            counts_toward_completion: true,
          }],
        }],
      },
    };

    await mockApis(page);
    await seedV4Session(page, structuredAdviceResult);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    await page.getByRole("button", { name: "练卡建议" }).click();
    await expect(page.getByRole("heading", { name: "练卡建议", exact: true })).toBeVisible();
    await expect(page.getByText(`搓玉 ${scenario.hasFactory ? "是" : "否"}`, { exact: true })).toBeVisible();
    await expect(page.getByText(/源石厂 [是否]/)).toHaveCount(0);

    if (scenario.expectedSlot === "training-newbie-list") {
      await expect(page.locator("[data-training-newbie-list]")).toBeVisible();
      await expect(page.locator('[data-slot="training-newbie-complete"]')).toHaveCount(0);
      await expect(page.locator('[data-slot="training-newbie-skipped"]')).toHaveCount(0);
      await expect(page.getByText("按技能解锁要求", { exact: false })).toBeVisible();
    } else {
      await expect(page.locator("[data-training-newbie-list]")).toHaveCount(0);
      await expect(page.locator(`[data-slot="${scenario.expectedSlot}"]`)).toBeVisible();
    }

    await expect(page.getByText("源石碎片", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("目标待核对", { exact: false }).first()).toBeVisible();
    await expect(page.getByText("独立推荐", { exact: true })).toBeVisible();
    await expect(page.getByText("待核对", { exact: true }).first()).toBeVisible();
    await expect(page.getByText(/needs_review|originium_shards|standalone/, { exact: false })).toHaveCount(0);
  });
}

test("schedule visuals use a stable technical canvas and responsive level markers", async ({ page }) => {
  await mockApis(page);
  await seedV4Session(page, scheduleVisualPlanData);
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
  await expect(page.getByText("版本与生效日期：2026-08-27")).toBeVisible();
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
  await expect(page.getByText("版本与生效日期：2026-08-21")).toBeVisible();
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

test("Skland login centers the QR on every viewport and starts after explicit consent", async ({ page }) => {
  await mockApis(page, { sklandConfigured: true });
  let qrStartRequests = 0;
  await page.route("**/api/skland/auth/qr", (route) => {
    qrStartRequests += 1;
    expect(route.request().postDataJSON()).toEqual({
      consent: {
        termsAccepted: true,
        privacyAccepted: true,
        termsVersion: "2026-08-21-cloud-workspace",
        privacyVersion: "2026-08-27-detailed-telemetry",
      },
    });
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        data: {
          scanId: "scan-login-1",
          scanUrl: "hypergryph://scan_login?scanId=scan-login-1&from=web",
          expiresInSeconds: 600,
        },
        requestId,
      }),
    });
  });
  await page.route("**/api/skland/auth/qr/status", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      success: true,
      data: { status: "waiting" },
      requestId,
    }),
  }));
  await seedPreferences(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await expect(page.locator("[data-skland-account-control]")).toHaveCount(0);
  await expect(page.locator("[data-skland-sidebar-account]")).toHaveCount(0);
  await openSklandOverview(page);
  await expect(page.getByRole("heading", { name: "把当前罗德岛带进排班助手" })).toBeVisible();
  await page.setViewportSize({ width: 375, height: 812 });
  await page.reload();

  await expect(page.locator("[data-skland-account-control]")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "把当前罗德岛带进排班助手" })).toBeVisible();
  await expect(page.getByText(/手机号|验证码|密码/)).toHaveCount(0);
  await expect(page.getByText("使用森空岛 App 扫描二维码，同步当前角色的干员与基建数据。")).toBeVisible();
  await expect(page.getByText("登录凭证只保存在当前浏览器，7 天后失效。")).toBeVisible();
  await expect(page.getByText(/本站不会自动签到或读取社区内容/)).toHaveCount(0);
  expect(qrStartRequests).toBe(0);
  const [mobileQrBox, mobileCopyBox] = await Promise.all([
    page.locator("[data-skland-login-qr]").boundingBox(),
    page.locator("[data-skland-login-copy]").boundingBox(),
  ]);
  expect(mobileCopyBox?.y).toBeLessThan(mobileQrBox?.y ?? 0);

  const consentCheckboxes = page.getByRole("checkbox");
  await expect(consentCheckboxes).toHaveCount(2);
  await expect(page.getByRole("button", { name: /生成|打开森空岛/ })).toHaveCount(0);
  await consentCheckboxes.nth(0).check();
  expect(qrStartRequests).toBe(0);
  await consentCheckboxes.nth(1).check();
  await expect(page.getByRole("img", { name: "森空岛登录二维码" })).toBeVisible();
  await expect(page.getByText("请使用森空岛 App 扫描二维码", { exact: true })).toBeVisible();
  await expect(page.locator("[data-skland-login-panel]")).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await expect(page.locator("[data-skland-login-copy]")).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await expect(page.getByRole("link", { name: "本站服务条款" }).first()).toHaveAttribute("href", "/terms");
  await expect(page.getByRole("link", { name: "本站隐私政策" }).first()).toHaveAttribute("href", "/privacy");
  await expect(page.getByText(/skland-kit/i)).toHaveCount(0);

  for (const viewport of [
    { width: 390, height: 844 },
    { width: 768, height: 900 },
    { width: 1440, height: 900 },
  ]) {
    await page.setViewportSize(viewport);
    await expect(page.getByRole("img", { name: "森空岛登录二维码" })).toBeVisible();
    const [sklandPageBox, qrBox] = await Promise.all([
      page.locator("[data-skland-page]").boundingBox(),
      page.locator("[data-skland-qr-visual]").boundingBox(),
    ]);
    expect(sklandPageBox).not.toBeNull();
    expect(qrBox).not.toBeNull();
    const pageCenter = (sklandPageBox?.x ?? 0) + (sklandPageBox?.width ?? 0) / 2;
    const qrCenter = (qrBox?.x ?? 0) + (qrBox?.width ?? 0) / 2;
    expect(qrCenter).toBeCloseTo(pageCenter, 0);
  }
  expect(qrStartRequests).toBe(1);
});

test("Skland login waits for explicit consent and explains slow preparation", async ({ page }) => {
  await mockApis(page, { sklandConfigured: true });
  let qrStartRequests = 0;
  let releaseQr: (() => void) | undefined;
  const qrGate = new Promise<void>((resolve) => {
    releaseQr = resolve;
  });
  await page.route("**/api/skland/auth/qr", async (route) => {
    qrStartRequests += 1;
    await qrGate;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        data: {
          scanId: "scan-login-slow",
          scanUrl: "hypergryph://scan_login?scanId=scan-login-slow",
          expiresInSeconds: 600,
        },
        requestId,
      }),
    });
  });
  await page.route("**/api/skland/auth/qr/status", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      success: true,
      data: { status: "waiting" },
      requestId,
    }),
  }));
  await seedPreferences(page);
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/");

  await page.getByRole("button", { name: "Toggle Sidebar" }).click();
  await openSklandOverview(page);
  expect(qrStartRequests).toBe(0);
  await page.getByRole("checkbox").nth(0).check();
  expect(qrStartRequests).toBe(0);
  await page.getByRole("checkbox").nth(1).check();
  await expect(page.locator("[data-skland-login-qr]").getByRole("status")).toContainText("正在生成二维码…");
  await expect(page.getByText("正在连接登录服务，请稍候…")).toBeVisible({ timeout: 3_000 });
  expect(qrStartRequests).toBe(1);

  releaseQr?.();
  await expect(page.getByRole("img", { name: "森空岛登录二维码" })).toBeVisible();
  expect(qrStartRequests).toBe(1);
});

test("Skland login replaces a scanned QR with progress while authentication finishes", async ({ page }) => {
  await mockApis(page, { sklandConfigured: true });
  await page.route("**/api/skland/auth/qr", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      success: true,
      data: {
        scanId: "scan-login-confirming",
        scanUrl: "hypergryph://scan_login?scanId=scan-login-confirming",
        expiresInSeconds: 600,
      },
      requestId,
    }),
  }));
  await page.route("**/api/skland/auth/qr/status", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      success: true,
      data: { status: "scanned" },
      requestId,
    }),
  }));
  await seedPreferences(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  await page.getByRole("button", { name: "Toggle Sidebar" }).click();
  await openSklandOverview(page);
  await page.getByRole("checkbox").nth(0).check();
  await page.getByRole("checkbox").nth(1).check();
  await expect(page.getByRole("img", { name: "森空岛登录二维码" })).toBeVisible();
  await expect(page.locator("[data-skland-login-progress]")).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole("img", { name: "森空岛登录二维码" })).toHaveCount(0);
  await expect(page.getByRole("status")).toContainText("已扫码，正在等待森空岛 App 确认并完成登录…");
});

test("Skland restore waits for website authentication and then starts summary and full requests once", async ({ page }) => {
  let releaseWebsiteSession!: () => void;
  const websiteSessionGate = new Promise<void>((resolve) => { releaseWebsiteSession = resolve; });
  let fullSessionRequests = 0;
  let summarySessionRequests = 0;
  await page.unroute("**/api/auth/get-session");
  await page.route("**/api/auth/get-session", async (route) => {
    await websiteSessionGate;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        session: {
          id: "test-session",
          token: "test-token",
          userId: "test-user",
          expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        user: {
          id: "test-user",
          name: "测试用户",
          email: "test@example.com",
          emailVerified: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      }),
    });
  });
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.pathname === "/api/skland/accounts" && !url.searchParams.has("mode") && request.method() === "GET") {
      fullSessionRequests += 1;
    }
    if (url.pathname === "/api/skland/accounts" && url.searchParams.get("mode") === "summary" && request.method() === "GET") {
      summarySessionRequests += 1;
    }
  });
  await mockApis(page, { sklandConfigured: true, sklandSnapshot: authenticatedSklandSnapshot });
  await seedPreferences(page);
  const navigation = page.goto("/");

  await page.waitForTimeout(100);
  expect(fullSessionRequests).toBe(0);
  expect(summarySessionRequests).toBe(0);
  releaseWebsiteSession();
  await navigation;
  await expect.poll(() => fullSessionRequests).toBe(1);
  await expect.poll(() => summarySessionRequests).toBe(1);
});

test("Skland login loads full status by default and deletion preserves non-Skland data", async ({ page }) => {
  const statusMethods: string[] = [];
  let releaseAvatar!: () => void;
  const avatarGate = new Promise<void>((resolve) => { releaseAvatar = resolve; });
  const snapshotWithAvatar = {
    ...authenticatedSklandSnapshot,
    player: {
      ...authenticatedSklandSnapshot.player,
      avatarUrl: "https://example.com/skland-avatar.png",
    },
  };
  await page.route(snapshotWithAvatar.player.avatarUrl, async (route) => {
    await avatarGate;
    await route.fulfill({
      status: 200,
      contentType: "image/png",
      body: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64"),
    });
  });
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === "/api/skland/status/refresh") statusMethods.push(request.method());
  });
  await mockApis(page, {
    sklandConfigured: true,
    sklandSnapshot: snapshotWithAvatar,
  });
  await seedV4Session(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.locator("[data-skland-account-avatar] img")).toHaveAttribute(
    "src",
    snapshotWithAvatar.player.avatarUrl
  );
  const calculatorAccount = page.locator("[data-skland-account-control]:visible");
  await expect(calculatorAccount.locator('[data-remote-avatar-state="loading"]')).toBeVisible();
  await expect(calculatorAccount.locator('[data-slot="skeleton"]')).toBeVisible();
  const compactAvatarBox = await calculatorAccount.locator("[data-remote-avatar-state]").boundingBox();
  expect(compactAvatarBox?.width).toBeCloseTo(42, 0);
  await page.getByRole("button", { name: "Toggle Sidebar" }).click();
  await openSklandOverview(page);

  const statusAvatar = page.locator('[data-skland-page] [data-remote-avatar-state="loading"]');
  await expect(statusAvatar).toBeVisible();
  const statusAvatarBox = await statusAvatar.boundingBox();
  expect(statusAvatarBox?.width).toBeCloseTo(56, 0);
  expect(statusAvatarBox?.height).toBeCloseTo(56, 0);
  releaseAvatar();
  await expect(page.locator('[data-skland-page] [data-remote-avatar-state="loaded"]')).toBeVisible();
  await expect(page.locator('[data-skland-page] [data-remote-avatar-state="loaded"] img')).toBeVisible();

  await expect(page.getByText("UID 123••••789")).toBeVisible();
  await expect(page.getByRole("button", { name: "启用状态中心" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "撤回状态中心授权" })).toHaveCount(0);
  await expect.poll(() => statusMethods).toEqual([]);
  const [postStatus, deleteStatus] = await Promise.all([
    page.request.post("/api/skland/status"),
    page.request.delete("/api/skland/status"),
  ]);
  expect(postStatus.status()).toBe(405);
  expect(deleteStatus.status()).toBe(405);
  const dataControls = page.locator("[data-skland-data-controls]");
  await expect(dataControls).toContainText("MAA 导入与手动布局会保留");
  expect(await dataControls.evaluate((element) => element.parentElement?.lastElementChild === element)).toBe(true);
  const deleteAll = page.getByRole("button", { name: "按住删除全部森空岛数据" });
  await deleteAll.click();
  await expect(page.getByRole("heading", { name: "把当前罗德岛带进排班助手" })).toHaveCount(0);
  const deleteBox = await deleteAll.boundingBox();
  expect(deleteBox).not.toBeNull();
  await page.mouse.move(deleteBox!.x + deleteBox!.width / 2, deleteBox!.y + deleteBox!.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(1900);
  await page.mouse.up();
  await expect(page.getByRole("heading", { name: "把当前罗德岛带进排班助手" })).toBeVisible();

  await page.getByRole("button", { name: "Toggle Sidebar" }).click();
  await page.getByRole("button", { name: "基建计算器", exact: true }).click();
  await expect(page.locator("[data-plan-board]")).toHaveAttribute("data-plan-revision", diagnosticId);
});

test("Skland status center keeps profile and recruitment in overview and supports role switching", async ({ page }) => {
  test.setTimeout(90_000);
  const switchedSnapshot = {
    ...authenticatedSklandSnapshot,
    player: {
      ...authenticatedSklandSnapshot.player,
      uid: "987654321",
      nickname: "测试博士二号",
    },
    infrastructure: {
      ...authenticatedSklandSnapshot.infrastructure,
      training: null,
    },
    sourceName: "森空岛同步",
  };
  let attendanceRequests = 0;
  let statusRequests = 0;
  let currentStatusSnapshot: typeof authenticatedSklandSnapshot | typeof switchedSnapshot = authenticatedSklandSnapshot;
  page.on("request", (request) => {
    if (/attendance|sign/i.test(request.url())) attendanceRequests += 1;
    if (new URL(request.url()).pathname === "/api/skland/status/refresh") statusRequests += 1;
  });
  await mockApis(page, {
    sklandConfigured: true,
    sklandSnapshot: authenticatedSklandSnapshot,
  });
  await page.route("**/api/skland/role", (route) => {
    currentStatusSnapshot = switchedSnapshot;
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "X-Request-Id": requestId },
      body: JSON.stringify({
        success: true,
        data: {
          authenticated: true,
          configured: true,
          authMethods: { qr: true },
          accounts: [{
            ...primarySklandAccount,
            selectedUid: switchedSnapshot.player.uid,
            roles: switchedSnapshot.roles,
          }],
          activeAccountId: primarySklandAccount.accountId,
          scheduleSnapshot: switchedSnapshot,
          statusSnapshot: switchedSnapshot,
        },
        requestId,
      }),
    });
  });
  await page.route("**/api/skland/status/refresh", (route) => {
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "X-Request-Id": requestId },
      body: JSON.stringify({
        success: true,
        data: {
          accounts: [{
            ...primarySklandAccount,
            selectedUid: currentStatusSnapshot.player.uid,
            roles: currentStatusSnapshot.roles,
          }],
          activeAccountId: primarySklandAccount.accountId,
          snapshot: currentStatusSnapshot,
        },
        requestId,
      }),
    });
  });
  await seedPreferences(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  await expect(page.locator('[data-workbench-hydrated="true"]')).toBeVisible();
  const scheduleViewTab = page.getByRole("tab", { name: "列表式布局" });
  await expect(scheduleViewTab).toBeVisible();
  await openSklandOverview(page);
  await expect(page.locator("[data-calculator-controls]")).toHaveCount(0);

  await expect(page.getByRole("img", { name: "测试博士的森空岛头像" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "测试博士" }).first()).toBeVisible();
  await expect(page.getByText("UID 123••••789")).toBeVisible();
  const accountCombobox = page.getByRole("combobox", { name: "选择账号与角色" });
  await expect(accountCombobox).toHaveValue("测试博士 · 官服");
  await expect(accountCombobox).not.toHaveValue(/123456789/);
  await accountCombobox.click();
  await waitForOwnAnimations(page.locator('[data-slot="combobox-content"]'));
  const [accountFieldBox, accountPopupBox] = await Promise.all([
    accountCombobox.locator("xpath=..").boundingBox(),
    page.locator('[data-slot="combobox-content"]').boundingBox(),
  ]);
  expect(accountPopupBox?.width).toBeCloseTo(accountFieldBox?.width ?? 0, 0);
  await accountCombobox.press("Escape");
  await expect(page.locator('[data-slot="select-trigger"]')).toHaveCount(0);
  await expect(page.getByRole("tab", { name: "概览", exact: true })).toBeVisible();
  await expect(page.getByRole("tab", { name: "基建", exact: true })).toBeVisible();
  await expect(page.getByRole("tab", { name: "进度", exact: true })).toHaveCount(0);
  await expect(page.locator("[data-skland-view-tabs]")).toHaveAttribute("data-variant", "default");
  await expect(page.locator("[data-skland-view-tabs] svg")).toHaveCount(0);
  const layoutSync = page.locator('[data-slot="skland-layout-sync"]');
  await expect(layoutSync).toBeVisible();
  await expect(layoutSync).not.toHaveClass(/infra-room-surface/);
  const [viewTabsBox, layoutSyncBox] = await Promise.all([
    page.locator("[data-skland-view-tabs]").boundingBox(),
    layoutSync.boundingBox(),
  ]);
  expect((layoutSyncBox?.x ?? 0)).toBeGreaterThan(viewTabsBox?.x ?? 0);
  const dataControlsBox = await page.locator("[data-skland-data-controls]").boundingBox();
  expect(dataControlsBox?.y).toBeGreaterThan(viewTabsBox?.y ?? 0);
  const sklandViewTabHeight = await page.getByRole("tab", { name: "概览", exact: true })
    .evaluate((element) => element.getBoundingClientRect().height);
  expect(sklandViewTabHeight).toBeCloseTo(26, 0);
  await expect(page.getByRole("tab", { name: "干员", exact: true })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "实时数据", exact: true })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "基建数据", exact: true })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "当前理智", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "无人机", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "日常与周常", exact: true })).toBeVisible();
  await expect(page.locator("[data-skland-metric]")).toHaveCount(0);
  await expect(page.getByText("4 项状态提醒")).toBeVisible();
  await expect(page.getByText("博士档案", { exact: true })).toBeVisible();
  await expect(page.getByText("收藏概况", { exact: true })).toBeVisible();
  const overviewRecruit = page.locator('section[aria-labelledby="overview-recruit-title"]');
  await expect(overviewRecruit.getByRole("heading", { name: "公开招募", exact: true })).toBeVisible();
  await expect(overviewRecruit.getByText("槽位 1")).toBeVisible();

  await page.getByRole("tab", { name: "基建", exact: true }).click();
  await expect(page.getByRole("region", { name: "基建概览", exact: true })).toBeVisible();
  await expect(page.locator('[data-skland-metric="rest"]')).toHaveAttribute("data-metric-tone", "green");
  await expect(page.locator('[data-skland-metric="trading"]')).toHaveAttribute("data-metric-tone", "blue");
  await expect(page.locator('[data-skland-metric="manufacture"]')).toHaveAttribute("data-metric-tone", "amber");
  await expect(page.locator('[data-skland-metric="clue"]')).toHaveAttribute("data-metric-tone", "orange");
  await expect(page.locator('[data-skland-metric] .infra-room-surface')).toHaveCount(4);
  await expect(page.locator('[data-skland-metric] .infra-room-emblem')).toHaveCount(0);
  await expect(page.locator('[data-slot="skland-training-room"]')).toHaveClass(/infra-room-surface/);
  await expect(page.locator('[data-slot="skland-infra-assets"]')).toHaveClass(/infra-room-surface/);
  await expect(page.locator('[data-slot^="skland-"] .infra-room-emblem')).toHaveCount(0);
  await expect(page.locator('[data-slot="skland-layout-sync"] svg').first()).toBeVisible();
  await expect(page.locator('[data-slot="skland-training-room"] svg').first()).toBeVisible();
  await expect(page.locator('[data-slot="skland-infra-assets"] svg').first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "当前基建", exact: true })).toBeVisible();
  await expect(page.getByText("按计算器布局排列，快速核对进驻、心情与生产状态。", { exact: true })).toHaveCount(0);
  await expect(page.locator("[data-skland-compact-layout]")).toBeVisible();
  await expect(page.locator('[data-skland-compact-layout] article[data-room-group]')).toHaveCount(8);
  const currentTrainingRoom = page.locator('[data-skland-compact-layout] [data-room-group="training"]');
  await expect(currentTrainingRoom).toBeVisible();
  await expect(currentTrainingRoom).toContainText("2/2");
  await expect(currentTrainingRoom.locator('[data-position="训练位"]')).toContainText("凯尔希");
  await expect(currentTrainingRoom.locator('[data-position="协助位"]')).toContainText("阿米娅");
  await expect(currentTrainingRoom.locator('[aria-label^="训练位："]')).toHaveCount(1);
  await expect(currentTrainingRoom.locator('[aria-label^="协助位："]')).toHaveCount(1);
  await expect(currentTrainingRoom.locator('img[title^="职业："]')).toHaveCount(2);
  await expect(page.locator('[data-skland-compact-layout] [data-room-group="processing"]')).toBeVisible();
  await expect(page.getByText(/^线索板：/)).toHaveCount(0);
  const auxiliaryRoomBoxes = await page.locator(".skland-auxiliary-grid article").evaluateAll((rooms) => Object.fromEntries(
    rooms.map((room) => {
      const bounds = room.getBoundingClientRect();
      return [room.dataset.roomGroup, { x: bounds.x, width: bounds.width }];
    }),
  ));
  expect(auxiliaryRoomBoxes.meeting.x).toBeCloseTo(auxiliaryRoomBoxes.training.x, 0);
  expect(auxiliaryRoomBoxes.hire.x).toBeCloseTo(auxiliaryRoomBoxes.processing.x, 0);
  expect(auxiliaryRoomBoxes.meeting.width).toBeGreaterThan(auxiliaryRoomBoxes.hire.width);
  const compactColumns = page.locator("[data-skland-compact-column]");
  await expect(compactColumns).toHaveCount(2);
  const compactColumnBottoms = await compactColumns.evaluateAll((columns) => columns.map((column) => (
    column.getBoundingClientRect().bottom
  )));
  expect(Math.abs(compactColumnBottoms[0] - compactColumnBottoms[1])).toBeLessThanOrEqual(1);
  const compactLastRoomBottoms = await compactColumns.evaluateAll((columns) => columns.map((column) => {
    const rooms = column.querySelectorAll<HTMLElement>("article[data-room-group]");
    return rooms.item(rooms.length - 1).getBoundingClientRect().bottom;
  }));
  expect(Math.abs(compactLastRoomBottoms[0] - compactLastRoomBottoms[1])).toBeLessThanOrEqual(1);
  const compactRoomEmblem = page.locator("[data-skland-compact-layout] .infra-room-emblem").first();
  await expect(compactRoomEmblem).toBeVisible();
  await expect.poll(() => compactRoomEmblem.evaluate((element) => ({
    backgroundSize: getComputedStyle(element).backgroundSize,
    opacity: getComputedStyle(element).opacity,
  }))).toEqual({ backgroundSize: "auto 100%", opacity: "0.16" });
  await expect(page.getByRole("heading", { name: "控制中枢", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "贸易站 1", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "制造站 1", exact: true })).toBeVisible();
  await expect(page.locator(".infra-room-surface").first()).toBeVisible();
  await expect(page.locator('.level-diamonds[data-variant="compact"]').first()).toBeVisible();
  await expect(page.locator(".infra-operator-slot").first()).toBeVisible();
  await expect(page.getByRole("img", { name: "阿米娅" }).first()).toBeVisible();
  await expect(page.getByText("氛围 5000", { exact: true })).toBeVisible();
  await expect(page.getByText("宿舍氛围 5000", { exact: true })).toHaveCount(0);
  await expect(page.getByText("当前进驻", { exact: true })).toHaveCount(0);
  await expect(page.getByText("设施运行正常", { exact: true })).toHaveCount(0);
  await expect(page.locator("[data-infra-complete-time]").first()).toHaveText(/^\d{4}\.\d{1,2}\.\d{1,2} \d{2}:\d{2}$/);
  await expect(page.getByText("已有 4 · 待接收 2 · 已接收 1", { exact: false })).toHaveCount(0);

  await accountCombobox.click();
  await page.getByRole("option", { name: "测试博士二号 · B服" }).click();
  await expect(page.getByRole("heading", { name: "测试博士二号" }).first()).toBeVisible();
  await expect(page.getByRole("img", { name: "测试博士二号的森空岛头像" })).toBeVisible();
  await expect(page.getByRole("button", { name: "刷新" })).toHaveCount(0);
  const trainingRoom = page.locator('[data-slot="skland-training-room"]');
  await expect(trainingRoom.getByText("当前空闲", { exact: true })).toBeVisible();
  await expect(trainingRoom.getByText("暂无训练任务", { exact: true })).toBeVisible();
  await page.getByRole("tab", { name: "概览", exact: true }).click();
  await expect(page.getByText("训练任务已完成", { exact: true })).toHaveCount(0);

  await expect.poll(async () => page.evaluate(() => JSON.stringify(localStorage))).not.toContain("987654321");
  const persisted = await page.evaluate(() => JSON.stringify(localStorage));
  expect(persisted).not.toContain("为了更好的明天");
  expect(persisted).not.toContain('"progress"');

  for (const viewport of [
    { width: 390, height: 844 },
    { width: 768, height: 900 },
    { width: 1440, height: 1000 },
  ]) {
    await page.setViewportSize(viewport);
    const dimensions = await page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }));
    expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
  }

  await page.getByRole("button", { name: "退出" }).click();
  await expect(page.getByRole("heading", { name: "把当前罗德岛带进排班助手" })).toBeVisible();
  expect(attendanceRequests).toBe(0);
  expect(statusRequests).toBe(0);
});

test("Skland layout sync stays beside the tabs and confirms replacement of dirty settings", async ({ page }) => {
  await mockApis(page, {
    sklandConfigured: true,
    sklandSnapshot: authenticatedSklandSnapshot,
  });
  await seedV4Session(page, planData, { layoutDirty: true });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");

  await openSklandOverview(page);
  const layoutSync = page.locator('[data-slot="skland-layout-sync"]');
  await expect(layoutSync).toContainText("森空岛布局 243");
  const applyButton = layoutSync.getByRole("button", { name: "应用布局" });
  await expect(applyButton).toBeEnabled();
  await applyButton.click();

  const dialog = page.getByRole("dialog", { name: "覆盖当前布局设置？" });
  await expect(dialog).toBeVisible();
  await expectUnifiedDialogTypography(dialog);
  await expectUnifiedDialogAction(dialog.getByRole("button", { name: "取消" }), { height: "46px" });
  await expectUnifiedDialogAction(dialog.getByRole("button", { name: "覆盖并应用" }), { width: "196px", height: "46px" });
  await dialog.getByRole("button", { name: "覆盖并应用" }).click();
  await expect(layoutSync.getByRole("button", { name: "已同步" })).toBeDisabled();
});

test("Skland base metrics reuse the existing technical card grid and keyboard tab navigation", async ({ page }) => {
  await mockApis(page, {
    sklandConfigured: true,
    sklandSnapshot: authenticatedSklandSnapshot,
  });
  await seedPreferences(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  await openSklandOverview(page);
  await page.getByRole("tab", { name: "基建", exact: true }).click();

  for (const viewport of [
    { width: 390, height: 844 },
    { width: 768, height: 960 },
    { width: 1440, height: 1000 },
  ]) {
    await page.setViewportSize(viewport);
    const buildingCards = page.locator('[data-skland-metric-section="building"] [data-skland-metric]');
    await expect(buildingCards).toHaveCount(4);
    await expect(page.locator("[data-skland-overview-grid] > *")).toHaveCount(6);
    await expect(page.locator("[data-skland-metric-glyph]")).toHaveCount(0);

    const widthState = await page.evaluate(() => ({
      overflow: document.documentElement.scrollWidth - window.innerWidth,
      viewportWidth: window.innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      offenders: Array.from(document.querySelectorAll<HTMLElement>("body *"))
        .map((element) => {
          const rect = element.getBoundingClientRect();
          return { tag: element.tagName, className: element.className, left: rect.left, right: rect.right, width: rect.width };
        })
        .filter((rect) => rect.right > window.innerWidth + 1 || rect.left < -1)
        .slice(0, 8),
    }));
    expect(widthState.overflow, JSON.stringify(widthState)).toBeLessThanOrEqual(1);
  }

  const overviewTab = page.getByRole("tab", { name: "概览", exact: true });
  const infrastructureTab = page.getByRole("tab", { name: "基建", exact: true });
  await expect(page.locator("[data-skland-view-tabs] [role=tab]")).toHaveText(["概览", "基建"]);
  await expect(page.getByRole("tab", { name: "进度", exact: true })).toHaveCount(0);
  await overviewTab.focus();
  await overviewTab.press("ArrowRight");
  await expect(infrastructureTab).toBeFocused();
  await infrastructureTab.press("ArrowRight");
  await expect(overviewTab).toBeFocused();
});

test("Skland compact layout aligns both column endings when production is taller", async ({ page }) => {
  await mockApis(page, {
    sklandConfigured: true,
    sklandSnapshot: productionHeavySklandSnapshot,
  });
  await seedPreferences(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");

  await openSklandOverview(page);
  await page.getByRole("tab", { name: "基建", exact: true }).click();

  const compactColumns = page.locator("[data-skland-compact-column]");
  await expect(compactColumns).toHaveCount(2);
  await expect.poll(() => compactColumns.nth(1).evaluate((column) => (
    getComputedStyle(column).justifyContent
  ))).toBe("normal");

  const compactLastRoomBottoms = await compactColumns.evaluateAll((columns) => columns.map((column) => {
    const rooms = column.querySelectorAll<HTMLElement>("article[data-room-group]");
    return rooms.item(rooms.length - 1).getBoundingClientRect().bottom;
  }));
  expect(Math.abs(compactLastRoomBottoms[0] - compactLastRoomBottoms[1])).toBeLessThanOrEqual(2);

  const alignedRoomBoxes = await page.locator('[data-skland-compact-layout] article[data-room-group]').evaluateAll((rooms) => {
    const boxes = rooms.map((room) => {
      const bounds = room.getBoundingClientRect();
      return { group: room.dataset.roomGroup, top: bounds.top, bottom: bounds.bottom, height: bounds.height };
    });
    const group = (name: string) => boxes.filter((box) => box.group === name);
    return {
      controlBottom: group("control")[0]?.bottom,
      tradeTop: group("trading")[0]?.top,
      trainingTop: group("training")[0]?.top,
      trainingHeight: group("training")[0]?.height,
      meetingHeight: group("meeting")[0]?.height,
      lastManufactureBottom: group("manufacture").at(-1)?.bottom,
      powerTop: group("power")[0]?.top,
    };
  });
  expect(Math.abs((alignedRoomBoxes.tradeTop ?? 0) - (alignedRoomBoxes.trainingTop ?? 0))).toBeLessThanOrEqual(1);
  expect((alignedRoomBoxes.tradeTop ?? 0) - (alignedRoomBoxes.controlBottom ?? 0)).toBeCloseTo(12, 0);
  expect(alignedRoomBoxes.trainingHeight).toBeLessThan(alignedRoomBoxes.meetingHeight ?? 0);
  expect(alignedRoomBoxes.meetingHeight).toBeLessThanOrEqual(150);
  expect(alignedRoomBoxes.trainingHeight).toBeLessThanOrEqual(112);
  expect((alignedRoomBoxes.powerTop ?? 0) - (alignedRoomBoxes.lastManufactureBottom ?? 0)).toBeCloseTo(12, 0);
  await expect(page.locator('[data-skland-compact-column="auxiliary"] > [data-room-group="dormitory"]').first()).toHaveCSS("flex-grow", "1");
  await expect(page.locator('[data-room-group="power"] [data-skland-power-efficiency]')).toHaveCount(3);
  await expect(page.locator('[data-room-group="power"] [data-skland-power-efficiency]').first()).toHaveText("效率基准 100%");

  for (const viewport of [{ width: 390, height: 844 }, { width: 768, height: 960 }]) {
    await page.setViewportSize(viewport);
    const dimensions = await page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }));
    expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
    await expect(page.locator('[data-skland-compact-layout] [data-skland-power-efficiency]')).toHaveCount(3);
  }
});

test("Skland supports adding, switching, and individually logging out multiple accounts", async ({ page }) => {
  const secondarySnapshot = {
    ...authenticatedSklandSnapshot,
    player: {
      ...authenticatedSklandSnapshot.player,
      uid: "246813579",
      nickname: "第二账号博士",
      channelName: "官服",
    },
    roles: [{
      uid: "246813579",
      nickname: "第二账号博士",
      channelName: "官服",
      isDefault: true,
    }],
  };
  const secondaryAccount = {
    accountId: "account_secondary",
    selectedUid: secondarySnapshot.player.uid,
    roles: secondarySnapshot.roles,
    credentialExpiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
  };
  let currentSnapshot = authenticatedSklandSnapshot;
  let currentAccounts = [primarySklandAccount];
  let currentAccountId: string | null = primarySklandAccount.accountId;

  await mockApis(page, {
    sklandConfigured: true,
    sklandSnapshot: authenticatedSklandSnapshot,
  });
  await page.route(/\/api\/skland\/accounts(?:[/?]|$)/, async (route) => {
    if (route.request().method() === "DELETE") {
      const accountId = decodeURIComponent(new URL(route.request().url()).pathname.split("/").pop() ?? "");
      currentAccounts = currentAccounts.filter((account) => account.accountId !== accountId);
      if (currentAccounts.length) {
        const nextAccount = currentAccounts[0];
        currentAccountId = nextAccount.accountId;
        currentSnapshot = nextAccount.accountId === secondaryAccount.accountId
          ? secondarySnapshot
          : authenticatedSklandSnapshot;
      } else {
        currentAccountId = null;
      }
    }
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "X-Request-Id": requestId },
      body: JSON.stringify({
        success: true,
        data: {
          authenticated: currentAccounts.length > 0,
          configured: true,
          authMethods: { qr: true },
          accounts: currentAccounts,
          activeAccountId: currentAccountId,
          ...(currentAccounts.length ? { scheduleSnapshot: currentSnapshot } : {}),
          ...(currentAccounts.length ? { statusSnapshot: currentSnapshot } : {}),
        },
        requestId,
      }),
    });
  });
  await page.route("**/api/skland/auth/qr", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    headers: { "X-Request-Id": requestId },
    body: JSON.stringify({
      success: true,
      data: {
        scanId: "scan-second-account",
        scanUrl: "hypergryph://scan_login?scanId=scan-second-account",
        expiresInSeconds: 600,
      },
      requestId,
    }),
  }));
  await page.route("**/api/skland/auth/qr/status", (route) => {
    currentAccounts = [primarySklandAccount, secondaryAccount];
    currentAccountId = secondaryAccount.accountId;
    currentSnapshot = secondarySnapshot;
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "X-Request-Id": requestId },
      body: JSON.stringify({
        success: true,
        data: {
          status: "authenticated",
          accounts: currentAccounts,
          activeAccountId: currentAccountId,
          scheduleSnapshot: currentSnapshot,
          statusSnapshot: currentSnapshot,
        },
        requestId,
      }),
    });
  });
  await page.route("**/api/skland/role", async (route) => {
    const body = route.request().postDataJSON() as { accountId: string; uid: string };
    const selectedAccount = currentAccounts.find((account) => account.accountId === body.accountId);
    currentAccountId = body.accountId;
    currentSnapshot = body.accountId === secondaryAccount.accountId
      ? secondarySnapshot
      : {
          ...authenticatedSklandSnapshot,
          player: {
            ...authenticatedSklandSnapshot.player,
            uid: body.uid,
            nickname: selectedAccount?.roles.find((role) => role.uid === body.uid)?.nickname ?? "测试博士",
          },
        };
    currentAccounts = currentAccounts.map((account) => account.accountId === body.accountId
      ? { ...account, selectedUid: body.uid }
      : account);
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "X-Request-Id": requestId },
      body: JSON.stringify({
        success: true,
        data: {
          authenticated: true,
          configured: true,
          accounts: currentAccounts,
          activeAccountId: currentAccountId,
          scheduleSnapshot: currentSnapshot,
          statusSnapshot: currentSnapshot,
        },
        requestId,
      }),
    });
  });
  await page.route("**/api/skland/status/refresh", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    headers: { "X-Request-Id": requestId },
    body: JSON.stringify({
      success: true,
      data: {
        accounts: currentAccounts,
        activeAccountId: currentAccountId,
        snapshot: currentSnapshot,
      },
      requestId,
    }),
  }));

  await seedPreferences(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");

  const calculatorAccount = page.locator("[data-skland-account-control]");
  const calculatorAvatar = page.locator("[data-skland-account-avatar]");
  const accountSelect = page.locator("[data-skland-account-select]");
  const addAccount = page.locator("[data-skland-add-account]");
  const logout = page.locator("[data-skland-logout]");
  await expect(calculatorAccount).toBeVisible();
  await expect(calculatorAvatar).toBeVisible();
  const avatarBox = await calculatorAvatar.boundingBox();
  const calculatorAccountBox = await calculatorAccount.boundingBox();
  const setupBox = await page.getByRole("button", { name: "配置Box与布局" }).boundingBox();
  expect(avatarBox?.width).toBeCloseTo(34, 0);
  expect(calculatorAccountBox?.height).toBeCloseTo(36, 0);
  expect(calculatorAccountBox?.height).toBeCloseTo(setupBox?.height ?? 0, 0);
  await expect.poll(() => calculatorAccount.evaluate((element) => getComputedStyle(element).borderTopLeftRadius)).toBe("0px");
  await openSklandOverview(page);
  await expect(calculatorAccount).toHaveCount(0);
  const controlHeights = await Promise.all([
    accountSelect.evaluate((element) => element.getBoundingClientRect().height),
    addAccount.evaluate((element) => element.getBoundingClientRect().height),
    logout.evaluate((element) => element.getBoundingClientRect().height),
  ]);
  for (const height of controlHeights) {
    expect(height).toBeCloseTo(44, 2);
  }
  await expect(logout).toHaveClass(/text-destructive/);

  await page.setViewportSize({ width: 390, height: 844 });
  const mobileControlHeights = await Promise.all([
    accountSelect.evaluate((element) => element.getBoundingClientRect().height),
    addAccount.evaluate((element) => element.getBoundingClientRect().height),
    logout.evaluate((element) => element.getBoundingClientRect().height),
  ]);
  for (const height of mobileControlHeights) {
    expect(height).toBeCloseTo(44, 2);
  }
  await page.setViewportSize({ width: 1440, height: 1000 });

  await addAccount.click();
  const addAccountDialog = page.getByRole("dialog", { name: "添加森空岛账号" });
  await expect(addAccountDialog).toBeVisible();
  await expectUnifiedDialogTypography(addAccountDialog);
  await expect(addAccountDialog).toHaveCSS("width", "880px");
  await expect(addAccountDialog.locator("[data-skland-login-panel]")).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  const generateLoginQr = addAccountDialog.getByRole("button", { name: "生成登录二维码" });
  await expectUnifiedDialogAction(generateLoginQr, { width: "196px", height: "46px" });
  await addAccountDialog.getByRole("checkbox").nth(0).check();
  await addAccountDialog.getByRole("checkbox").nth(1).check();
  await generateLoginQr.click();
  await expect(page.getByRole("heading", { name: "第二账号博士" }).first()).toBeVisible({ timeout: 12_000 });

  const accountCombobox = page.getByRole("combobox", { name: "选择账号与角色" });
  await accountCombobox.fill("测试博士");
  await expect(page.getByRole("option", { name: "测试博士 · 官服" })).toBeVisible();
  await expect(page.getByRole("option", { name: "第二账号博士 · 官服" })).toHaveCount(0);
  await expect(page.getByText("森空岛账号 1 · 测试博士", { exact: true })).toBeVisible();
  await expect(page.getByText("森空岛账号 2 · 第二账号博士", { exact: true })).toHaveCount(0);
  await page.getByRole("option", { name: "测试博士 · 官服" }).click();
  await expect(accountCombobox).toHaveValue("测试博士 · 官服");
  await expect(page.getByRole("heading", { name: "测试博士" }).first()).toBeVisible();

  await logout.click();
  await expect(page.getByRole("heading", { name: "第二账号博士" }).first()).toBeVisible();
  await logout.click();
  await expect(page.getByRole("heading", { name: "把当前罗德岛带进排班助手" })).toBeVisible();
  await expect(page.locator("[data-skland-account-control]")).toHaveCount(0);
  await page.getByRole("button", { name: "Toggle Sidebar" }).click();
  await page.getByRole("button", { name: "基建计算器", exact: true }).click();
  await expect(page.locator("[data-skland-account-control]")).toHaveCount(0);

  const persisted = await page.evaluate(() => JSON.stringify(localStorage));
  expect(persisted).not.toContain(primarySklandAccount.accountId);
  expect(persisted).not.toContain(secondaryAccount.accountId);
  expect(persisted).not.toContain(secondarySnapshot.player.uid);
});

test("Skland disables adding another account after five accounts", async ({ page }) => {
  const accounts = Array.from({ length: 5 }, (_, index) => ({
    ...primarySklandAccount,
    accountId: `account_limit_${index}`,
  }));
  await mockApis(page, {
    sklandConfigured: true,
    sklandSnapshot: authenticatedSklandSnapshot,
    sklandAccounts: accounts,
    activeAccountId: accounts[0].accountId,
  });
  await seedPreferences(page);
  await page.goto("/");
  await openSklandOverview(page);

  const addAccount = page.locator("[data-skland-add-account]");
  await expect(addAccount).toBeDisabled();
  await expect(addAccount).toHaveAttribute("title", "最多可登录 5 个森空岛账号");
});

test("setup routes Skland account actions to the status center", async ({ page }) => {
  await mockApis(page, {
    sklandConfigured: true,
    sklandSnapshot: authenticatedSklandSnapshot,
  });
  await seedPreferences(page);
  await page.goto("/");

  await expect(page.locator("[data-skland-account-control]")).toBeVisible();
  await page.locator("[data-calculator-controls] [data-calculator-setup-group]")
    .getByRole("button", { name: "配置Box与布局" })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: /第 1 步，共 3 步：干员数据/ }).click();
  const changeSource = dialog.getByRole("button", { name: "更换", exact: true });
  if (await changeSource.isVisible()) await changeSource.click();
  const sklandTab = dialog.getByRole("tab", { name: "森空岛", exact: true });
  if (await sklandTab.isVisible()) await sklandTab.click();
  await expect(dialog.getByText(/测试博士/).first()).toBeVisible();
  await expect(dialog.getByRole("button", { name: "前往森空岛同步" })).toBeVisible();
  await expect(page.getByRole("button", { name: "使用当前干员数据" })).toHaveCount(0);
  await dialog.getByRole("button", { name: "前往森空岛同步" }).click();
  await expect(page.getByRole("heading", { name: "测试博士" }).first()).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("setup can restore cached Skland data after switching to the sample", async ({ page }) => {
  await mockApis(page, {
    sklandConfigured: true,
    sklandSnapshot: authenticatedSklandSnapshot,
  });
  await seedV4Session(page);
  await page.goto("/");

  await page.getByRole("button", { name: "配置Box与布局" }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: /第 1 步，共 3 步：干员数据/ }).click();
  await dialog.getByRole("button", { name: "更换", exact: true }).click();
  await dialog.getByRole("tab", { name: "森空岛", exact: true }).click();

  await expect(dialog.getByRole("button", { name: "使用森空岛数据", exact: true })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "重新同步", exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: "使用森空岛数据", exact: true }).click();

  await expect(dialog.getByRole("button", { name: /第 2 步，共 3 步：布局/ })).toHaveAttribute("aria-current", "step");
  await expect(dialog.getByRole("button", { name: "检查设施", exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: /第 1 步，共 3 步：干员数据/ }).click();
  await expect(dialog.getByText("森空岛同步", { exact: true })).toBeVisible();
  await expect(dialog.getByText("2 名干员 · 2 名可用", { exact: true })).toBeVisible();
});

test("settings clears local product data without logging out of Skland", async ({ page }) => {
  await mockApis(page);
  await seedV4Session(page);
  let logoutRequests = 0;
  page.on("request", (request) => {
    if (request.url().includes("/api/skland/accounts/") && request.method() === "DELETE") {
      logoutRequests += 1;
    }
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect.poll(() => page.evaluate(() => window.localStorage.getItem("arknights-infra-telemetry-session"))).not.toBeNull();
  const telemetrySessionBeforeClear = await page.evaluate(() => window.localStorage.getItem("arknights-infra-telemetry-session"));

  await expect(page.locator("[data-plan-board]")).toHaveAttribute("data-plan-revision", diagnosticId);
  await page.locator("[data-calculator-more-tools]").getByText("更多工具", { exact: true }).click();
  await page.locator("[data-calculator-more-tools]").getByRole("button", { name: "配置Box与布局" }).click();
  await page.getByRole("dialog").getByRole("button", { name: /第 1 步，共 3 步：干员数据/ }).click();
  await page.getByText("数据管理", { exact: true }).click();
  const storageCopy = page.getByText("数据在此浏览器保存 30 天。", { exact: true });
  await storageCopy.scrollIntoViewIfNeeded();
  await expect(storageCopy).toBeVisible();
  await page.getByRole("button", { name: "清除本地数据" }).first().click();
  const clearDialog = page.getByRole("dialog", { name: "清除本地数据？" });
  await expect(clearDialog).toBeVisible();
  await expectUnifiedDialogTypography(clearDialog, "24px");
  await expectUnifiedDialogAction(clearDialog.getByRole("button", { name: "保留数据" }), { height: "44px" });
  await expectUnifiedDialogAction(clearDialog.getByRole("button", { name: "清除本地数据" }), { width: "176px", height: "44px" });
  await page.getByRole("button", { name: "清除本地数据" }).last().click();

  const stored = await page.evaluate(() => ({
    v2: window.localStorage.getItem("arknights-infra-calc-beta-session-v2"),
    v3: window.localStorage.getItem("arknights-infra-calc-beta-session-v3"),
    v4: window.localStorage.getItem("arknights-infra-calc-session-v4"),
    v5: window.localStorage.getItem("arknights-infra-calc-session-v5"),
    telemetry: window.localStorage.getItem("arknights-infra-telemetry-session"),
    onboarding: window.localStorage.getItem("arknights-infra-calc-beta-onboarding-v1"),
  }));
  expect({ ...stored, telemetry: undefined }).toEqual({ v2: null, v3: null, v4: null, v5: null, telemetry: undefined, onboarding: null });
  expect(stored.telemetry).not.toBe(telemetrySessionBeforeClear);
  expect(logoutRequests).toBe(0);
});
