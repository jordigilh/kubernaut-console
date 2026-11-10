import { defineConfig, devices } from "@playwright/test";
import { localAuthStatePath } from "./e2e/live/local-auth.setup";

const baseURL = process.env.LIVE_E2E_CONSOLE_URL ?? (process.env.CI ? "" : "https://kubernaut-console.local:8843");

if (process.env.CI && !baseURL) {
  throw new Error("CI live E2E requires LIVE_E2E_CONSOLE_URL from the sanitized setup manifest");
}

const jsonReportPath = process.env.LIVE_E2E_JSON_REPORT ?? "test-results/live-e2e-kind.json";
const retainBrowserArtifacts = process.env.LIVE_E2E_RETAIN_BROWSER_ARTIFACTS === "1";

export default defineConfig({
  testDir: "./e2e/live",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  timeout: 900_000,
  reporter: process.env.CI
    ? [["github"], ["json", { outputFile: jsonReportPath }]]
    : "html",
  globalSetup: "./e2e/live/local-auth.setup.ts",
  use: {
    baseURL,
    storageState: localAuthStatePath,
    // Traces and videos can retain request headers/cookies. CI diagnostics are
    // intentionally safe by default; local debugging can opt in explicitly.
    trace: retainBrowserArtifacts || process.env.LIVE_E2E_RETAIN_TRACE === "1" ? "retain-on-failure" : "off",
    screenshot: retainBrowserArtifacts ? "only-on-failure" : "off",
    video: retainBrowserArtifacts || process.env.LIVE_E2E_RETAIN_VIDEO === "1" ? "retain-on-failure" : "off",
    actionTimeout: 30_000,
    ignoreHTTPSErrors: process.env.LIVE_E2E_IGNORE_HTTPS_ERRORS === "true" || !process.env.CI,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
