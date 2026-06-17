import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { KubernautPluginPage } from "../components/KubernautPluginPage";

vi.mock("@backstage/core-plugin-api", () => ({
  useApi: (ref: { id: string }) => {
    if (ref.id === "core.identity") {
      return {
        getCredentials: vi.fn().mockResolvedValue({ token: "test-token" }),
        getBackstageIdentity: vi.fn().mockResolvedValue({
          type: "user",
          userEntityRef: "user:default/test.user",
          ownershipEntityRefs: [],
        }),
        getProfileInfo: vi.fn().mockResolvedValue({
          displayName: "Test User",
          email: "test@example.com",
        }),
        signOut: vi.fn(),
      };
    }
    if (ref.id === "core.config") {
      return {
        getOptionalString: (key: string) => {
          if (key === "kubernaut.backendUrl") return "/api/proxy/kubernaut";
          return undefined;
        },
      };
    }
    return {};
  },
  identityApiRef: { id: "core.identity" },
  configApiRef: { id: "core.config" },
  createPlugin: vi.fn(() => ({
    provide: vi.fn((ext) => ext),
  })),
  createRoutableExtension: vi.fn((opts) => opts.component),
  createRouteRef: vi.fn(() => ({ id: "kubernaut" })),
}));

vi.mock("@backstage/core-components", () => ({
  Header: ({ title, subtitle }: { title: string; subtitle?: string }) => (
    <div data-testid="backstage-header">
      <h1>{title}</h1>
      {subtitle && <p>{subtitle}</p>}
    </div>
  ),
  Content: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="backstage-content">{children}</div>
  ),
  Page: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="backstage-page">{children}</div>
  ),
}));

vi.mock("@backstage/theme", () => ({
  useTheme: () => ({ palette: { mode: "light" } }),
}));

vi.mock("@kubernaut/ui-core", () => ({
  KubernautChat: ({ authProvider, config }: { authProvider: unknown; config: unknown }) => (
    <div data-testid="kubernaut-chat" data-config={JSON.stringify(config)}>
      Kubernaut Chat Mock
    </div>
  ),
  ErrorBoundary: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

describe("KubernautPluginPage", () => {
  it("renders within Backstage page shell with header", () => {
    render(<KubernautPluginPage />);

    expect(screen.getByTestId("backstage-page")).toBeInTheDocument();
    expect(screen.getByTestId("backstage-header")).toBeInTheDocument();
    expect(screen.getByText("Kubernaut Console")).toBeInTheDocument();
    expect(screen.getByTestId("backstage-content")).toBeInTheDocument();
  });

  it("renders KubernautChat with correct config", () => {
    render(<KubernautPluginPage />);

    const chat = screen.getByTestId("kubernaut-chat");
    expect(chat).toBeInTheDocument();
    const config = JSON.parse(chat.getAttribute("data-config") || "{}");
    expect(config.backendUrl).toBe("/api/proxy/kubernaut");
  });

  it("applies kubernaut-plugin-root CSS scope class", () => {
    render(<KubernautPluginPage />);

    const root = screen.getByTestId("kubernaut-chat").parentElement;
    expect(root?.className).toContain("kubernaut-plugin-root");
  });

  it("does not apply dark theme class in light mode", () => {
    render(<KubernautPluginPage />);

    const root = screen.getByTestId("kubernaut-chat").parentElement;
    expect(root?.className).not.toContain("pf-v6-theme-dark");
  });
});
