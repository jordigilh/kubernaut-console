import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearConsoleSessionState } from "../../ui-core/src/lib/session-state";

type KubernautChatProps = {
  authProvider: object;
};

const { mockKubernautChat } = vi.hoisted(() => ({
  mockKubernautChat: vi.fn((_props: KubernautChatProps) => null),
}));

vi.mock("@kubernaut/ui-core", () => ({
  KubernautChat: mockKubernautChat,
  ErrorBoundary: ({ children }: { children: ReactNode }) => children,
  clearConsoleSessionState,
}));

async function renderApp(legacyBrowserToken = "") {
  vi.resetModules();
  vi.stubEnv("VITE_LIVE_E2E_TOKEN", legacyBrowserToken);
  vi.stubEnv("VITE_MOCK_A2A", "false");

  const { default: App } = await import("./App.tsx");
  render(<App />);

  const props = mockKubernautChat.mock.calls.at(-1)?.[0] as
    | KubernautChatProps
    | undefined;
  expect(props).toBeDefined();
  return props!.authProvider;
}

describe("App auth-provider selection", () => {
  beforeEach(() => {
    mockKubernautChat.mockClear();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("UT-CONSOLE-AUTH-092-001: always uses the host-owned ProxyAuthProvider", async () => {
    const provider = await renderApp();
    const { ProxyAuthProvider } = await import("./ProxyAuthProvider");

    expect(provider).toBeInstanceOf(ProxyAuthProvider);
  });

  it("IT-CONSOLE-168-003: discards unbound reload state before chat mounts without logging out", async () => {
    sessionStorage.setItem("kubernaut-console-messages", "private old messages");
    sessionStorage.setItem("kubernaut-console-context", "old-context");
    sessionStorage.setItem("kubernaut-pending-context", "old-draft");
    sessionStorage.setItem("kubernaut-console-phase", "decision");
    document.cookie = "unrelated_login_marker=preserved; path=/";
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    mockKubernautChat.mockImplementation(() => {
      expect(sessionStorage.getItem("kubernaut-console-messages")).toBeNull();
      expect(sessionStorage.getItem("kubernaut-console-context")).not.toBe("old-context");
      expect(sessionStorage.getItem("kubernaut-pending-context")).toBeNull();
      expect(sessionStorage.getItem("kubernaut-console-phase")).toBeNull();
      return null;
    });
    await renderApp();
    expect(document.cookie).toContain("unrelated_login_marker=preserved");
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
    mockKubernautChat.mockImplementation(() => null);
  });

  it("IT-CONSOLE-168-004: blocks chat on storage failure and allows local retry without logout", async () => {
    sessionStorage.setItem("kubernaut-console-messages", "private previous session");
    const remove = vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => { throw new Error("storage unavailable"); });
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    try {
      vi.resetModules();
      const { default: App } = await import("./App.tsx");
      render(<App />);
      expect(screen.getByRole("alert")).toHaveTextContent(/storage/i);
      expect(mockKubernautChat).not.toHaveBeenCalled();
      remove.mockRestore();
      fireEvent.click(screen.getByRole("button", { name: /retry/i }));
      expect(mockKubernautChat).toHaveBeenCalled();
      expect(sessionStorage.getItem("kubernaut-console-messages")).toBeNull();
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      remove.mockRestore();
      fetchSpy.mockRestore();
    }
  });

  it("UT-CONSOLE-AUTH-092-002: ignores the legacy browser-token environment variable", async () => {
    const provider = await renderApp("legacy-token-must-not-reach-the-browser");
    const { ProxyAuthProvider } = await import("./ProxyAuthProvider");

    expect(provider).toBeInstanceOf(ProxyAuthProvider);
  });
});
