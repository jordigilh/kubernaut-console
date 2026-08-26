import baseConfig from "./playwright.live-v15.config";
import { defineConfig } from "@playwright/test";

// One-off override of playwright.live-v15.config.ts for a deliberate
// concurrent-load run (2026-08-11): the default config sets
// `fullyParallel: false, workers: 1` specifically to avoid cross-test
// interference on shared cluster state. All 12 tests in this suite already
// target fully distinct, dedicated fixture namespaces (verified 2026-08-11 —
// no two tests share a `fixtureNamespace()` target), so there is no
// target-identity collision risk in running them concurrently.
//
// Purpose: upstream is trying to reproduce kubernaut#1995 (AF's pooled MCP
// `CallTool()` invocation to KA staying blocked when a response is lost in
// transit on a reused/pooled session) live while monitoring the cluster —
// this failure mode is inherently more likely to surface under concurrent
// session-pool pressure than one investigation at a time. Not intended to
// replace the sequential baseline as the default suite config.
//
// workers: 12 — KA's live `interactive.maxConcurrentSessions` was raised
// 10 -> 20 (2026-08-11, direct ConfigMap patch + `kubernaut-agent` rollout
// restart, since the operator is currently down and won't fight the edit)
// specifically so all 12 tests can run fully concurrently without any of
// them hitting the unrelated `ErrMaxSessionsReached` capacity rejection
// (session_manager.go:189, SEC-03) instead of exercising #1995's actual
// pooled-session hang path.
export default defineConfig(baseConfig, {
  fullyParallel: true,
  workers: 12,
});
