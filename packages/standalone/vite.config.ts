import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/a2a": {
        target: process.env.VITE_API_UPSTREAM ?? "http://localhost:8443",
        changeOrigin: true,
      },
      "/mcp": {
        target: process.env.VITE_API_UPSTREAM ?? "http://localhost:8443",
        changeOrigin: true,
      },
      "/.well-known": {
        target: process.env.VITE_API_UPSTREAM ?? "http://localhost:8443",
        changeOrigin: true,
      },
    },
  },
});
