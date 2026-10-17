import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

async function loadProxyAuthProvider(useMock: boolean) {
  vi.resetModules();
  vi.stubEnv("VITE_MOCK_A2A", useMock ? "true" : "false");
  return import("./ProxyAuthProvider");
}

async function loadLiveE2EAuthProvider(token: string) {
  vi.resetModules();
  vi.stubEnv("VITE_LIVE_E2E_TOKEN", token);
  return import("./LiveE2EAuthProvider");
}

describe("ProxyAuthProvider", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("UT-CONSOLE-AUTH-092-003: returns an empty token for proxy-authenticated requests", async () => {
    const { ProxyAuthProvider } = await loadProxyAuthProvider(false);

    await expect(new ProxyAuthProvider().getToken()).resolves.toBe("");
  });

  it("UT-CONSOLE-AUTH-092-005: returns the development identity in mock mode without fetching", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { ProxyAuthProvider } = await loadProxyAuthProvider(true);

    await expect(new ProxyAuthProvider().getUser()).resolves.toEqual({
      name: "Dev User",
      email: "dev@localhost",
      initials: "DU",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    [
      "preferredUsername with a full name",
      { preferredUsername: "Jane Doe", email: "jane@example.com" },
      { name: "Jane Doe", email: "jane@example.com", initials: "JD" },
    ],
    [
      "user with a single name",
      { user: "alice", email: "" },
      { name: "alice", email: "", initials: "AL" },
    ],
    [
      "name with a full name",
      { name: "Alice Smith", email: "" },
      { name: "Alice Smith", email: "", initials: "AS" },
    ],
    [
      "email-only identity",
      { email: "bob@example.com" },
      { name: "", email: "bob@example.com", initials: "BO" },
    ],
    [
      "same name and email",
      { name: "same@example.com", email: "same@example.com" },
      { name: "same@example.com", email: "same@example.com", initials: "SA" },
    ],
    [
      "empty identity",
      {},
      { name: "", email: "", initials: "??" },
    ],
  ])(
    "UT-CONSOLE-AUTH-092-004: maps %s from /oauth2/userinfo",
    async (_description, responseBody, expectedUser) => {
      const fetchMock = vi.fn().mockResolvedValue(
        new Response(JSON.stringify(responseBody), { status: 200 }),
      );
      vi.stubGlobal("fetch", fetchMock);
      const { ProxyAuthProvider } = await loadProxyAuthProvider(false);

      await expect(new ProxyAuthProvider().getUser()).resolves.toEqual(expectedUser);
      expect(fetchMock).toHaveBeenCalledWith("/oauth2/userinfo");
    },
  );

  it.each([401, 403])(
    "UT-CONSOLE-AUTH-092-006: redirects to login for HTTP %s",
    async (status) => {
      const redirect = vi.fn();
      vi.stubGlobal("window", {
        location: {
          get href() {
            return "";
          },
          set href(value: string) {
            redirect(value);
          },
        },
      });
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(new Response(null, { status })),
      );
      const { ProxyAuthProvider } = await loadProxyAuthProvider(false);

      await expect(new ProxyAuthProvider().getUser()).rejects.toThrow(
        "Redirecting to login",
      );
      expect(redirect).toHaveBeenCalledWith("/oauth2/sign_in");
    },
  );

  it("UT-CONSOLE-AUTH-092-007: reports non-authentication HTTP errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status: 500 })),
    );
    const { ProxyAuthProvider } = await loadProxyAuthProvider(false);

    await expect(new ProxyAuthProvider().getUser()).rejects.toThrow("HTTP 500");
  });
});

describe("LiveE2EAuthProvider", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("UT-CONSOLE-AUTH-092-008: returns the configured live-E2E token", async () => {
    const { LiveE2EAuthProvider } = await loadLiveE2EAuthProvider("dex-token");

    await expect(new LiveE2EAuthProvider().getToken()).resolves.toBe("dex-token");
  });

  it("UT-CONSOLE-AUTH-092-009: rejects when the live-E2E token is missing", async () => {
    const { LiveE2EAuthProvider } = await loadLiveE2EAuthProvider("");

    await expect(new LiveE2EAuthProvider().getToken()).rejects.toThrow(
      "VITE_LIVE_E2E_TOKEN is not set",
    );
  });

  it("UT-CONSOLE-AUTH-092-010: returns the stable live-E2E identity", async () => {
    const { LiveE2EAuthProvider } = await loadLiveE2EAuthProvider("dex-token");

    await expect(new LiveE2EAuthProvider().getUser()).resolves.toEqual({
      name: "sre-user",
      email: "sre@kubernaut.ai",
      initials: "SR",
    });
  });
});
