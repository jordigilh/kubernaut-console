import { describe, it, expect } from "vitest";
import { renderHook } from "@testing-library/react";
import React from "react";
import { AuthContext, useAuth, type AuthContextValue, type KubernautAuthProvider } from "./auth";

function makeMockProvider(): KubernautAuthProvider {
  return {
    getToken: async () => "mock-token",
    getUser: async () => ({ name: "Test User", email: "test@example.com", initials: "TU" }),
  };
}

function makeMockAuthValue(overrides?: Partial<AuthContextValue>): AuthContextValue {
  return {
    provider: makeMockProvider(),
    user: { name: "Test User", email: "test@example.com", initials: "TU" },
    isLoading: false,
    error: null,
    ...overrides,
  };
}

describe("AuthContext / useAuth", () => {
  it("UT-CONSOLE-AUTH-001: AuthContext defaults to null (no provider)", () => {
    const { result } = renderHook(() => React.useContext(AuthContext));
    expect(result.current).toBeNull();
  });

  it("UT-CONSOLE-AUTH-002: useAuth throws when called outside a provider", () => {
    expect(() => {
      renderHook(() => useAuth());
    }).toThrow("useAuth must be used within a KubernautChat provider");
  });

  it("UT-CONSOLE-AUTH-003: useAuth returns the context value when inside a provider", () => {
    const value = makeMockAuthValue();
    const wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(AuthContext.Provider, { value }, children);

    const { result } = renderHook(() => useAuth(), { wrapper });

    expect(result.current).toBe(value);
    expect(result.current.user?.name).toBe("Test User");
    expect(result.current.user?.email).toBe("test@example.com");
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("UT-CONSOLE-AUTH-004: useAuth exposes the auth provider for token retrieval", async () => {
    const value = makeMockAuthValue();
    const wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(AuthContext.Provider, { value }, children);

    const { result } = renderHook(() => useAuth(), { wrapper });

    const token = await result.current.provider.getToken();
    expect(token).toBe("mock-token");
  });

  it("UT-CONSOLE-AUTH-005: useAuth surfaces loading state", () => {
    const value = makeMockAuthValue({ user: null, isLoading: true });
    const wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(AuthContext.Provider, { value }, children);

    const { result } = renderHook(() => useAuth(), { wrapper });

    expect(result.current.isLoading).toBe(true);
    expect(result.current.user).toBeNull();
  });

  it("UT-CONSOLE-AUTH-006: useAuth surfaces error state", () => {
    const value = makeMockAuthValue({ user: null, isLoading: false, error: "auth failed" });
    const wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(AuthContext.Provider, { value }, children);

    const { result } = renderHook(() => useAuth(), { wrapper });

    expect(result.current.error).toBe("auth failed");
    expect(result.current.user).toBeNull();
  });
});
