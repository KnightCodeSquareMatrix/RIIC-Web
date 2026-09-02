import { expect, test } from "@playwright/test";

test("help pages provide an accessible back-to-top control", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/help/owned-operators?issue=unexpected-operators");

  const backToTop = page.locator("[data-help-back-to-top]");
  const helpMenu = page.getByRole("button", { name: "帮助目录", exact: true });

  await expect(backToTop).toHaveAttribute("aria-hidden", "true");
  await expect(backToTop).toHaveAttribute("tabindex", "-1");

  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await expect(backToTop).toHaveAttribute("aria-hidden", "false");
  await expect(backToTop).toBeVisible();
  await expect(backToTop).toHaveAccessibleName("回到顶部");

  const backToTopBox = await backToTop.boundingBox();
  const helpMenuBox = await helpMenu.boundingBox();
  expect(backToTopBox).not.toBeNull();
  expect(helpMenuBox).not.toBeNull();
  expect(backToTopBox!.width).toBeGreaterThanOrEqual(44);
  expect(backToTopBox!.height).toBeGreaterThanOrEqual(44);
  expect(backToTopBox!.y + backToTopBox!.height).toBeLessThanOrEqual(helpMenuBox!.y - 8);

  await backToTop.click();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  await expect(page.locator("#help-content")).toBeFocused();
  await expect(backToTop).toHaveAttribute("aria-hidden", "true");

  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scrollWidth).toBe(dimensions.clientWidth);
});
