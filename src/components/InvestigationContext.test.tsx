import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { InvestigationContext } from "./InvestigationContext";

// AU-2 (Audit Events) + SI-4 (Information System Monitoring):
// The investigation context bar provides real-time situational awareness
// of the active remediation — displaying the RR ID (audit correlation),
// alert name (signal identification), namespace/resource (resource scoping),
// cluster (multi-cluster disambiguation), and phase status. This ensures
// operators can correlate console activity with audit logs and identify the
// exact scope of automated remediation actions.

describe("AU-2/SI-4: Investigation context bar provides audit correlation and situational awareness", () => {
  it("UT-CONSOLE-CTX-001: AU-2 — renders RR ID for audit trail correlation", () => {
    render(<InvestigationContext rrId="rr-9e1b7bf4140b-ed9f1796" />);

    const banner = screen.getByTestId("investigation-context");
    expect(banner).toHaveTextContent("rr-9e1b7bf4140b-ed9f1796");
  });

  it("UT-CONSOLE-CTX-002: SI-4 — renders alert name for signal identification", () => {
    render(<InvestigationContext alertName="KubePodCrashLooping" />);

    const banner = screen.getByTestId("investigation-context");
    expect(banner).toHaveTextContent("KubePodCrashLooping");
  });

  it("UT-CONSOLE-CTX-003: SI-4 — renders namespace and resource for resource scoping", () => {
    render(
      <InvestigationContext namespace="demo-crashloop" resource="Pod: worker-77784c6cf7-stxv4" />
    );

    const banner = screen.getByTestId("investigation-context");
    expect(banner).toHaveTextContent("demo-crashloop");
    expect(banner).toHaveTextContent("Pod: worker-77784c6cf7-stxv4");
  });

  it("UT-CONSOLE-CTX-004: SI-4 — renders cluster ID for multi-cluster disambiguation", () => {
    render(<InvestigationContext cluster="prod-us-east-1" />);

    const banner = screen.getByTestId("investigation-context");
    expect(banner).toHaveTextContent("prod-us-east-1");
  });

  it("UT-CONSOLE-CTX-005: SI-4 — shows idle 'Ready' state when no investigation metadata available", () => {
    render(<InvestigationContext />);
    const banner = screen.getByTestId("investigation-context");
    expect(banner).toBeInTheDocument();
    expect(banner).toHaveTextContent("Ready");
  });

  it("UT-CONSOLE-CTX-006: AU-2 — renders all fields together for complete audit context", () => {
    render(
      <InvestigationContext
        rrId="rr-9e1b7bf4140b-ed9f1796"
        alertName="KubePodCrashLooping"
        namespace="demo-crashloop"
        resource="Pod: worker-77784c6cf7-stxv4"
        cluster="prod-us-east-1"
        phase="investigation"
      />
    );

    const banner = screen.getByTestId("investigation-context");
    expect(banner).toHaveTextContent("rr-9e1b7bf4140b-ed9f1796");
    expect(banner).toHaveTextContent("KubePodCrashLooping");
    expect(banner).toHaveTextContent("demo-crashloop");
    expect(banner).toHaveTextContent("Pod: worker-77784c6cf7-stxv4");
    expect(banner).toHaveTextContent("prod-us-east-1");
    expect(banner).toHaveTextContent("Investigating");
  });

  it("UT-CONSOLE-CTX-007: SI-4 — progressively reveals fields as they become available", () => {
    const { rerender } = render(<InvestigationContext alertName="KubePodCrashLooping" />);

    const banner = screen.getByTestId("investigation-context");
    expect(banner).toHaveTextContent("KubePodCrashLooping");
    expect(banner).not.toHaveTextContent("rr-");

    rerender(
      <InvestigationContext
        alertName="KubePodCrashLooping"
        rrId="rr-9e1b7bf4140b-ed9f1796"
      />
    );

    expect(banner).toHaveTextContent("KubePodCrashLooping");
    expect(banner).toHaveTextContent("rr-9e1b7bf4140b-ed9f1796");
  });

  it("UT-CONSOLE-CTX-008: AU-2 — displays full RR ID with click-to-copy", () => {
    render(<InvestigationContext rrId="rr-660dc089f630-5fca223e" />);

    const banner = screen.getByTestId("investigation-context");
    expect(banner).toHaveTextContent("rr-660dc089f630-5fca223e");
    const copyButton = screen.getByRole("button", { name: /Remediation ID.*click to copy/i });
    expect(copyButton).toBeInTheDocument();
  });

  it("UT-CONSOLE-CTX-009: SI-4 — displays phase status with colored indicator dot", () => {
    render(<InvestigationContext phase="remediation" />);

    const banner = screen.getByTestId("investigation-context");
    expect(banner).toHaveTextContent("Executing");
    const dot = screen.getByTestId("phase-dot");
    expect(dot.className).toContain("bg-kubernaut-teal-400");
  });

  it("UT-CONSOLE-CTX-010: SI-4 — status field shows correct label for each phase", () => {
    const { rerender } = render(<InvestigationContext phase="investigation" />);
    expect(screen.getByTestId("investigation-context")).toHaveTextContent("Investigating");

    rerender(<InvestigationContext phase="complete" />);
    expect(screen.getByTestId("investigation-context")).toHaveTextContent("Complete");

    rerender(<InvestigationContext phase="failed" />);
    expect(screen.getByTestId("investigation-context")).toHaveTextContent("Failed");
  });

  it("UT-CONSOLE-CTX-011: SI-4 — shows labeled fields for first-time user clarity", () => {
    render(
      <InvestigationContext
        rrId="rr-abc123"
        alertName="KubePodCrashLooping"
        namespace="production"
        resource="Deployment: api"
        phase="investigation"
      />
    );

    const banner = screen.getByTestId("investigation-context");
    expect(banner).toHaveTextContent("Remediation ID");
    expect(banner).toHaveTextContent("Alert");
    expect(banner).toHaveTextContent("Namespace");
    expect(banner).toHaveTextContent("Resource");
    expect(banner).toHaveTextContent("Investigating");
  });

  // --- Always-reserve layout (zero CLS) ---

  it("UT-CONSOLE-CTX-010: CLS prevention — renders idle 'Ready' state when no props are provided", () => {
    render(<InvestigationContext />);

    const banner = screen.getByTestId("investigation-context");
    expect(banner).toBeInTheDocument();
    expect(banner).toHaveTextContent("Ready");
  });

  it("UT-CONSOLE-CTX-011: CLS prevention — always renders at fixed height (h-10)", () => {
    const { rerender } = render(<InvestigationContext />);
    const bannerIdle = screen.getByTestId("investigation-context");
    expect(bannerIdle.className).toContain("h-10");

    rerender(<InvestigationContext rrId="rr-abc-123" phase="investigation" />);
    const bannerActive = screen.getByTestId("investigation-context");
    expect(bannerActive.className).toContain("h-10");
  });

  it("UT-CONSOLE-CTX-012: CLS prevention — idle state does not show field labels", () => {
    render(<InvestigationContext />);

    const banner = screen.getByTestId("investigation-context");
    expect(banner).not.toHaveTextContent("Remediation ID");
    expect(banner).not.toHaveTextContent("Alert");
    expect(banner).not.toHaveTextContent("Status");
  });
});
