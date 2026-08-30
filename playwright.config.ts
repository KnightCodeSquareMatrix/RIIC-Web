import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:5184";
const webServerPort = new URL(baseURL).port || "80";

export default defineConfig({
  testDir: "./e2e",
  testIgnore: "production-profile.spec.ts",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "webkit",
      use: { ...devices["Desktop Safari"] },
      // WebKit is consistently slower when hydrating the full restored schedule
      // and completing the multi-account flow on Windows CI/dev machines.
      timeout: 90_000,
    },
  ],
  webServer: {
    command: `npx next dev -H 127.0.0.1 -p ${webServerPort}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      ACCOUNT_CLOUD_SYNC_ENABLED: "1",
      BETA_RATE_LIMIT_ENABLED: "0",
      BETA_DEBUG_TOOLS_ENABLED: "0",
    },
  },
});
