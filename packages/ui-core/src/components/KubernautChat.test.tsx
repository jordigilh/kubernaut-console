import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import React, { useContext } from "react";
import { AuthContext, AuthenticationRequiredError } from "../providers/auth";
import { ConfigContext } from "../providers/config";
import type { KubernautAuthProvider, KubernautUser } from "../providers/auth";
import type { KubernautConfig } from "../providers/config";

vi.mock("./ChatContainer", () => ({
  ChatContainer: function MockChatContainer() {
    const auth = useContext(AuthContext);
    const config = useContext(ConfigContext);
    return React.createElement("div", { "data-testid": "chat-container" },
      React.createElement("span", { "data-testid": "ctx-user" }, auth?.user?.name ?? "none"),
      React.createElement("span", { "data-testid": "ctx-loading" }, String(auth?.isLoading ?? "null")),
      React.createElement("span", { "data-testid": "ctx-error" }, auth?.error ?? "no-error"),
      React.createElement("span", { "data-testid": "ctx-has-provider" }, auth?.provider ? "yes" : "no"),
      React.createElement("span", { "data-testid": "ctx-backend-url" }, config?.backendUrl ?? "none"),
      React.createElement("span", { "data-testid": "ctx-has-fetch" }, config?.fetchFn ? "yes" : "no"),
      React.createElement("button", { "data-testid": "simulate-backend-change", onClick: () => auth?.lifecycle?.observeBackendIncarnation?.("replacement-incarnation") }, "simulate backend change"),
    );
  },
}));

import { KubernautChat } from "./KubernautChat";

function makeMockAuthProvider(overrides?: Partial<KubernautAuthProvider>): KubernautAuthProvider {
  return {
    getToken: vi.fn().mockResolvedValue("mock-token"),
    getUser: vi.fn().mockResolvedValue({
      name: "Jane Doe",
      email: "jane@example.com",
      initials: "JD",
    } satisfies KubernautUser),
    ...overrides,
  };
}

function makeMockConfig(overrides?: Partial<KubernautConfig>): KubernautConfig {
  return {
    backendUrl: "https://kubernaut.test",
    ...overrides,
  };
}

class TestBroadcastChannel {
  static instances: TestBroadcastChannel[] = [];
  onmessage: ((event: MessageEvent) => void) | null = null;

  constructor(readonly name: string) {
    TestBroadcastChannel.instances.push(this);
  }

  postMessage(_message: unknown): void {}
  close(): void {}

  emit(data: unknown): void {
    this.onmessage?.({ data } as MessageEvent);
  }
}

function activeAuthChannel(): TestBroadcastChannel {
  const channel = TestBroadcastChannel.instances.find((candidate) => candidate.onmessage);
  if (!channel) throw new Error("No active auth notification channel");
  return channel;
}

