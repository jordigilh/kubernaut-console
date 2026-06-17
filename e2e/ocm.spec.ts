import { test, expect } from "@playwright/test";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

const PLUGIN_DIST = resolve(__dirname, "../packages/plugin-ocm/dist");
const DEPLOY_DIR = resolve(__dirname, "../packages/plugin-ocm/deploy");
const HELM_DIR = resolve(DEPLOY_DIR, "helm/kubernaut-console-plugin");

test.describe("OCM Console Plugin Structural E2E", () => {
  test("plugin-manifest.json is valid and declares extensions", () => {
    const manifestPath = resolve(PLUGIN_DIST, "plugin-manifest.json");
    expect(existsSync(manifestPath)).toBe(true);

    const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
    expect(manifest.name).toBe("kubernaut-console-plugin");
    expect(manifest.version).toBe("0.1.0");
    expect(manifest.extensions).toHaveLength(2);

    const pageRoute = manifest.extensions.find(
      (e: any) => e.type === "console.page/route",
    );
    expect(pageRoute).toBeDefined();
    expect(pageRoute.properties.path).toBe("/kubernaut");
    expect(pageRoute.properties.component.$codeRef).toBe("KubernautPage");

    const navItem = manifest.extensions.find(
      (e: any) => e.type === "console.navigation/href",
    );
    expect(navItem).toBeDefined();
    expect(navItem.properties.href).toBe("/kubernaut");
    expect(navItem.properties.section).toBe("observe");
  });

  test("plugin-entry.js exists and is non-empty", () => {
    const entryPath = resolve(PLUGIN_DIST, "plugin-entry.js");
    expect(existsSync(entryPath)).toBe(true);
    expect(readFileSync(entryPath, "utf-8").length).toBeGreaterThan(100);
  });

  test("ConsolePlugin CR is correctly defined", () => {
    const crPath = resolve(DEPLOY_DIR, "console-plugin.yaml");
    const content = readFileSync(crPath, "utf-8");

    expect(content).toContain("kind: ConsolePlugin");
    expect(content).toContain("name: kubernaut-console-plugin");
    expect(content).toContain("alias: kagenti");
    expect(content).toContain("authorization: UserToken");
    expect(content).toContain("port: 9443");
  });

  test("Deployment manifest references correct image and volumes", () => {
    const deployPath = resolve(DEPLOY_DIR, "deployment.yaml");
    const content = readFileSync(deployPath, "utf-8");

    expect(content).toContain("kind: Deployment");
    expect(content).toContain(
      "image: ghcr.io/jordigilh/kubernaut-console-plugin:latest",
    );
    expect(content).toContain("kubernaut-console-plugin-cert");
    expect(content).toContain("containerPort: 9443");
  });

  test("ManagedClusterAddon template deploys kagenti", () => {
    const templatePath = resolve(
      DEPLOY_DIR,
      "addon/addon-template.yaml",
    );
    const content = readFileSync(templatePath, "utf-8");

    expect(content).toContain("kind: AddOnTemplate");
    expect(content).toContain("addonName: kubernaut-agent");
    expect(content).toContain("kind: Deployment");
    expect(content).toContain("image: ghcr.io/jordigilh/kagenti:latest");
    expect(content).toContain("SPIRE_AGENT_SOCKET");
    expect(content).toContain("kind: AgentRuntime");
  });

  test("ClusterManagementAddOn uses addon-manager lifecycle", () => {
    const cmaPath = resolve(
      DEPLOY_DIR,
      "addon/cluster-management-addon.yaml",
    );
    const content = readFileSync(cmaPath, "utf-8");

    expect(content).toContain("kind: ClusterManagementAddOn");
    expect(content).toContain("lifecycle: addon-manager");
    expect(content).toContain("type: Placements");
  });

  test("Helm chart has valid Chart.yaml", () => {
    const chartPath = resolve(HELM_DIR, "Chart.yaml");
    expect(existsSync(chartPath)).toBe(true);

    const content = readFileSync(chartPath, "utf-8");
    expect(content).toContain("name: kubernaut-console-plugin");
    expect(content).toContain("version: 0.1.0");
    expect(content).toContain("type: application");
  });

  test("Helm values.yaml has required config", () => {
    const valuesPath = resolve(HELM_DIR, "values.yaml");
    const content = readFileSync(valuesPath, "utf-8");

    expect(content).toContain("repository: ghcr.io/jordigilh/kubernaut-console-plugin");
    expect(content).toContain("kagenti:");
    expect(content).toContain("port: 9443");
    expect(content).toContain("enablePlugin: true");
  });

  test("Helm templates render ConsolePlugin with proxy", () => {
    const tplPath = resolve(HELM_DIR, "templates/consoleplugin.yaml");
    const content = readFileSync(tplPath, "utf-8");

    expect(content).toContain("kind: ConsolePlugin");
    expect(content).toContain("alias: kagenti");
    expect(content).toContain("authorization: UserToken");
    expect(content).toContain(".Values.kagenti.service.name");
  });

  test("Containerfile uses UBI9 nginx base", () => {
    const dockerfilePath = resolve(
      __dirname,
      "../packages/plugin-ocm/Containerfile",
    );
    const content = readFileSync(dockerfilePath, "utf-8");

    expect(content).toContain("ubi9/nginx");
    expect(content).toContain("COPY dist/");
    expect(content).toContain("EXPOSE 9443");
  });
});
