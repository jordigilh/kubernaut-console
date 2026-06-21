import { describe, it, expect, vi } from "vitest";

vi.mock("@openshift-console/dynamic-plugin-sdk", () => ({
  consoleFetch: vi.fn(),
}));

import { useOCMConfig } from "./useOCMConfig";

describe("useOCMConfig", () => {
  it("returns the correct proxy base URL", () => {
    const config = useOCMConfig();
    expect(config.backendUrl).toBe(
      "/api/proxy/plugin/kubernaut-console-plugin/kagenti",
    );
  });

  it("provides a custom fetchFn", () => {
    const config = useOCMConfig();
    expect(config.fetchFn).toBeDefined();
    expect(typeof config.fetchFn).toBe("function");
  });
});
