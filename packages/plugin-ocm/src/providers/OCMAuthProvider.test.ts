import { describe, it, expect, vi, beforeEach } from "vitest";
import { OCMAuthProvider } from "./OCMAuthProvider";

vi.mock("@openshift-console/dynamic-plugin-sdk", () => ({
  consoleFetch: vi.fn(),
}));

import { consoleFetch } from "@openshift-console/dynamic-plugin-sdk";

describe("OCMAuthProvider", () => {
  let provider: OCMAuthProvider;

  beforeEach(() => {
    provider = new OCMAuthProvider();
    vi.clearAllMocks();
  });

  it("getToken returns empty string (proxy handles auth)", async () => {
    const token = await provider.getToken();
    expect(token).toBe("");
  });

  it("getUser fetches from OCP user API", async () => {
    const mockResponse = {
      json: () =>
        Promise.resolve({
          metadata: {
            name: "admin",
            annotations: { "openshift.io/email": "admin@example.com" },
          },
        }),
    };
    vi.mocked(consoleFetch).mockResolvedValue(mockResponse as any);

    const user = await provider.getUser();
    expect(user.name).toBe("admin");
    expect(user.email).toBe("admin@example.com");
    expect(user.initials).toBe("AD");
    expect(consoleFetch).toHaveBeenCalledWith(
      "/api/kubernetes/apis/user.openshift.io/v1/users/~",
    );
  });

  it("getUser caches result on subsequent calls", async () => {
    const mockResponse = {
      json: () =>
        Promise.resolve({
          metadata: { name: "developer" },
        }),
    };
    vi.mocked(consoleFetch).mockResolvedValue(mockResponse as any);

    await provider.getUser();
    await provider.getUser();
    expect(consoleFetch).toHaveBeenCalledTimes(1);
  });

  it("getUser falls back on fetch error", async () => {
    vi.mocked(consoleFetch).mockRejectedValue(new Error("Network error"));

    const user = await provider.getUser();
    expect(user.name).toBe("Console User");
    expect(user.initials).toBe("CU");
  });
});
