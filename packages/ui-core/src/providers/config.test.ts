import { describe, it, expect, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import React from "react";
import { ConfigContext, useConfig, type KubernautConfig } from "./config";

function makeMockConfig(overrides?: Partial<KubernautConfig>): KubernautConfig {
  return {
    backendUrl: "https://kubernaut.example.com",
    ...overrides,
  };
}

describe("ConfigContext / useConfig", () => {
  it("UT-CONSOLE-CFG-001: ConfigContext defaults to null (no provider)", () => {
    const { result } = renderHook(() => React.useContext(ConfigContext));
    expect(result.current).toBeNull();
  });

  it("UT-CONSOLE-CFG-002: useConfig throws when called outside a provider", () => {
    expect(() => {
      renderHook(() => useConfig());
    }).toThrow("useConfig must be used within a KubernautChat provider");
  });

  it("UT-CONSOLE-CFG-003: useConfig returns backendUrl from the provider", () => {
    const config = makeMockConfig();
    const wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(ConfigContext.Provider, { value: config }, children);

    const { result } = renderHook(() => useConfig(), { wrapper });

    expect(result.current.backendUrl).toBe("https://kubernaut.example.com");
  });

  it("UT-CONSOLE-CFG-004: useConfig propagates a different backendUrl", () => {
    const config = makeMockConfig({ backendUrl: "http://localhost:8080" });
    const wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(ConfigContext.Provider, { value: config }, children);

    const { result } = renderHook(() => useConfig(), { wrapper });

    expect(result.current.backendUrl).toBe("http://localhost:8080");
  });

  it("UT-CONSOLE-CFG-005: useConfig exposes optional fetchFn override", () => {
    const customFetch = vi.fn().mockResolvedValue(new Response("ok"));
    const config = makeMockConfig({ fetchFn: customFetch });
    const wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(ConfigContext.Provider, { value: config }, children);

    const { result } = renderHook(() => useConfig(), { wrapper });

    expect(result.current.fetchFn).toBe(customFetch);
  });

  it("UT-CONSOLE-CFG-006: fetchFn is undefined when not provided", () => {
    const config = makeMockConfig();
    const wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(ConfigContext.Provider, { value: config }, children);

    const { result } = renderHook(() => useConfig(), { wrapper });

    expect(result.current.fetchFn).toBeUndefined();
  });

  it("UT-CONSOLE-CFG-007: custom fetchFn is callable with expected signature", async () => {
    const customFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true })));
    const config = makeMockConfig({ fetchFn: customFetch });
    const wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(ConfigContext.Provider, { value: config }, children);

    const { result } = renderHook(() => useConfig(), { wrapper });

    await result.current.fetchFn!("/api/test", { method: "GET" });
    expect(customFetch).toHaveBeenCalledWith("/api/test", { method: "GET" });
  });
});
