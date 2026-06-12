import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { InvestigationContext } from "./InvestigationContext";

// AU-2 (Audit Events) + SI-4 (Information System Monitoring):
// The investigation context banner provides real-time situational awareness
// of the active remediation — displaying the RR ID (audit correlation),
// alert name (signal identification), namespace/pod (resource scoping),
// and cluster (multi-cluster disambiguation). This ensures operators
// can correlate console activity with audit logs and identify the
// exact scope of automated remediation actions.

describe("AU-2/SI-4: Investigation context banner provides audit correlation and situational awareness", () => {
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

  it("UT-CONSOLE-CTX-003: SI-4 — renders namespace and pod for resource scoping", () => {
    render(
      <InvestigationContext namespace="demo-crashloop" pod="worker-77784c6cf7-stxv4" />
    );

    const banner = screen.getByTestId("investigation-context");
    expect(banner).toHaveTextContent("demo-crashloop");
    expect(banner).toHaveTextContent("worker-77784c6cf7-stxv4");
  });

  it("UT-CONSOLE-CTX-004: SI-4 — renders cluster ID for multi-cluster disambiguation", () => {
    render(<InvestigationContext cluster="89aa52d4-7ec9-455b-bde6-275a22d37f59" />);

    const banner = screen.getByTestId("investigation-context");
    expect(banner).toHaveTextContent("89aa52d4");
  });

  it("UT-CONSOLE-CTX-005: SI-4 — hidden when no investigation metadata available", () => {
    const { container } = render(<InvestigationContext />);
    expect(container).toBeEmptyDOMElement();
  });

  it("UT-CONSOLE-CTX-006: AU-2 — renders all fields together for complete audit context", () => {
    render(
      <InvestigationContext
        rrId="rr-9e1b7bf4140b-ed9f1796"
        alertName="KubePodCrashLooping"
        namespace="demo-crashloop"
        pod="worker-77784c6cf7-stxv4"
        cluster="89aa52d4-7ec9-455b-bde6-275a22d37f59"
      />
    );

    const banner = screen.getByTestId("investigation-context");
    expect(banner).toHaveTextContent("rr-9e1b7bf4140b-ed9f1796");
    expect(banner).toHaveTextContent("KubePodCrashLooping");
    expect(banner).toHaveTextContent("demo-crashloop");
    expect(banner).toHaveTextContent("worker-77784c6cf7-stxv4");
    expect(banner).toHaveTextContent("89aa52d4");
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
});
