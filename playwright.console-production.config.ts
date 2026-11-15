import { defineConfig, devices } from "@playwright/test";

// Production-entrypoint smoke lane: build the workspace library with mock A2A
// enabled before starting the standalone app. The standalone package resolves
// @kubernaut/ui-core from its built dist entrypoint, so the build must be part
// of this lane rather than an unstated precondition.
const port = Number(process.env.CONSOLE_PRODUCTION_PORT || 43873);

export default defineConfig({
  testDir: "./e2e/console-foundation",
  testMatch: "**/chat-memory.production.spec.ts",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: "list",
  use: {
    ...devices["Desktop Chrome"],
    baseURL: `http://127.0.0.1:${port}`,
    trace: "retain-on-failure",
  },
  webServer: {
    command: `VITE_MOCK_A2A=true pnpm --filter @kubernaut/ui-core build && VITE_MOCK_A2A=true pnpm --filter @kubernaut/standalone exec vite --host 127.0.0.1 --port ${port} --strictPort`,
    url: `http://127.0.0.1:${port}/`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
