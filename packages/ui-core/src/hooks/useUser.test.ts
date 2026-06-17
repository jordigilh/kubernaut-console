import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useUser } from "./useUser";

describe("useUser", () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, "fetch");
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it("UT-CONSOLE-USER-001: fetches user info and computes initials", async () => {
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ preferredUsername: "Jane Doe", email: "jane@example.com" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    const { result } = renderHook(() => useUser());
    expect(result.current.isLoading).toBe(true);

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.name).toBe("Jane Doe");
    expect(result.current.initials).toBe("JD");
  });

  it("UT-CONSOLE-USER-002: handles fetch error gracefully", async () => {
    fetchSpy.mockRejectedValue(new Error("Network error"));

    const { result } = renderHook(() => useUser());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.error).toBe("Network error");
  });

  it("UT-CONSOLE-USER-003: redirects on 401 response (session expired)", async () => {
    const locationSpy = vi.spyOn(window, "location", "get").mockReturnValue({
      ...window.location,
      href: "",
    });

    const assignMock = vi.fn();
    Object.defineProperty(window, "location", {
      value: { ...window.location, href: "", set href(v: string) { assignMock(v); } },
      writable: true,
    });

    fetchSpy.mockResolvedValue(new Response(null, { status: 401 }));

    renderHook(() => useUser());
    await waitFor(() => expect(assignMock).toHaveBeenCalledWith("/oauth2/sign_in"));

    locationSpy.mockRestore();
  });

  it("UT-CONSOLE-USER-004: passes AbortSignal to fetch", async () => {
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ preferredUsername: "Admin", email: "admin@test.com" }), { status: 200 })
    );

    renderHook(() => useUser());
    await waitFor(() => expect(fetchSpy).toHaveBeenCalled());

    const callArgs = fetchSpy.mock.calls[0];
    expect(callArgs[1]?.signal).toBeInstanceOf(AbortSignal);
  });
});
