import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import type { ProxyOptions } from "vite";

const upstream = process.env.VITE_API_UPSTREAM ?? "http://localhost:8443";

// Live E2E only: the disposable demo ingress serves a self-signed cert.
// Opt-in and explicit rather than relying on the spawning process's
// NODE_TLS_REJECT_UNAUTHORIZED — default (`secure: true`) is unchanged for
// local dev / standalone deploys against a real AF.
const secure = process.env.VITE_API_INSECURE_TLS !== "true";

function apiProxy(): ProxyOptions {
  return { target: upstream, changeOrigin: true, secure };
}

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/a2a": apiProxy(),
      "/mcp": apiProxy(),
      "/.well-known": apiProxy(),
    },
  },
});
