import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const upstream = process.env.VITE_API_UPSTREAM ?? "http://localhost:8443";

// ADR-009 live E2E only: kubernaut's e2e overlay (Dex + AF) serves a
// self-signed cert. Opt-in and explicit rather than relying on the
// spawning process's NODE_TLS_REJECT_UNAUTHORIZED — default (`secure: true`)
// is unchanged for local dev / standalone deploys against a real AF.
const secure = process.env.VITE_API_INSECURE_TLS !== "true";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/a2a": { target: upstream, changeOrigin: true, secure },
      "/mcp": { target: upstream, changeOrigin: true, secure },
      "/.well-known": { target: upstream, changeOrigin: true, secure },
    },
  },
});
