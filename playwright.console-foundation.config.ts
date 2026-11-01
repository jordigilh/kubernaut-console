import { defineConfig, devices } from "@playwright/test";

// Isolated source-only fixture: never start or reuse a standalone/live server.
const port = Number(process.env.CONSOLE_FOUNDATION_PORT || 43871);
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;

export default defineConfig({
  testDir: "./e2e/console-foundation",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: "list",
  outputDir: process.env.CONSOLE_FOUNDATION_OUTPUT_DIR || "test-results/console-foundation",
  use: {
    ...devices["Desktop Chrome"],
    baseURL: `http://127.0.0.1:${port}`,
    ...(executablePath ? { launchOptions: { executablePath } } : {}),
    trace: "retain-on-failure",
  },
  webServer: {
    command: `node ./packages/ui-core/node_modules/vite/bin/vite.js --host 127.0.0.1 --port ${port} --strictPort`,
    url: `http://127.0.0.1:${port}/e2e/console-foundation/fixture.html`,
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
