import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { mockApis, planData, requestId, seedV4Session } from "./production-readiness.fixture";
import type { MaaJson } from "../src/types";

for (const source of ["generated", "restored"] as const) {
  test(`${source} calculator schedules export the dorm autofill shown on screen`, async ({ page }) => {
    const result = {
      ...planData,
      maa: {
        ...planData.maa,
        plans: planData.maa.plans.map((plan) => ({
          ...plan,
          rooms: {
            ...plan.rooms,
            dormitory: [
              { operators: ["杜林"], autofill: false },
              { operators: [] },
              { operators: [], skip: true, autofill: false },
              { operators: ["阿米娅", "杜林", "芬", "克洛丝", "米格鲁"], autofill: false },
            ],
          },
        })),
      },
    };
    await mockApis(page);
    await seedV4Session(page, source === "restored" ? result : null);
    await page.route("**/api/plan", (route) => route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, data: result, requestId }),
    }));
    await page.goto("/");
    if (source === "generated") {
      await page.getByRole("button", { name: "生成排班", exact: true }).click();
    }
    const dorms = page.locator('[data-compact-schedule-view] [data-room-group="dormitory"]');
    await expect(dorms.nth(0).locator('[data-operator-identity="autofill"]')).toHaveCount(4);
    await expect(dorms.nth(1).locator('[data-operator-identity="autofill"]')).toHaveCount(5);
    await expect(dorms.nth(2).locator('[data-operator-identity="autofill"]')).toHaveCount(0);

    const pending = page.waitForEvent("download");
    await page.locator('[data-calculator-export-actions="desktop"]')
      .getByRole("button", { name: "导出到 MAA", exact: true }).click();
    const download = await pending;
    expect(download.suggestedFilename()).toBe("arknights-infra-schedule-maa.json");
    const exported = JSON.parse(await readFile((await download.path())!, "utf8")) as MaaJson;
    expect(exported.plans).toHaveLength(result.maa.plans.length);
    exported.plans.forEach((plan, index) => {
      expect(plan.rooms.dormitory?.map((room) => room.autofill)).toEqual([true, true, false, false]);
      expect(plan.rooms.dormitory?.map((room) => room.operators))
        .toEqual(result.maa.plans[index]!.rooms.dormitory.map((room) => room.operators));
      expect(plan.rooms.dormitory?.[2]?.skip).toBe(true);
    });
  });
}
