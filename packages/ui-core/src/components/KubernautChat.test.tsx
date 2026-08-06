import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import React, { useContext } from "react";
import { AuthContext } from "../providers/auth";
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
