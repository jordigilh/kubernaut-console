import { defineConfig, devices } from "@playwright/test";
import { localAuthStatePath } from "./e2e/live/local-auth.setup";

const baseURL = process.env.LIVE_E2E_CONSOLE_URL ?? "https://kubernaut-console.local:8843";

export default defineConfig({
  testDir: "./e2e/live",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  timeout: 900_000,
  reporter: process.env.CI ? "github" : "html",
  globalSetup: "./e2e/live/local-auth.setup.ts",
  use: {
    baseURL,
    storageState: localAuthStatePath,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    actionTimeout: 30_000,
    ignoreHTTPSErrors: true,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
