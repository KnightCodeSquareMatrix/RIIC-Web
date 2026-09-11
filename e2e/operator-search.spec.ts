import { expect, test } from "@playwright/test";
import { mockApis } from "./production-readiness.fixture";

test("skill search combines Chinese pinyin and English operator names", async ({ page }) => {
  await mockApis(page);
  await page.goto("/skills");
  const results = page.locator("[data-skill-query-page]");
  const search = results.getByRole("textbox");
  for (const [query, name] of [["nts", "能天使"], ["amiya", "阿米娅"], ["choubai", "仇白"], ["qiubai", "仇白"]]) {
    await search.fill(query);
    await expect(results.locator(`[data-operator-identity="${name}"]`)).toBeVisible();
  }
  await search.fill("Exusiai");
  await expect(results.locator('[data-operator-identity="能天使"]')).toHaveCount(0);
  await page.getByRole("button", { name: "EN", exact: true }).click();
  await expect(results.locator('[data-operator-identity="能天使"]')).toBeVisible();
  await search.fill("nts");
  await expect(results.locator('[data-operator-identity="能天使"]')).toBeVisible();
});
