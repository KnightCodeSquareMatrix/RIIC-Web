import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { mockApis, seedV4Session } from "./production-readiness.fixture";

test("settings persist and control language, schedule controls and MAA export", async ({ page }) => {
  await mockApis(page);
  await seedV4Session(page);
  await page.goto("/settings");
  await expect(page.locator('[data-workbench-hydrated="true"]')).toBeVisible();
  await page.getByRole("switch", { name: /^加载英文资源/ }).click();
  await expect(page.getByRole("button", { name: "EN（关闭）", exact: true })).toBeDisabled();
  await page.getByRole("switch", { name: /^严格按照顺序入驻/ }).click();
  await page.getByRole("switch", { name: /^加载干员图片/ }).click();
  await page.getByRole("button", { name: "细致调整", exact: true }).click();
  await page.locator("#schedule-view-control-detail").selectOption("select");
  await page.reload();
  await expect(page.getByRole("switch", { name: /^严格按照顺序入驻/ })).not.toBeChecked();
  await expect(page.getByRole("button", { name: "EN（关闭）", exact: true })).toBeDisabled();
  await page.goto("/");
  const shifts = page.getByRole("combobox", { name: "班次", exact: true });
  await expect(shifts).toBeVisible();
  await expect(page.locator("[data-plan-board]")).toHaveAttribute("data-hide-images", "");
  const pending = page.waitForEvent("download");
  await page.locator('[data-calculator-export-actions="desktop"]').getByRole("button", { name: "导出到 MAA", exact: true }).click();
  const download = await pending;
  const exported = JSON.parse(await readFile((await download.path())!, "utf8"));
  expect(exported.plans.flatMap((plan: { rooms: Record<string, Array<{ sort: boolean }>> }) => Object.values(plan.rooms).flat()).every((room: { sort: boolean }) => room.sort === false)).toBe(true);
});

test("one-shift image export preserves the selected shift", async ({ page }) => {
  await mockApis(page);
  await seedV4Session(page);
  await page.addInitScript(() => localStorage.setItem("riic-web-user-settings", JSON.stringify({ scheduleViewControl: "select" })));
  await page.goto("/");
  const shifts = page.getByRole("combobox", { name: "班次", exact: true });
  await shifts.selectOption("1");
  const pending = page.waitForEvent("download");
  await page.locator('[data-calculator-export-actions="desktop"]').getByRole("button", { name: /导出图片/ }).click();
  const download = await pending;
  expect(download.suggestedFilename()).toBe("arknights-infra-schedule-shift-2.png");
  await expect(shifts).toHaveValue("1");
  const bytes = await readFile((await download.path())!);
  expect(bytes.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
});
