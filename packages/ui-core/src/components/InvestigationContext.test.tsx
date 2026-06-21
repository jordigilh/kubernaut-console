import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { InvestigationContext } from "./InvestigationContext";

// AU-2 (Audit Events) + SI-4 (Information System Monitoring):
// The investigation context bar provides real-time situational awareness
// of the active remediation — displaying the RR ID (audit correlation),
// alert name (signal identification), namespace/resource (resource scoping),
// and cluster (multi-cluster disambiguation).

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

  it("UT-CONSOLE-CTX-005: SI-4 — renders empty bar when no props", () => {
    render(<InvestigationContext />);
    const banner = screen.getByTestId("investigation-context");
    expect(banner).toBeInTheDocument();
    expect(banner).not.toHaveTextContent("Remediation ID");
  });

  it("UT-CONSOLE-CTX-006: AU-2 — renders all metadata fields together", () => {
    render(
      <InvestigationContext
        rrId="rr-9e1b7bf4140b-ed9f1796"
        alertName="KubePodCrashLooping"
        namespace="demo-crashloop"
        resource="Pod: worker-77784c6cf7-stxv4"
        cluster="prod-us-east-1"
      />
    );

    const banner = screen.getByTestId("investigation-context");
    expect(banner).toHaveTextContent("rr-9e1b7bf4140b-ed9f1796");
    expect(banner).toHaveTextContent("KubePodCrashLooping");
    expect(banner).toHaveTextContent("demo-crashloop");
    expect(banner).toHaveTextContent("Pod: worker-77784c6cf7-stxv4");
    expect(banner).toHaveTextContent("prod-us-east-1");
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
  });

  it("UT-CONSOLE-CTX-009: SI-4 — shows labeled fields for first-time user clarity", () => {
    render(
      <InvestigationContext
        rrId="rr-abc123"
        alertName="KubePodCrashLooping"
        namespace="production"
        resource="Deployment: api"
      />
    );

    const banner = screen.getByTestId("investigation-context");
    expect(banner).toHaveTextContent("Remediation ID");
    expect(banner).toHaveTextContent("Alert");
    expect(banner).toHaveTextContent("Namespace");
    expect(banner).toHaveTextContent("Resource");
  });

  it("UT-CONSOLE-CTX-010: CLS prevention — always renders as context bar", () => {
    const { rerender } = render(<InvestigationContext />);
    const bannerIdle = screen.getByTestId("investigation-context");
    expect(bannerIdle.className).toContain("kn-context-bar");

    rerender(<InvestigationContext rrId="rr-abc-123" />);
    const bannerActive = screen.getByTestId("investigation-context");
    expect(bannerActive.className).toContain("kn-context-bar");
  });

  it("UT-CONSOLE-CTX-011: CLS prevention — idle state does not show field labels", () => {
    render(<InvestigationContext />);

    const banner = screen.getByTestId("investigation-context");
    expect(banner).not.toHaveTextContent("Remediation ID");
    expect(banner).not.toHaveTextContent("Alert");
    expect(banner).not.toHaveTextContent("Status");
  });

  it("UT-CONSOLE-CTX-012: deduplicates namespace from resource field", () => {
    render(
      <InvestigationContext namespace="demo-web" resource="Pod/web-frontend in demo-web" />
    );

    const banner = screen.getByTestId("investigation-context");
    expect(banner).toHaveTextContent("Pod/web-frontend");
    expect(banner).not.toHaveTextContent("in demo-web");
  });
});
