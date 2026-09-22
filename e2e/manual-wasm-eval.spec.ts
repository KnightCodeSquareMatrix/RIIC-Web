import { expect, test } from "@playwright/test";
import layout243 from "../src/layouts/243.json" with { type: "json" };
import { mockApis, now } from "./production-readiness.fixture";

const operators = [
  { id: "char_4032_provs", name: "但书", elite: 2, level: 80, own: true, potential: 1, rarity: 5 },
];

test("manual schedule evaluates the current assignment with the lazy WASM engine", async ({ page }) => {
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
      sourceName: "WASM 评估测试样例",
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

  const wasmRequests: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/wasm/")) wasmRequests.push(request.url());
  });
  await page.goto("/manual");
  await expect(page.locator("[data-manual-schedule-page]")).toBeVisible();
  const trade = page.locator('[data-room-title="贸易站 1"]');
  await trade.getByRole("button", { name: "空置" }).first().click();
  const picker = page.getByRole("dialog");
  await picker.getByRole("tablist", { name: "工作房间" }).getByRole("tab", { name: "全部", exact: true }).click();
  await picker.getByRole("button", { name: /但书/ }).click();

  const nativeButton = page.getByRole("button", { name: "根据排班计算", exact: true });
  await expect(nativeButton).toBeEnabled();
  await expect(page.getByRole("button", { name: "根据效率计算", exact: true })).toBeVisible();
  await nativeButton.click();
  await expect(page.locator("[data-room-title=\"贸易站 1\"] [data-room-primary-efficiency]")).not.toHaveText("0%");
  await expect.poll(() => wasmRequests.some((url) => url.endsWith("infra_eval_wasm.js"))).toBe(true);
  await expect.poll(() => wasmRequests.some((url) => url.includes("infra-eval.v3-0c35f30.8c344b61e8e1.wasm"))).toBe(true);
});