describe("KubernautChat", () => {
  const originalFetch = globalThis.fetch;

  // console#48: KubernautChat now gates rendering on GET /a2a/access. Stub
  // it to "allowed" by default so pre-existing tests below (which predate
  // the gate) keep exercising post-render behavior; the gate itself is
  // covered by its own describe block further down.
  beforeEach(() => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    TestBroadcastChannel.instances = [];
    vi.unstubAllGlobals();
  });

  it("UT-CONSOLE-KC-001: renders ChatContainer when given valid props", async () => {
    render(
      <KubernautChat
        authProvider={makeMockAuthProvider()}
        config={makeMockConfig()}
      />,
    );
    await waitFor(() => {
      expect(screen.getByTestId("chat-container")).toBeInTheDocument();
    });
  });

  it("UT-CONSOLE-KC-002: provides config context with backendUrl to children", async () => {
    render(
      <KubernautChat
        authProvider={makeMockAuthProvider()}
        config={makeMockConfig({ backendUrl: "https://my-backend.test/api" })}
      />,
    );
    await waitFor(() => {
      expect(screen.getByTestId("ctx-backend-url")).toHaveTextContent("https://my-backend.test/api");
    });
  });

  it("UT-CONSOLE-KC-003: provides auth context with user after provider resolves", async () => {
    render(
      <KubernautChat
        authProvider={makeMockAuthProvider()}
        config={makeMockConfig()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId("ctx-user")).toHaveTextContent("Jane Doe");
    });
    expect(screen.getByTestId("ctx-loading")).toHaveTextContent("false");
    expect(screen.getByTestId("ctx-error")).toHaveTextContent("no-error");
  });

  it("UT-CONSOLE-KC-004: auth context surfaces error when getUser rejects", async () => {
    sessionStorage.setItem("kubernaut-console-messages", JSON.stringify([
      { id: "old-message", role: "user", text: "private incident details", timestamp: 1 },
    ]));
    sessionStorage.setItem("kubernaut-console-context", "old-context");

    const failingProvider = makeMockAuthProvider({
      getUser: vi.fn().mockRejectedValue(new Error("token expired")),
    });

    render(
      <KubernautChat
        authProvider={failingProvider}
        config={makeMockConfig()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });
    expect(screen.getByText("Authentication Error")).toBeInTheDocument();
    expect(screen.getByText("token expired")).toBeInTheDocument();
    expect(sessionStorage.getItem("kubernaut-console-messages")).toBeNull();
    expect(sessionStorage.getItem("kubernaut-console-context")).not.toBe("old-context");
  });

  it("IT-CONSOLE-168-016: fences and clears storage before required-auth navigation", async () => {
    sessionStorage.setItem("kubernaut-console-messages", "private incident details");
    const redirect = vi.fn();
    const realWindow = window;
    vi.stubGlobal("window", new Proxy(realWindow, {
      get(target, property) {
        if (property === "location") {
          return { set href(value: string) {
            expect(sessionStorage.getItem("kubernaut-console-messages")).toBeNull();
            redirect(value);
          } };
        }
        return Reflect.get(target, property, target);
      },
    }));
    const provider = makeMockAuthProvider({
      getUser: vi.fn().mockRejectedValue(new AuthenticationRequiredError()),
    });

    render(<KubernautChat authProvider={provider} config={makeMockConfig()} />);

    await waitFor(() => expect(redirect).toHaveBeenCalledWith("/oauth2/sign_in"));
    expect(screen.getByText("Authentication Error")).toBeInTheDocument();
  });

  it("IT-CONSOLE-168-034: revalidates cross-tab notifications with the host and ignores claim-bearing payloads", async () => {
    vi.stubGlobal("BroadcastChannel", TestBroadcastChannel);
    const provider = makeMockAuthProvider();

    render(<KubernautChat authProvider={provider} config={makeMockConfig()} />);
    await screen.findByTestId("chat-container");
    expect(provider.getUser).toHaveBeenCalledOnce();

    activeAuthChannel().emit({
      type: "kubernaut-console-auth-changed",
      iss: "untrusted-issuer",
      sub: "untrusted-subject",
      sid: "untrusted-session",
      cookie: "readable-cookie",
      authorization: "Bearer browser-token",
    });

    await waitFor(() => expect(provider.getUser).toHaveBeenCalledTimes(2));
    expect(screen.getByTestId("chat-container")).toBeInTheDocument();
  });

  it("IT-CONSOLE-168-035: changed host identity from a cross-tab notification fences, clears, and redirects", async () => {
    vi.stubGlobal("BroadcastChannel", TestBroadcastChannel);
    sessionStorage.setItem("kubernaut-console-messages", "private successor data");
    const redirect = vi.fn();
    const realWindow = window;
    vi.stubGlobal("window", new Proxy(realWindow, {
      get(target, property) {
        if (property === "location") {
          return { set href(value: string) { redirect(value); } };
        }
        return Reflect.get(target, property, target);
      },
    }));
    const provider = makeMockAuthProvider({
      getUser: vi.fn()
        .mockResolvedValueOnce({ name: "Jane Doe", email: "jane@example.com", initials: "JD" })
        .mockRejectedValueOnce(new AuthenticationRequiredError()),
    });

    render(<KubernautChat authProvider={provider} config={makeMockConfig()} />);
    await screen.findByTestId("chat-container");
    activeAuthChannel().emit({ type: "kubernaut-console-auth-changed", sid: "untrusted" });

    await waitFor(() => expect(redirect).toHaveBeenCalledWith("/oauth2/sign_in"));
    expect(sessionStorage.getItem("kubernaut-console-messages")).toBeNull();
  });

  it("IT-CONSOLE-168-036: delayed cross-tab revalidation cannot clear a successor lifecycle", async () => {
    vi.stubGlobal("BroadcastChannel", TestBroadcastChannel);
    let resolveRevalidation!: (user: KubernautUser) => void;
    const oldProvider = makeMockAuthProvider({
      getUser: vi.fn()
        .mockResolvedValueOnce({ name: "Old", email: "old@example.com", initials: "OL" })
        .mockReturnValueOnce(new Promise<KubernautUser>((resolve) => { resolveRevalidation = resolve; })),
    });
    const nextProvider = makeMockAuthProvider({
      getUser: vi.fn().mockResolvedValue({ name: "New", email: "new@example.com", initials: "NE" }),
    });
    const view = render(<KubernautChat authProvider={oldProvider} config={makeMockConfig()} />);
    await screen.findByTestId("chat-container");
    activeAuthChannel().emit({ type: "kubernaut-console-auth-changed" });
    await waitFor(() => expect(oldProvider.getUser).toHaveBeenCalledTimes(2));

    view.rerender(<KubernautChat authProvider={nextProvider} config={makeMockConfig()} />);
    await waitFor(() => expect(screen.getByTestId("ctx-user")).toHaveTextContent("New"));
    sessionStorage.setItem("kubernaut-console-messages", "successor messages");
    resolveRevalidation({ name: "Old", email: "old@example.com", initials: "OL" });

    await act(async () => {});
    expect(sessionStorage.getItem("kubernaut-console-messages")).toBe("successor messages");
    expect(screen.getByTestId("ctx-user")).toHaveTextContent("New");
  });

  it("IT-CONSOLE-168-001: a superseded authentication failure cannot clear the successor's session", async () => {
    let rejectOld!: (error: Error) => void;
    const oldProvider = makeMockAuthProvider({
      getUser: vi.fn().mockReturnValue(new Promise<KubernautUser>((_resolve, reject) => { rejectOld = reject; })),
    });
    const nextProvider = makeMockAuthProvider();
    const config = makeMockConfig();
    const view = render(<KubernautChat authProvider={oldProvider} config={config} />);

    view.rerender(<KubernautChat authProvider={nextProvider} config={config} />);
    await screen.findByTestId("chat-container");
    sessionStorage.setItem("kubernaut-console-messages", "successor messages");
    sessionStorage.setItem("kubernaut-console-context", "successor context");

    await act(async () => { rejectOld(new Error("old authentication failed")); });

    expect(sessionStorage.getItem("kubernaut-console-messages")).toBe("successor messages");
    expect(sessionStorage.getItem("kubernaut-console-context")).toBe("successor context");
    expect(screen.getByTestId("chat-container")).toBeInTheDocument();
  });

  it("IT-CONSOLE-168-002: a replacement source cannot render the previous session while authentication is pending", async () => {
    const authProvider = makeMockAuthProvider();
    const oldConfig = makeMockConfig({ backendUrl: "https://old-source.test" });
    const nextConfig = makeMockConfig({ backendUrl: "https://new-source.test" });
    const view = render(<KubernautChat authProvider={authProvider} config={oldConfig} />);
    await screen.findByTestId("chat-container");

    vi.mocked(authProvider.getUser).mockReturnValue(new Promise<KubernautUser>(() => {}));
    view.rerender(<KubernautChat authProvider={authProvider} config={nextConfig} />);

    expect(screen.queryByTestId("chat-container")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("IT-CONSOLE-168-014: clears old source storage before mounting a successor", async () => {
    const oldProvider = makeMockAuthProvider();
    const nextProvider = makeMockAuthProvider({
      getUser: vi.fn().mockResolvedValue({ name: "Successor", email: "successor@example.com", initials: "SU" }),
    });
    const view = render(<KubernautChat authProvider={oldProvider} config={makeMockConfig()} />);
    await screen.findByTestId("chat-container");

    sessionStorage.setItem("kubernaut-console-messages", "old source messages");
    sessionStorage.setItem("kubernaut-console-context", "old source context");
    view.rerender(<KubernautChat authProvider={nextProvider} config={makeMockConfig()} />);

    await waitFor(() => expect(screen.getByTestId("ctx-user")).toHaveTextContent("Successor"));
    expect(sessionStorage.getItem("kubernaut-console-messages")).toBeNull();
    expect(sessionStorage.getItem("kubernaut-console-context")).not.toBe("old source context");
  });

  it("IT-CONSOLE-168-015: a changed backend incarnation fences and revalidates without redirecting", async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.endsWith("/.well-known/kubernaut-console-contract.json")) {
        return Promise.resolve(new Response(JSON.stringify({ backend_incarnation: "initial-incarnation" }), { status: 200 }));
      }
      return Promise.resolve(new Response(null, { status: 200 }));
    });
    globalThis.fetch = fetchMock;
    const redirect = vi.fn();
    vi.stubGlobal("window", { location: { set href(value: string) { redirect(value); } } });

    render(
      <KubernautChat
        authProvider={makeMockAuthProvider()}
        config={makeMockConfig({ requireBackendIncarnation: true })}
      />,
    );
    await screen.findByTestId("chat-container");

    fireEvent.click(screen.getByTestId("simulate-backend-change"));
    await screen.findByTestId("chat-container");

    expect(redirect).not.toHaveBeenCalled();
    expect(fetchMock.mock.calls.filter(([url]) => String(url).endsWith("/.well-known/kubernaut-console-contract.json"))).toHaveLength(2);
  });

  it("UT-CONSOLE-168-017: fences a missing backend contract and exposes retry", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ wrong: "shape" }), { status: 200 }));

    render(
      <KubernautChat
        authProvider={makeMockAuthProvider()}
        config={makeMockConfig({ requireBackendIncarnation: true })}
      />,
    );

    await waitFor(() => expect(screen.getByText("Backend lifecycle check returned an invalid incarnation")).toBeInTheDocument());
    expect(screen.queryByTestId("chat-container")).not.toBeInTheDocument();
  });

  it("UT-CONSOLE-KC-005: auth context exposes the authProvider instance", async () => {
    render(
      <KubernautChat
        authProvider={makeMockAuthProvider()}
        config={makeMockConfig()}
      />,
    );
    await waitFor(() => {
      expect(screen.getByTestId("ctx-has-provider")).toHaveTextContent("yes");
    });
  });

  it("UT-CONSOLE-KC-006: isLoading is true while getUser is pending", () => {
    const neverResolve = makeMockAuthProvider({
      getUser: vi.fn().mockReturnValue(new Promise(() => {})),
    });

    render(
      <KubernautChat
        authProvider={neverResolve}
        config={makeMockConfig()}
      />,
    );

    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.getByText("Authenticating...")).toBeInTheDocument();
  });

  it("UT-CONSOLE-KC-007: config context propagates custom fetchFn", async () => {
    const customFetch = vi.fn().mockResolvedValue(new Response("ok"));

    render(
      <KubernautChat
        authProvider={makeMockAuthProvider()}
        config={makeMockConfig({ fetchFn: customFetch })}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId("ctx-has-fetch")).toHaveTextContent("yes");
    });
  });

  it("UT-CONSOLE-KC-008: config context has no fetchFn when not provided", async () => {
    render(
      <KubernautChat
        authProvider={makeMockAuthProvider()}
        config={makeMockConfig()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId("ctx-has-fetch")).toHaveTextContent("no");
    });
  });

  // console#48 / kubernaut#1919: coarse-grained console-access gate. A user
  // with valid OIDC credentials but no Kubernaut tool grants must see a
  // clear "access denied" screen instead of a fully-rendered (but
  // functionally broken) chat shell.
  describe("console#48: console-access gate (GET /a2a/access)", () => {
    it("UT-CONSOLE-KC-009 [console#48]: renders ChatContainer when the access check returns 200", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));

      render(
        <KubernautChat authProvider={makeMockAuthProvider()} config={makeMockConfig()} />,
      );

      await waitFor(() => {
        expect(screen.getByTestId("chat-container")).toBeInTheDocument();
      });
    });

    it("UT-CONSOLE-KC-010 [console#48]: renders an access-denied screen instead of ChatContainer on a 403", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(new Response(null, { status: 403 }));

      render(
        <KubernautChat authProvider={makeMockAuthProvider()} config={makeMockConfig()} />,
      );

      await waitFor(() => {
        expect(screen.getByRole("alert")).toBeInTheDocument();
      });
      expect(screen.getByText("Access Denied")).toBeInTheDocument();
      expect(screen.queryByTestId("chat-container")).not.toBeInTheDocument();
    });

    it("UT-CONSOLE-KC-011 [console#48]: fails closed -- a network error on the access check does not render ChatContainer", async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));

      render(
        <KubernautChat authProvider={makeMockAuthProvider()} config={makeMockConfig()} />,
      );

      await waitFor(() => {
        expect(screen.getByRole("alert")).toBeInTheDocument();
      });
      expect(screen.getByText("Unable to Verify Access")).toBeInTheDocument();
      expect(screen.queryByTestId("chat-container")).not.toBeInTheDocument();
    });

    it("UT-CONSOLE-KC-012 [console#48]: fails closed -- a 5xx from the access check does not render ChatContainer", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(new Response(null, { status: 503 }));

      render(
        <KubernautChat authProvider={makeMockAuthProvider()} config={makeMockConfig()} />,
      );

      await waitFor(() => {
        expect(screen.getByRole("alert")).toBeInTheDocument();
      });
      expect(screen.getByText("Unable to Verify Access")).toBeInTheDocument();
      expect(screen.queryByTestId("chat-container")).not.toBeInTheDocument();
    });

    it("UT-CONSOLE-KC-013 [console#48]: does not call the access check until getUser() resolves", async () => {
      const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
      globalThis.fetch = fetchMock;
      let resolveUser: (u: KubernautUser) => void = () => {};
      const pendingProvider = makeMockAuthProvider({
        getUser: vi.fn().mockReturnValue(new Promise<KubernautUser>((resolve) => { resolveUser = resolve; })),
      });

      render(
        <KubernautChat authProvider={pendingProvider} config={makeMockConfig()} />,
      );

      expect(screen.getByText("Authenticating...")).toBeInTheDocument();
      expect(fetchMock).not.toHaveBeenCalled();

      resolveUser({ name: "Jane Doe", email: "jane@example.com", initials: "JD" });

      await waitFor(() => {
        expect(fetchMock).toHaveBeenCalled();
      });
    });

    it("UT-CONSOLE-KC-014 [console#48]: skips the access check entirely when getUser() rejects", async () => {
      const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
      globalThis.fetch = fetchMock;
      const failingProvider = makeMockAuthProvider({
        getUser: vi.fn().mockRejectedValue(new Error("token expired")),
      });

      render(
        <KubernautChat authProvider={failingProvider} config={makeMockConfig()} />,
      );

      await waitFor(() => {
        expect(screen.getByText("Authentication Error")).toBeInTheDocument();
      });
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  // console#48: standalone/accessibility E2E and local `pnpm dev` run
  // against a mocked A2A backend with no real GET /a2a/access to answer --
  // the gate must not fail-closed those consumers. USE_MOCK is a
  // module-scoped constant read from import.meta.env at import time, so
  // stub the env and re-import fresh rather than toggling a live binding.
  describe("console#48: VITE_MOCK_A2A bypasses the access-check gate", () => {
    beforeEach(() => {
      vi.stubEnv("VITE_MOCK_A2A", "true");
      vi.resetModules();
    });

    afterEach(() => {
      vi.unstubAllEnvs();
    });

    it("UT-CONSOLE-KC-015 [console#48]: renders ChatContainer without calling the access check when VITE_MOCK_A2A=true", async () => {
      const fetchMock = vi.fn();
      globalThis.fetch = fetchMock;

      const { KubernautChat: MockModeKubernautChat } = await import("./KubernautChat");

      render(
        <MockModeKubernautChat authProvider={makeMockAuthProvider()} config={makeMockConfig()} />,
      );

      await waitFor(() => {
        expect(screen.getByTestId("chat-container")).toBeInTheDocument();
      });
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });
});
