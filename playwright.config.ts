import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 30000,
  snapshotPathTemplate: "{testDir}/{testFileDir}/{testFileName}-snapshots/{arg}{ext}",
  expect: {
    toHaveScreenshot: {
      maxDiffPixelRatio: 0.05,
      animations: "disabled",
    },
  },
  use: {
    baseURL: "http://localhost:6006",
    viewport: { width: 820, height: 750 },
    actionTimeout: 10000,
  },
  projects: [
    {
      name: "chromium",
      use: { browserName: "chromium" },
    },
  ],
  webServer: {
    command: "npx http-server storybook-static -p 6006 -s",
    port: 6006,
    reuseExistingServer: true,
  },
});
