import { describe, it, expect, vi } from "vitest";
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
  it("UT-CONSOLE-KC-001: renders ChatContainer when given valid props", () => {
    render(
      <KubernautChat
        authProvider={makeMockAuthProvider()}
        config={makeMockConfig()}
      />,
    );
    expect(screen.getByTestId("chat-container")).toBeInTheDocument();
  });

  it("UT-CONSOLE-KC-002: provides config context with backendUrl to children", () => {
    render(
      <KubernautChat
        authProvider={makeMockAuthProvider()}
        config={makeMockConfig({ backendUrl: "https://my-backend.test/api" })}
      />,
    );
    expect(screen.getByTestId("ctx-backend-url")).toHaveTextContent("https://my-backend.test/api");
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
      expect(screen.getByTestId("ctx-error")).toHaveTextContent("token expired");
    });
    expect(screen.getByTestId("ctx-loading")).toHaveTextContent("false");
    expect(screen.getByTestId("ctx-user")).toHaveTextContent("none");
  });

  it("UT-CONSOLE-KC-005: auth context exposes the authProvider instance", () => {
    render(
      <KubernautChat
        authProvider={makeMockAuthProvider()}
        config={makeMockConfig()}
      />,
    );
    expect(screen.getByTestId("ctx-has-provider")).toHaveTextContent("yes");
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

    expect(screen.getByTestId("ctx-loading")).toHaveTextContent("true");
    expect(screen.getByTestId("ctx-user")).toHaveTextContent("none");
  });

  it("UT-CONSOLE-KC-007: config context propagates custom fetchFn", () => {
    const customFetch = vi.fn().mockResolvedValue(new Response("ok"));

    render(
      <KubernautChat
        authProvider={makeMockAuthProvider()}
        config={makeMockConfig({ fetchFn: customFetch })}
      />,
    );

    expect(screen.getByTestId("ctx-has-fetch")).toHaveTextContent("yes");
  });

  it("UT-CONSOLE-KC-008: config context has no fetchFn when not provided", () => {
    render(
      <KubernautChat
        authProvider={makeMockAuthProvider()}
        config={makeMockConfig()}
      />,
    );

    expect(screen.getByTestId("ctx-has-fetch")).toHaveTextContent("no");
  });
});
