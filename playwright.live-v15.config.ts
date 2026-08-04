import { execFileSync } from "node:child_process";
import { defineConfig, devices } from "@playwright/test";

// ADR-009 §14: validates kubernaut-console `main` against a real,
// already-deployed `release/v1.5` stack on a shared OpenShift dev cluster —
// distinct from playwright.live.config.ts's local Kind/fullpipeline/Dex
// suite. There is no local dev server and no local backend here: the
// console, oauth2-proxy, and every kubernaut service are already running on
// the cluster (console overridden to this repo's `main` build via the
// Kubernaut CR's spec.image.overrides.console). Auth is a real Keycloak
// access token, attached to every request (including the initial page
// navigation, which oauth2-proxy itself gates) via extraHTTPHeaders —
// simpler than the local suite's LiveE2EAuthProvider hack, since a real
// oauth2-proxy (--skip-jwt-bearer-tokens=true) is actually deployed here,
// unlike the local Kind cluster which has no oauth2-proxy at all.
//
// Prerequisites (see e2e/live/README.md "release/v1.5 (OpenShift)" section):
//   1. KUBECONFIG pointed at the shared OpenShift dev cluster.
//   2. LIVE_E2E_KEYCLOAK_CLIENT_SECRET / LIVE_E2E_KEYCLOAK_PASSWORD env vars
//      set from the console-e2e-keycloak-creds Secret in kubernaut-system.
//   3. LIVE_E2E_CONSOLE_URL pointed at the deployed console route (defaults
//      to this cluster's known route below).
const token = execFileSync("node", ["e2e/live/scripts/keycloak-token.mjs"], {
  encoding: "utf-8",
}).trim();

// Real, unscripted claude-sonnet-5 investigations (real kubectl/Prometheus
// tool calls, no mock-llm) take noticeably longer than helpers.ts's default
// 90s (tuned for the Kind/fullpipeline mock-llm suite's scripted responses)
// — observed 5+ min during the 2026-08-03 preflight spike. Set before any
// worker process is forked so it propagates via inherited env.
process.env.LIVE_E2E_INVESTIGATION_TIMEOUT_MS ??= "300000";

export default defineConfig({
  testDir: "./e2e/live",
  fullyParallel: false, // shared cluster state (RRs, workflow catalog) — avoid cross-test interference
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  // Real sonnet-5 investigations (real kubectl/Prometheus tool calls, no
  // scripted mock-llm) run noticeably slower than the mocked or Kind/Dex
  // live suites — observed 5+ min for a single investigation against a
  // non-trivial fixture during the 2026-08-03 preflight spike.
  timeout: 420_000,
  reporter: process.env.CI ? "github" : "html",
  use: {
    baseURL:
      process.env.LIVE_E2E_CONSOLE_URL ??
      "https://kubernaut-console-kubernaut-system.apps.dev.redhat-internal.com",
    extraHTTPHeaders: {
      Authorization: `Bearer ${token}`,
    },
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
  // No webServer block: the console under test is already deployed and
  // running on the cluster, not a local dev server this config would start.
});
