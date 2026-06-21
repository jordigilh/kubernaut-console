import { test, expect } from "@playwright/test";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

const PLUGIN_DIST = resolve(
  __dirname,
  "../packages/plugin-backstage/dist",
);
const PLUGIN_BUNDLE = resolve(
  __dirname,
  "../packages/plugin-backstage/dist-dynamic",
);

test.describe("Backstage Plugin Structural E2E", () => {
  test("dist/remoteEntry.js exists and is valid JavaScript", () => {
    const remoteEntry = resolve(PLUGIN_DIST, "remoteEntry.js");
    expect(existsSync(remoteEntry)).toBe(true);

    const content = readFileSync(remoteEntry, "utf-8");
    expect(content.length).toBeGreaterThan(100);
    expect(content).toContain("moduleMap");
  });

  test("dist/mf-manifest.json declares the plugin", () => {
    const manifestPath = resolve(PLUGIN_DIST, "mf-manifest.json");
    expect(existsSync(manifestPath)).toBe(true);

    const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
    expect(manifest.name).toBe("kubernaut__plugin_backstage");
    expect(manifest.metaData).toBeDefined();
  });

  test("legacy entry point exports kubernautPlugin", async () => {
    const indexPath = resolve(
      __dirname,
      "../packages/plugin-backstage/src/index.ts",
    );
    const content = readFileSync(indexPath, "utf-8");
    expect(content).toContain("kubernautPlugin");
    expect(content).toContain("KubernautPage");
  });

  test("NFS entry point exports frontendPlugin", async () => {
    const alphaPath = resolve(
      __dirname,
      "../packages/plugin-backstage/src/alpha.tsx",
    );
    const content = readFileSync(alphaPath, "utf-8");
    expect(content).toContain("createFrontendPlugin");
    expect(content).toContain("PageBlueprint");
  });

  test("config.d.ts declares kubernaut.backendUrl schema", () => {
    const configPath = resolve(
      __dirname,
      "../packages/plugin-backstage/config.d.ts",
    );
    expect(existsSync(configPath)).toBe(true);

    const content = readFileSync(configPath, "utf-8");
    expect(content).toContain("backendUrl");
    expect(content).toContain("kubernaut");
  });

  test("BackstageAuthProvider implements KubernautAuthProvider", () => {
    const authPath = resolve(
      __dirname,
      "../packages/plugin-backstage/src/providers/BackstageAuthProvider.ts",
    );
    const content = readFileSync(authPath, "utf-8");
    expect(content).toContain("KubernautAuthProvider");
    expect(content).toContain("getToken");
    expect(content).toContain("getUser");
    expect(content).toContain("identityApi");
  });

  test("bundle dist-dynamic/ has correct structure", () => {
    if (!existsSync(PLUGIN_BUNDLE)) {
      test.skip();
      return;
    }

    const pkgJson = JSON.parse(
      readFileSync(resolve(PLUGIN_BUNDLE, "package.json"), "utf-8"),
    );
    expect(pkgJson.name).toBe("@kubernaut/plugin-backstage");
    expect(pkgJson.main).toBe("dist/remoteEntry.js");
    expect(pkgJson.backstage.role).toBe("frontend-plugin");

    expect(
      existsSync(resolve(PLUGIN_BUNDLE, "dist/remoteEntry.js")),
    ).toBe(true);
    expect(existsSync(resolve(PLUGIN_BUNDLE, "config.d.ts"))).toBe(true);
  });
});
