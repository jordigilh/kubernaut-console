import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.LIVE_E2E_CONSOLE_URL ?? "http://127.0.0.1:5174";
const consolePort = new URL(baseURL).port;
if (!consolePort) {
  throw new Error("LIVE_E2E_CONSOLE_URL must include an explicit port for the Vite live E2E server");
}
const apiFrontendURL = process.env.LIVE_E2E_API_FRONTEND_URL ?? "https://127.0.0.1:18443";
const dexURL = process.env.LIVE_E2E_DEX_URL ?? "https://127.0.0.1:30556/dex";
const jsonReportPath = process.env.LIVE_E2E_JSON_REPORT ?? "test-results/live-e2e-fullpipeline.json";
const retainBrowserArtifacts = process.env.LIVE_E2E_RETAIN_BROWSER_ARTIFACTS === "1";
const consoleSourceDir = process.env.LIVE_E2E_CONSOLE_SOURCE_DIR ?? ".";

export default defineConfig({
  testDir: "./e2e/live",
  testMatch: "**/native-fullpipeline.spec.ts",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  timeout: 900_000,
  reporter: process.env.CI
    ? [["github"], ["json", { outputFile: jsonReportPath }]]
    : [["list"], ["json", { outputFile: jsonReportPath }]],
  use: {
    baseURL,
    // Traces and videos can retain request headers/cookies. CI diagnostics are
    // safe by default; local debugging can opt in explicitly.
    trace: retainBrowserArtifacts || process.env.LIVE_E2E_RETAIN_TRACE === "1" ? "retain-on-failure" : "off",
    screenshot: retainBrowserArtifacts ? "only-on-failure" : "off",
    video: retainBrowserArtifacts || process.env.LIVE_E2E_RETAIN_VIDEO === "1" ? "retain-on-failure" : "off",
    actionTimeout: 30_000,
    ignoreHTTPSErrors: true,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: `pnpm --filter @kubernaut/standalone exec vite --host 127.0.0.1 --port ${consolePort} --strictPort`,
    cwd: consoleSourceDir,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    env: {
      LIVE_E2E_CONSOLE_PORT: consolePort,
      LIVE_E2E_DEX_URL: dexURL,
      VITE_API_UPSTREAM: apiFrontendURL,
      VITE_API_INSECURE_TLS: "true",
    },
  },
});
