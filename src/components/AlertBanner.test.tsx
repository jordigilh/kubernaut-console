import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { AlertBanner } from "./AlertBanner";
import type { AlertInfo } from "../hooks/useAlerts";

// IR-5: Incident Monitoring — Alert Visibility
// Proves that active incidents are displayed with appropriate severity indicators,
// scoping information (namespace), and WCAG-accessible role attributes for
// operator awareness per IR-4/IR-5.

describe("IR-5: Alert banner communicates incident state to operator", () => {
  it("IT-CONSOLE-ALERT-001: IR-4 — critical alert renders with severity and namespace scope", () => {
    const alerts: AlertInfo[] = [{
      severity: "critical",
      summary: "Pods crash-looping",
      namespace: "payments",
      active: true,
    }];
    render(<AlertBanner alerts={alerts} />);

    const banner = screen.getByRole("alert");
    expect(banner).toBeInTheDocument();
    expect(banner).toHaveTextContent("Pods crash-looping");
    expect(banner).toHaveTextContent("in namespace payments");
    expect(banner).toHaveTextContent("critical");
  });

  it("IT-CONSOLE-ALERT-002: IR-5 — warning severity is distinguishable from critical", () => {
    const alerts: AlertInfo[] = [{
      severity: "warning",
      summary: "High memory usage",
      active: true,
    }];
    render(<AlertBanner alerts={alerts} />);

    expect(screen.getByRole("alert")).toHaveTextContent("High memory usage");
    expect(screen.getByRole("alert")).toHaveTextContent("warning");
  });

  it("IT-CONSOLE-ALERT-003: SI-4 — no false alarm when no incidents active", () => {
    const { container } = render(<AlertBanner alerts={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("IT-CONSOLE-ALERT-004: SI-4 — resolved incidents are suppressed from operator view", () => {
    const alerts: AlertInfo[] = [{
      severity: "critical",
      summary: "Old alert",
      active: false,
    }];
    const { container } = render(<AlertBanner alerts={alerts} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("IT-CONSOLE-ALERT-005: IR-4 — multiple alerts display selection prompt", () => {
    const alerts: AlertInfo[] = [
      { severity: "critical", summary: "Pod crash", namespace: "prod", active: true },
      { severity: "warning", summary: "High CPU", namespace: "staging", active: true },
    ];
    render(<AlertBanner alerts={alerts} />);

    const banners = screen.getAllByRole("alert");
    expect(banners).toHaveLength(2);
    expect(screen.getByText(/2 active alerts/)).toBeInTheDocument();
  });

  it("IT-CONSOLE-ALERT-006: IR-4 — clicking alert triggers onSelect callback", () => {
    const onSelect = vi.fn();
    const alerts: AlertInfo[] = [
      { severity: "critical", summary: "Pod crash", namespace: "prod", active: true },
    ];
    render(<AlertBanner alerts={alerts} onSelect={onSelect} />);

    fireEvent.click(screen.getByRole("alert"));
    expect(onSelect).toHaveBeenCalledWith(alerts[0]);
  });
});
