import { cleanup, render } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type KubernautChatProps = {
  authProvider: object;
};

const { mockKubernautChat } = vi.hoisted(() => ({
  mockKubernautChat: vi.fn((_props: KubernautChatProps) => null),
}));

vi.mock("@kubernaut/ui-core", () => ({
  KubernautChat: mockKubernautChat,
  ErrorBoundary: ({ children }: { children: ReactNode }) => children,
}));

async function renderAppWithToken(token: string) {
  vi.resetModules();
  vi.stubEnv("VITE_LIVE_E2E_TOKEN", token);

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

  it("UT-CONSOLE-AUTH-092-001: uses ProxyAuthProvider by default", async () => {
    const provider = await renderAppWithToken("");
    const [{ ProxyAuthProvider }, { LiveE2EAuthProvider }] = await Promise.all([
      import("./ProxyAuthProvider"),
      import("./LiveE2EAuthProvider"),
    ]);

    expect(provider).toBeInstanceOf(ProxyAuthProvider);
    expect(provider).not.toBeInstanceOf(LiveE2EAuthProvider);
  });

  it("UT-CONSOLE-AUTH-092-002: uses LiveE2EAuthProvider only when a token is set", async () => {
    const provider = await renderAppWithToken("live-e2e-token");
    const [{ LiveE2EAuthProvider }, { ProxyAuthProvider }] = await Promise.all([
      import("./LiveE2EAuthProvider"),
      import("./ProxyAuthProvider"),
    ]);

    expect(provider).toBeInstanceOf(LiveE2EAuthProvider);
    expect(provider).not.toBeInstanceOf(ProxyAuthProvider);
  });
});
