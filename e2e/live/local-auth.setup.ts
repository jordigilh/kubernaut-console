import { chromium, type FullConfig } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export const localAuthStatePath =
  process.env.LIVE_E2E_AUTH_STATE ?? join(homedir(), ".config", "kubernaut-console-e2e", "local-auth-state.json");

export default async function globalSetup(config: FullConfig): Promise<void> {
  const baseURL = String(config.projects[0]?.use.baseURL ?? process.env.LIVE_E2E_CONSOLE_URL ?? "");
  const username = process.env.LIVE_E2E_KEYCLOAK_USERNAME ?? process.env.LIVE_E2E_USERNAME;
  const password = process.env.LIVE_E2E_KEYCLOAK_PASSWORD ?? process.env.LIVE_E2E_PASSWORD;

  if (!baseURL || !username || !password) {
    throw new Error(
      "Local live E2E auth requires LIVE_E2E_CONSOLE_URL, LIVE_E2E_KEYCLOAK_USERNAME, " +
        "and LIVE_E2E_KEYCLOAK_PASSWORD.",
    );
  }

  const browser = await chromium.launch();
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await context.newPage();

  try {
    await page.goto(baseURL, { waitUntil: "domcontentloaded" });

    const loginField = page.locator("#username");
    if (await loginField.isVisible({ timeout: 10_000 }).catch(() => false)) {
      await loginField.fill(username);
      await page.locator("#password").fill(password);
      await page.locator("#kc-login").click();
    }

    const expectedOrigin = new URL(baseURL).origin;
    await page.waitForURL((url) => url.origin === expectedOrigin, { timeout: 60_000 });
    await page.locator(".kn-chat").waitFor({ state: "visible", timeout: 60_000 });

    mkdirSync(dirname(localAuthStatePath), { recursive: true, mode: 0o700 });
    await context.storageState({ path: localAuthStatePath });
  } finally {
    await context.close();
    await browser.close();
  }
}
