import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { VerificationTimer } from "./VerificationTimer";

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
});
