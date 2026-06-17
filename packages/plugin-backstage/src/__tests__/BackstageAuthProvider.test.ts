import { describe, it, expect, vi } from "vitest";
import { BackstageAuthProvider } from "../providers/BackstageAuthProvider";
import type { IdentityApi } from "@backstage/core-plugin-api";

function createMockIdentityApi(overrides: Partial<IdentityApi> = {}): IdentityApi {
  return {
    getCredentials: vi.fn().mockResolvedValue({ token: "test-token-123" }),
    getBackstageIdentity: vi.fn().mockResolvedValue({
      type: "user",
      userEntityRef: "user:default/john.doe",
      ownershipEntityRefs: ["user:default/john.doe"],
    }),
    getProfileInfo: vi.fn().mockResolvedValue({
      displayName: "John Doe",
      email: "john@example.com",
    }),
    signOut: vi.fn(),
    ...overrides,
  };
}

describe("BackstageAuthProvider", () => {
  it("getToken returns the identity token", async () => {
    const mockApi = createMockIdentityApi();
    const provider = new BackstageAuthProvider(mockApi);

    const token = await provider.getToken();

    expect(token).toBe("test-token-123");
    expect(mockApi.getCredentials).toHaveBeenCalled();
  });

  it("getToken returns empty string when no token available", async () => {
    const mockApi = createMockIdentityApi({
      getCredentials: vi.fn().mockResolvedValue({}),
    });
    const provider = new BackstageAuthProvider(mockApi);

    const token = await provider.getToken();

    expect(token).toBe("");
  });

  it("getUser extracts name from userEntityRef", async () => {
    const mockApi = createMockIdentityApi();
    const provider = new BackstageAuthProvider(mockApi);

    const user = await provider.getUser();

    expect(user.name).toBe("john.doe");
    expect(user.initials).toBe("JD");
    expect(mockApi.getBackstageIdentity).toHaveBeenCalled();
  });

  it("getUser handles single-word username", async () => {
    const mockApi = createMockIdentityApi({
      getBackstageIdentity: vi.fn().mockResolvedValue({
        type: "user",
        userEntityRef: "user:default/admin",
        ownershipEntityRefs: [],
      }),
    });
    const provider = new BackstageAuthProvider(mockApi);

    const user = await provider.getUser();

    expect(user.name).toBe("admin");
    expect(user.initials).toBe("AD");
  });
});
