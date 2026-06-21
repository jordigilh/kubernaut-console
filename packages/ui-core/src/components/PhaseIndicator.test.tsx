import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { PhaseIndicator } from "./PhaseIndicator";

describe("PhaseIndicator", () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it("UT-PHASE-001: renders null when no phase is set", () => {
    const { container } = render(<PhaseIndicator />);
    expect(container.firstChild).toBeNull();
  });

  it("UT-PHASE-002: renders indicator with correct label for investigation", () => {
    render(<PhaseIndicator phase="investigation" />);
    expect(screen.getByTestId("phase-indicator")).toHaveTextContent("Investigating");
  });

  it("UT-PHASE-003: renders indicator with correct label for remediation", () => {
    render(<PhaseIndicator phase="remediation" />);
    expect(screen.getByTestId("phase-indicator")).toHaveTextContent("Executing");
  });

  it("UT-PHASE-004: renders indicator with correct label for verifying", () => {
    render(<PhaseIndicator phase="verifying" />);
    expect(screen.getByTestId("phase-indicator")).toHaveTextContent("Verifying");
  });

  it("UT-PHASE-005: renders indicator with correct label for complete", () => {
    render(<PhaseIndicator phase="complete" />);
    expect(screen.getByTestId("phase-indicator")).toHaveTextContent("Complete");
  });

  it("UT-PHASE-006: renders indicator with correct label for failed", () => {
    render(<PhaseIndicator phase="failed" />);
    expect(screen.getByTestId("phase-indicator")).toHaveTextContent("Failed");
  });

  it("UT-PHASE-007: red dot for failed phase", () => {
    render(<PhaseIndicator phase="failed" />);
    const dot = screen.getByTestId("phase-dot");
    expect(dot.style.background).toBe("var(--kn-red-400)");
  });

  it("UT-PHASE-008: green dot for investigation phase", () => {
    render(<PhaseIndicator phase="investigation" />);
    const dot = screen.getByTestId("phase-dot");
    expect(dot.style.background).toBe("var(--kn-green-400)");
  });

  it("UT-PHASE-009: pulse class on active phases", () => {
    render(<PhaseIndicator phase="investigation" />);
    const dot = screen.getByTestId("phase-dot");
    expect(dot.className).toContain("kn-pulse");
  });

  it("UT-PHASE-010: no pulse class on terminal phases", () => {
    render(<PhaseIndicator phase="complete" />);
    const dot = screen.getByTestId("phase-dot");
    expect(dot.className).not.toContain("kn-pulse");
  });

  it("UT-PHASE-011: timer increments when isActive is true", () => {
    render(<PhaseIndicator phase="investigation" isActive={true} />);
    expect(screen.queryByTestId("phase-substatus")).toBeNull();

    act(() => { vi.advanceTimersByTime(2000); });
    expect(screen.getByTestId("phase-substatus")).toHaveTextContent("2s");

    act(() => { vi.advanceTimersByTime(60000); });
    expect(screen.getByTestId("phase-substatus")).toHaveTextContent("1m 2s");
  });

  it("UT-PHASE-012: timer freezes when isActive is false", () => {
    const { rerender } = render(<PhaseIndicator phase="investigation" isActive={true} />);

    act(() => { vi.advanceTimersByTime(5000); });
    expect(screen.getByTestId("phase-substatus")).toHaveTextContent("5s");

    rerender(<PhaseIndicator phase="investigation" isActive={false} />);
    act(() => { vi.advanceTimersByTime(10000); });
    expect(screen.getByTestId("phase-substatus")).toHaveTextContent("5s");
  });

  it("UT-PHASE-013: timer resets when phase changes", () => {
    const { rerender } = render(<PhaseIndicator phase="investigation" isActive={true} />);

    act(() => { vi.advanceTimersByTime(5000); });
    expect(screen.getByTestId("phase-substatus")).toHaveTextContent("5s");

    rerender(<PhaseIndicator phase="remediation" isActive={true} />);
    expect(screen.queryByTestId("phase-substatus")).toBeNull();

    act(() => { vi.advanceTimersByTime(3000); });
    expect(screen.getByTestId("phase-substatus")).toHaveTextContent("3s");
  });

  it("UT-PHASE-014: no timer shown for terminal phases", () => {
    render(<PhaseIndicator phase="complete" isActive={true} />);
    act(() => { vi.advanceTimersByTime(5000); });
    expect(screen.queryByTestId("phase-substatus")).toBeNull();
  });

  it("UT-PHASE-015: shows sub-status with EA metadata during verifying", () => {
    render(
      <PhaseIndicator
        phase="verifying"
        isActive={true}
        phaseMetadata={{
          ea_phase: "Stabilizing",
          stabilization_deadline: new Date(Date.now() + 90000).toISOString(),
          started_at: new Date(Date.now()).toISOString(),
        }}
      />
    );

    act(() => { vi.advanceTimersByTime(30000); });
    expect(screen.getByTestId("phase-substatus")).toHaveTextContent("Stabilizing");
    expect(screen.getByTestId("phase-substatus")).toHaveTextContent("30s");
    expect(screen.getByTestId("phase-substatus")).toHaveTextContent("1m 30s");
  });

  it("UT-PHASE-016: has aria-live polite for accessibility", () => {
    render(<PhaseIndicator phase="investigation" />);
    const indicator = screen.getByTestId("phase-indicator");
    expect(indicator).toHaveAttribute("aria-live", "polite");
  });
});
