#!/usr/bin/env node
// webServer.command for playwright.live.config.ts.
//
// Playwright's `webServer` starts before `globalSetup`'s output can be
// threaded into it as an env var, so token acquisition happens here instead:
// fetch a real Dex token synchronously, then exec Vite with it set — Vite
// reads VITE_LIVE_E2E_TOKEN from process.env at server start and inlines it
// wherever `import.meta.env.VITE_LIVE_E2E_TOKEN` is referenced
// (LiveE2EAuthProvider.ts).
import { spawn } from "node:child_process";
import { fetchDexToken, DEX_DEFAULTS } from "./dex-token.mjs";

const dexUrl = process.env.LIVE_E2E_DEX_URL ?? DEX_DEFAULTS.dexUrl;
const afUrl = process.env.LIVE_E2E_AF_URL ?? "https://localhost:30443";
const port = process.env.LIVE_E2E_CONSOLE_PORT ?? "5174";

const token = await fetchDexToken({ dexUrl });
console.log(`[live-e2e] fetched Dex token from ${dexUrl} (${token.length} chars)`);

const vite = spawn(
  "pnpm",
  ["--filter", "@kubernaut/standalone", "exec", "vite", "--port", port, "--strictPort"],
  {
    stdio: "inherit",
    env: {
      ...process.env,
      VITE_LIVE_E2E_TOKEN: token,
      VITE_API_UPSTREAM: afUrl,
      VITE_API_INSECURE_TLS: "true", // AF's e2e overlay uses a self-signed cert (see vite.config.ts)
    },
  },
);

vite.on("exit", (code) => process.exit(code ?? 1));

for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => vite.kill(sig));
}
