import baseConfig from "./playwright.live-v15.config";
import { defineConfig } from "@playwright/test";

// One-off override of playwright.live-v15.config.ts for a controlled,
// low-concurrency race-detection run (2026-08-11): the 12-way
// playwright.live-v15-parallel.config.ts run surfaced a ~33% real
// "context canceled" rate under full 12x concurrent claude-sonnet-5 calls,
// but that couldn't be attributed to kubernaut code vs. the real Vertex AI
// endpoint's own latency/throughput under load without a mockLLM-based
// controlled comparison (see kubernaut#2096 follow-up comment) -- this repo
// doesn't have a mockLLM harness for the live suite, so instead we dial
// concurrency down to workers: 2, deliberately far below anything that
// would meaningfully contend for Vertex AI capacity, while still running
// two investigations genuinely concurrently to exercise the exact shared,
// session-scoped code paths #2100 (SessionJanitor) and #2103 (interactive
// session gauge, kubernaut PR #2107) just fixed -- enough real concurrency
// to catch a race in that code, not enough to confound results with LLM
// backend throughput variance.
export default defineConfig(baseConfig, {
  fullyParallel: true,
  workers: 2,
});
