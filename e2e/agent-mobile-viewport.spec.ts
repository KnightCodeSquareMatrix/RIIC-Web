import { expect, test, type Page } from "@playwright/test";
import { mockApis } from "./production-readiness.fixture";

async function prepare(page: Page) {
  await mockApis(page);
  await page.route("**/api/auth/get-session", route => route.fulfill({ json: {
    user: { id: "viewport-user", name: "博士", email: "viewport@example.test" },
    session: { expiresAt: "2099-01-01T00:00:00Z" },
  } }));
  await page.route("**/api/agent/chat", route => route.fulfill({ json: {
    success: true, data: { enabled: true, provider: "deepseek", model: "test" },
  } }));
  // Desktop engines cannot open an OS keyboard. Model its visual viewport events
  // independently of the layout viewport; real-device acceptance remains manual.
  await page.addInitScript(() => {
    const viewport = window.visualViewport!;
    let state = { height: window.innerHeight, offsetTop: 0, scale: 1 };
    for (const key of ["height", "offsetTop", "scale"] as const) {
      Object.defineProperty(viewport, key, { configurable: true, get: () => state[key] });
    }
    Object.assign(window, { setAgentTestViewport: (next: typeof state) => {
      state = next;
      viewport.dispatchEvent(new Event("resize"));
      viewport.dispatchEvent(new Event("scroll"));
    } });
  });
  await page.goto("/agent");
  await expect(page.getByRole("textbox", { name: "发给可露希尔的消息" })).toBeVisible({ timeout: 30_000 });
}

async function viewport(page: Page, height: number, offsetTop = 0, scale = 1) {
  await page.evaluate(state => {
    (window as typeof window & { setAgentTestViewport: (state: { height: number; offsetTop: number; scale: number }) => void }).setAgentTestViewport(state);
  }, { height, offsetTop, scale });
}

async function expectComposerInside(page: Page, height: number, offset = 0) {
  await expect.poll(async () => {
    const box = await page.locator("[data-agent-composer]").boundingBox();
    return box ? box.y + box.height : Infinity;
  }).toBeLessThanOrEqual(height + offset + 1);
  await expect.poll(async () => {
    const box = await page.locator("[data-agent-prompt-bar] textarea").boundingBox();
    return box?.y ?? -1;
  }).toBeGreaterThanOrEqual(offset);
}

test.describe("mobile keyboard layout", () => {
  test.use({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });

  test("composer follows keyboard opening, panning and dismissal without residual space", async ({ page }) => {
    await prepare(page);
    const input = page.getByRole("textbox", { name: "发给可露希尔的消息" });
    await expect(input).toHaveAttribute("placeholder", "聊聊基建、干员…");
    await expect(input).toHaveCSS("white-space", "nowrap");
    await expect(input).toHaveCSS("font-size", "16px");
    await input.fill("第一行\n第二行");
    await expect(input).toHaveCSS("white-space", "pre-wrap");
    for (const offset of [0, 48, 0]) {
      await input.focus();
      await viewport(page, 360, offset);
      await expect(page.locator("html")).toHaveAttribute("data-agent-keyboard", "");
      await expectComposerInside(page, 360, offset);
      // Keyboard can dismiss while the textarea stays focused (Android back key).
      await viewport(page, 812);
      await expect(page.locator("html")).not.toHaveAttribute("data-agent-keyboard");
      await expectComposerInside(page, 812);
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight)).toBeLessThanOrEqual(1);
      await expect(input).toHaveValue("第一行\n第二行");
    }
    await viewport(page, 360, 48);
    await input.blur();
    await viewport(page, 812);
    await expect(page.locator("html")).toHaveCSS("--agent-viewport-top", "0px");
    await expectComposerInside(page, 812);

    // Pinch zoom must not be treated as opening a keyboard.
    await viewport(page, 406, 80, 2);
    await expect(page.locator("html")).toHaveCSS("--agent-viewport-height", "812px");
    await viewport(page, 812);

    await page.setViewportSize({ width: 812, height: 375 });
    await input.focus();
    await viewport(page, 260);
    await expectComposerInside(page, 260);
    await page.setViewportSize({ width: 320, height: 700 });
    await viewport(page, 700);
    await input.clear();
    await expect(input).toHaveAttribute("placeholder", "聊聊基建、干员…");
    expect(await input.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);

    // Client-side navigation must release the scroll lock and viewport styles.
    await page.locator('[data-slot="sidebar-trigger"]').first().click();
    await page.locator('[data-primary-navigation-page="mastery"]:visible').click();
    await expect(page).toHaveURL(/\/mastery$/);
    await expect(page.locator("html")).not.toHaveAttribute("data-agent-viewport");
    await expect(page.locator("html")).toHaveCSS("--agent-viewport-height", "");
  });
});

test("desktop keeps its full placeholder and page scrolling", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await prepare(page);
  await expect(page.locator("html")).not.toHaveAttribute("data-agent-viewport");
  await expect(page.getByRole("textbox", { name: "发给可露希尔的消息" })).toHaveAttribute("placeholder", "聊聊你的基建、干员，或下一步养成计划…");
});
