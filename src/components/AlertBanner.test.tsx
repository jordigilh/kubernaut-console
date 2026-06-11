import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { AlertBanner } from "./AlertBanner";
import type { AlertInfo } from "../hooks/useAlerts";

// IR-5: Incident Monitoring — Alert Visibility
// Proves that active incidents are displayed with appropriate severity indicators,
// scoping information (namespace), and WCAG-accessible role attributes for
// operator awareness per IR-4/IR-5.

describe("IR-5: Alert banner communicates incident state to operator", () => {
  it("IT-CONSOLE-ALERT-001: IR-4 — critical alert renders with severity and namespace scope", () => {
    const alert: AlertInfo = {
      severity: "critical",
      summary: "Pods crash-looping",
      namespace: "payments",
      active: true,
    };
    render(<AlertBanner alert={alert} />);

    const banner = screen.getByRole("alert");
    expect(banner).toBeInTheDocument();
    expect(banner).toHaveTextContent("Pods crash-looping");
    expect(banner).toHaveTextContent("in namespace payments");
    expect(banner).toHaveTextContent("critical");
  });

  it("IT-CONSOLE-ALERT-002: IR-5 — warning severity is distinguishable from critical", () => {
    const alert: AlertInfo = {
      severity: "warning",
      summary: "High memory usage",
      active: true,
    };
    render(<AlertBanner alert={alert} />);

    expect(screen.getByRole("alert")).toHaveTextContent("High memory usage");
    expect(screen.getByRole("alert")).toHaveTextContent("warning");
  });

  it("IT-CONSOLE-ALERT-003: SI-4 — no false alarm when no incidents active", () => {
    const { container } = render(<AlertBanner alert={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("IT-CONSOLE-ALERT-004: SI-4 — resolved incidents are suppressed from operator view", () => {
    const alert: AlertInfo = {
      severity: "critical",
      summary: "Old alert",
      active: false,
    };
    const { container } = render(<AlertBanner alert={alert} />);
    expect(container).toBeEmptyDOMElement();
  });
});
