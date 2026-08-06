import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { checkConsoleAccess } from "./access-check";

describe("checkConsoleAccess", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  // console#48 / kubernaut#1919: AF's coarse-grained console-access
  // pre-flight gate returns a bare 200 with no body on success.
  it("UT-CONSOLE-ACCESS-001 [console#48]: returns 'allowed' on a 200 response", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    await expect(checkConsoleAccess()).resolves.toBe("allowed");
  });

  it("UT-CONSOLE-ACCESS-002 [console#48]: returns 'denied' on a 403 (problem+json) response", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ type: "about:blank", title: "Forbidden", status: 403, detail: "not authorized to access the console" }), {
        status: 403,
        headers: { "Content-Type": "application/problem+json" },
      }),
    );
    await expect(checkConsoleAccess()).resolves.toBe("denied");
  });

  it("UT-CONSOLE-ACCESS-003 [console#48]: fails closed to 'error' on a 401 (do not conflate with coarse-grained denial)", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response(null, { status: 401 }));
    await expect(checkConsoleAccess()).resolves.toBe("error");
  });

  it("UT-CONSOLE-ACCESS-004 [console#48]: fails closed to 'error' on a 5xx response", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response(null, { status: 503 }));
    await expect(checkConsoleAccess()).resolves.toBe("error");
  });

  it("UT-CONSOLE-ACCESS-005 [console#48]: fails closed to 'error' on a network failure", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    await expect(checkConsoleAccess()).resolves.toBe("error");
  });

  it("UT-CONSOLE-ACCESS-006 [console#48]: requests GET /a2a/access under the given baseUrl", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    globalThis.fetch = fetchMock;

    await checkConsoleAccess({ baseUrl: "https://kubernaut.example.com" });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://kubernaut.example.com/a2a/access",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("UT-CONSOLE-ACCESS-007 [console#48]: requests a relative /a2a/access when no baseUrl is given", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    globalThis.fetch = fetchMock;

    await checkConsoleAccess();

    expect(fetchMock).toHaveBeenCalledWith("/a2a/access", expect.anything());
  });

  it("UT-CONSOLE-ACCESS-008 [console#48]: attaches the resolved bearer token when getToken is provided", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    globalThis.fetch = fetchMock;

    await checkConsoleAccess({ getToken: async () => "live-e2e-token-xyz" });

    const [, init] = fetchMock.mock.calls[0];
    expect((init.headers as Record<string, string>)["Authorization"]).toBe("Bearer live-e2e-token-xyz");
  });

  it("UT-CONSOLE-ACCESS-009 [console#48]: does not set an Authorization header when getToken is not provided", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    globalThis.fetch = fetchMock;

    await checkConsoleAccess();

    const [, init] = fetchMock.mock.calls[0];
    expect((init.headers as Record<string, string>)["Authorization"]).toBeUndefined();
  });

  it("UT-CONSOLE-ACCESS-010 [console#48]: fails closed to 'error' when getToken itself rejects, rather than throwing", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response(null, { status: 401 }));

    await expect(checkConsoleAccess({ getToken: async () => { throw new Error("token refresh failed"); } })).resolves.toBe("error");
  });
});
