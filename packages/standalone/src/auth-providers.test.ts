import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

async function loadProxyAuthProvider(useMock: boolean) {
  vi.resetModules();
  vi.stubEnv("VITE_MOCK_A2A", useMock ? "true" : "false");
  return import("./ProxyAuthProvider");
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

  it.each([{}, { iss: "issuer", sub: "subject", sid: " " }, { iss: "issuer", sub: 1, sid: "session" }])(
    "UT-CONSOLE-168-023: refuses missing or malformed verified claims (%s)",
    async (claims) => {
      const redirect = vi.fn();
      vi.stubGlobal("window", { location: { set href(value: string) { redirect(value); } } });
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ user: "display", additionalClaims: claims }))));
      const { ProxyAuthProvider } = await loadProxyAuthProvider(false);
      await expect(new ProxyAuthProvider().getUser()).rejects.toThrow();
      expect(redirect).not.toHaveBeenCalled();
    },
  );

  it("UT-CONSOLE-168-024: refuses a changed verified session even if display name is unchanged", async () => {
    const redirect = vi.fn();
    vi.stubGlobal("window", { location: { set href(value: string) { redirect(value); } } });
    const response = (sid: string) => new Response(JSON.stringify({ user: "same", additionalClaims: { iss: "issuer", sub: "subject", sid } }));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(response("one")).mockResolvedValueOnce(response("two")));
    const { ProxyAuthProvider } = await loadProxyAuthProvider(false);
    const provider = new ProxyAuthProvider();
    await expect(provider.getUser()).resolves.toMatchObject({ name: "same" });
    await expect(provider.getUser()).rejects.toThrow();
    expect(redirect).not.toHaveBeenCalled();
  });

  it("UT-CONSOLE-168-037: accepts a changed same-user session only on a fresh provider instance", async () => {
    const response = (sid: string) => new Response(JSON.stringify({
      user: "same",
      additionalClaims: { iss: "issuer", sub: "subject", sid },
    }));
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(response("old-session"))
      .mockResolvedValueOnce(response("new-session")));
    const { ProxyAuthProvider } = await loadProxyAuthProvider(false);

    await expect(new ProxyAuthProvider().getUser()).resolves.toMatchObject({ name: "same" });
    await expect(new ProxyAuthProvider().getUser()).resolves.toMatchObject({ name: "same" });
  });

  it("UT-CONSOLE-168-038: superseded userinfo verification cannot fail the successor request", async () => {
    let resolveFirst!: (response: Response) => void;
    let resolveSecond!: (response: Response) => void;
    vi.stubGlobal("fetch", vi.fn()
      .mockImplementationOnce(() => new Promise<Response>((resolve) => { resolveFirst = resolve; }))
      .mockImplementationOnce(() => new Promise<Response>((resolve) => { resolveSecond = resolve; })));
    const { ProxyAuthProvider } = await loadProxyAuthProvider(false);
    const provider = new ProxyAuthProvider();
    const first = provider.getUser();
    const second = provider.getUser();

    resolveSecond(new Response(JSON.stringify({ user: "new", additionalClaims: { iss: "issuer", sub: "subject", sid: "new" } })));
    await expect(second).resolves.toMatchObject({ name: "new" });
    resolveFirst(new Response(JSON.stringify({ user: "old", additionalClaims: { iss: "issuer", sub: "subject", sid: "old" } })));
    await expect(first).rejects.toThrow("Authentication verification superseded");
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
        new Response(JSON.stringify({ ...responseBody, additionalClaims: { iss: "issuer", sub: "subject", sid: "session" } }), { status: 200 }),
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
      expect(redirect).not.toHaveBeenCalled();
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
