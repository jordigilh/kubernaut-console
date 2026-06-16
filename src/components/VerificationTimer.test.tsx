import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { VerificationTimer } from "./VerificationTimer";
import type { VerificationStep } from "../hooks/useChat";

describe("VerificationTimer", () => {
  it("UT-CONSOLE-VERIFY-001: renders with data-testid", () => {
    render(<VerificationTimer stabilizationWindow={120} />);
    expect(screen.getByTestId("verification-timer")).toBeInTheDocument();
  });

  it("UT-CONSOLE-VERIFY-002: displays initial countdown text", () => {
    render(<VerificationTimer stabilizationWindow={120} />);
    expect(screen.getByText("2m 0s remaining")).toBeInTheDocument();
  });

  it("UT-CONSOLE-VERIFY-003: progress bar has role=progressbar with aria attributes", () => {
    render(<VerificationTimer stabilizationWindow={60} />);
    const bar = screen.getByRole("progressbar");
    expect(bar).toHaveAttribute("aria-valuemin", "0");
    expect(bar).toHaveAttribute("aria-valuemax", "100");
    expect(bar).toHaveAttribute("aria-valuenow");
    expect(bar).toHaveAttribute("aria-label");
  });

  it("UT-CONSOLE-VERIFY-004: shows 'Verifying stability' label", () => {
    render(<VerificationTimer stabilizationWindow={30} />);
    expect(screen.getByText("Verifying stability")).toBeInTheDocument();
  });

  it("UT-CONSOLE-VERIFY-005: renders verification steps activity log", () => {
    const steps: VerificationStep[] = [
      { step: "stabilization_elapsed", status: "completed", elapsedSeconds: 60, updatedAt: Date.now() },
      { step: "alert_check", status: "in_progress", detail: "Waiting for KubePodCrashLooping to clear", retryCount: 2, elapsedSeconds: 75, updatedAt: Date.now() },
    ];
    render(<VerificationTimer stabilizationWindow={120} steps={steps} />);

    expect(screen.getByTestId("verification-steps")).toBeInTheDocument();
    expect(screen.getByText("Stabilization window")).toBeInTheDocument();
    expect(screen.getByText("Alert decay check")).toBeInTheDocument();
    expect(screen.getByText("Waiting for KubePodCrashLooping to clear")).toBeInTheDocument();
    expect(screen.getByText("(retry 2)")).toBeInTheDocument();
  });

  it("UT-CONSOLE-VERIFY-006: does not render steps section when steps array is empty", () => {
    render(<VerificationTimer stabilizationWindow={120} steps={[]} />);
    expect(screen.queryByTestId("verification-steps")).not.toBeInTheDocument();
  });

  it("UT-CONSOLE-VERIFY-007: renders completed step with green styling", () => {
    const steps: VerificationStep[] = [
      { step: "health_check", status: "completed", elapsedSeconds: 90, updatedAt: Date.now() },
    ];
    render(<VerificationTimer stabilizationWindow={120} steps={steps} />);
    expect(screen.getByText("Health assessment")).toHaveClass("text-kubernaut-green-700");
  });

  it("UT-CONSOLE-VERIFY-008: renders failed step with red styling", () => {
    const steps: VerificationStep[] = [
      { step: "alert_check", status: "failed", detail: "Alert did not clear within window", elapsedSeconds: 120, updatedAt: Date.now() },
    ];
    render(<VerificationTimer stabilizationWindow={120} steps={steps} />);
    expect(screen.getByText("Alert decay check")).toHaveClass("text-kubernaut-red-600");
  });

  it("UT-CONSOLE-VERIFY-009: displays elapsed time for each step", () => {
    const steps: VerificationStep[] = [
      { step: "stabilization_elapsed", status: "completed", elapsedSeconds: 45, updatedAt: Date.now() },
    ];
    render(<VerificationTimer stabilizationWindow={120} steps={steps} />);
    expect(screen.getByText("+45s")).toBeInTheDocument();
  });
});
