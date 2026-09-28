import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:5174";
export default defineConfig({
  testDir: "./e2e",
  testMatch: "admin-workspace.spec.ts",
  workers: 1,
  timeout: 120_000,
  expect: { timeout: 20_000 },
  reporter: "list",
  use: { ...devices["Desktop Chrome"], baseURL, trace: "retain-on-failure" },
  webServer: {
    command: `node scripts/start-admin-preview.mjs ${new URL(baseURL).port || "5174"}`,
    url: baseURL + "/admin-preview",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
