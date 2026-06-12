import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useAlerts } from "./useAlerts";

// SI-4: Information System Monitoring
// Proves that the alert ingestion subsystem surfaces active incidents to operators
// in real-time, supporting IR-4 (Incident Handling) and IR-5 (Incident Monitoring).

describe("SI-4/IR-4: Alert ingestion surfaces active incidents to operators", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("UT-CONSOLE-ALERTS-001: IR-4 — active alert is surfaced with severity and scope", async () => {
    vi.useRealTimers();
    const mockAlert = {
      alerts: [
        { severity: "critical", summary: "Pod crash-looping", labels: { namespace: "payments", pod: "api-7f9b" } },
      ],
    };
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockAlert,
    });

    const { result } = renderHook(() => useAlerts());

    await waitFor(() => {
      expect(result.current.length).toBeGreaterThan(0);
    });

    expect(result.current[0].severity).toBe("critical");
    expect(result.current[0].summary).toBe("Pod crash-looping");
    expect(result.current[0].namespace).toBe("payments");
    expect(result.current[0].active).toBe(true);
  });

  it("UT-CONSOLE-ALERTS-002: SI-4 — no false positives when alert list is empty", async () => {
    vi.useRealTimers();
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ alerts: [] }),
    });

    const { result } = renderHook(() => useAlerts());

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalled();
    });

    expect(result.current).toEqual([]);
  });

  it("UT-CONSOLE-ALERTS-003: SI-17 fail-safe — network failure does not crash operator console", async () => {
    vi.useRealTimers();
    global.fetch = vi.fn().mockRejectedValue(new Error("Network error"));

    const { result } = renderHook(() => useAlerts());

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalled();
    });

    expect(result.current).toEqual([]);
  });

  it("UT-CONSOLE-ALERTS-004: SI-17 fail-safe — backend 5xx does not propagate to UI", async () => {
    vi.useRealTimers();
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
    });

    const { result } = renderHook(() => useAlerts());

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalled();
    });

    expect(result.current).toEqual([]);
  });

  it("UT-CONSOLE-ALERTS-005: SI-4 — multiple active alerts returned as array", async () => {
    vi.useRealTimers();
    const mockAlerts = {
      alerts: [
        { severity: "critical", summary: "Pod crash-looping", labels: { namespace: "payments", pod: "api-7f9b" } },
        { severity: "warning", summary: "High memory", labels: { namespace: "monitoring" } },
      ],
    };
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockAlerts,
    });

    const { result } = renderHook(() => useAlerts());

    await waitFor(() => {
      expect(result.current.length).toBe(2);
    });

    expect(result.current[0].summary).toBe("Pod crash-looping");
    expect(result.current[1].summary).toBe("High memory");
    expect(result.current[1].severity).toBe("warning");
  });
});
