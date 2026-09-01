import { expect, test } from "@playwright/test";

test("English mode keeps the calculator and account entry copy in English", async ({ page }) => {
  await page.addInitScript(() => window.localStorage.setItem("infra-demo-locale", "en"));
  await page.goto("/");

  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.getByRole("region", { name: "Schedule setup" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Want to preview scheduling without signing in?" })).toBeVisible();
  await expect(page.getByRole("button", { name: "View sample schedule" })).toBeVisible();
  await expect(page.locator("[data-help-link]").first()).toHaveAccessibleName("Help");

  await page.getByRole("button", { name: "Configure Box and layout" }).click();
  const accountDialog = page.locator("[data-website-account-dialog]");
  await expect(accountDialog).toBeVisible();
  await expect(accountDialog).toHaveAccessibleName("Website account sign-in");
  await expect(accountDialog.getByRole("heading", { name: "Sign in", exact: true })).toBeVisible();
  await expect(accountDialog.getByRole("button", { name: "Show password" })).toBeVisible();
});
