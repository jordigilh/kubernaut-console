import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { PhaseIndicator } from "./PhaseIndicator";

describe("PhaseIndicator", () => {
  it("UT-CONSOLE-PHASE-001: renders 'Investigating' when phase is investigation", () => {
    render(<PhaseIndicator phase="investigation" />);
    expect(screen.getByText("Investigating")).toBeInTheDocument();
  });

  it("UT-CONSOLE-PHASE-002: renders 'Decision pending' when phase is decision", () => {
    render(<PhaseIndicator phase="decision" />);
    expect(screen.getByText("Decision pending")).toBeInTheDocument();
  });

  it("UT-CONSOLE-PHASE-003: renders 'Executing' when phase is remediation", () => {
    render(<PhaseIndicator phase="remediation" />);
    expect(screen.getByText("Executing")).toBeInTheDocument();
  });

  it("UT-CONSOLE-PHASE-004: renders 'Complete' when phase is complete", () => {
    render(<PhaseIndicator phase="complete" />);
    expect(screen.getByText("Complete")).toBeInTheDocument();
  });

  it("UT-CONSOLE-PHASE-005: renders nothing when phase is undefined", () => {
    const { container } = render(<PhaseIndicator phase={undefined} />);
    expect(container.firstChild).toBeNull();
  });

  it("UT-CONSOLE-PHASE-006: renders a green status dot", () => {
    render(<PhaseIndicator phase="investigation" />);
    expect(screen.getByTestId("phase-dot")).toBeInTheDocument();
  });
});
