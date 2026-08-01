import { defineConfig, devices } from "@playwright/test";

// ADR-009: separate project from playwright.config.ts's mocked suite.
// Targets a real, preserved `fullpipeline` Kind cluster (kubernaut's own
// `PRESERVE_E2E_CLUSTER=true make test-e2e-fullpipeline`) instead of a
// mocked A2A backend. Never run as part of the PR-blocking `e2e.yml` gate —
// see .github/workflows/e2e-live.yml (nightly + workflow_dispatch, added
// alongside the CI harness this suite depends on).
//
// Local prerequisites (see e2e/live/README.md):
//   1. A running, preserved fullpipeline cluster (Gateway :30080,
//      DataStorage :30081, AF :30443, Dex :30556).
//   2. KUBECONFIG pointed at it, if any script here needs kubectl.
export default defineConfig({
  testDir: "./e2e/live",
  fullyParallel: false, // shared cluster state (RRs, workflow catalog) — avoid cross-test interference
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  timeout: 180_000, // real LLM tool-call investigation can take minutes, not milliseconds
  reporter: process.env.CI ? "github" : "html",
  use: {
    baseURL: process.env.LIVE_E2E_CONSOLE_URL ?? "http://localhost:5174",
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
  webServer: {
    command: "node e2e/live/scripts/start-console-with-token.mjs",
    url: process.env.LIVE_E2E_CONSOLE_URL ?? "http://localhost:5174",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    env: {
      // Distinct from playwright.config.ts's 5173 so both suites could
      // theoretically run side by side without colliding. Actually applied
      // via an explicit `vite --port` flag in start-console-with-token.mjs
      // (Vite does not read $PORT itself).
      LIVE_E2E_CONSOLE_PORT: "5174",
    },
  },
});
