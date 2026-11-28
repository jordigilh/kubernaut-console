import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ApprovalConfidencePanel } from "./ApprovalConfidencePanel";
import type { ApprovalConfidenceBreakdown } from "../lib/approval-review";

// #180 / kubernaut #2586: RCA confidence and workflow-selection confidence
// must remain separately displayed and never borrowed or merged (BR-KA-016
// lineage). Missing RCA confidence is unknown, not 0%. FedRAMP AC-3/AU-6 and
// SOC2 CC4.1 intent: the approver's decision evidence keeps the two signals
// distinguishable; the browser computes no score.
describe("ApprovalConfidencePanel (#180)", () => {
  const highRcaHighWorkflow: ApprovalConfidenceBreakdown = {
    workflowConfidence: 0.94,
    rcaConfidence: 0.91,
    level: "High",
  };

  it("UT-CONSOLE-CONF-001: labels RCA and workflow-selection confidence separately with distinct values", () => {
    render(<ApprovalConfidencePanel breakdown={{ workflowConfidence: 0.9, rcaConfidence: 0.42, level: "High" }} />);
    const rca = screen.getByTestId("kn-approval-rca-confidence");
    const workflow = screen.getByTestId("kn-approval-workflow-confidence");
    expect(rca).toHaveTextContent("RCA confidence");
    expect(rca).toHaveTextContent("42%");
    expect(workflow).toHaveTextContent("Workflow-selection confidence");
    expect(workflow).toHaveTextContent("90%");
  });

  it("UT-CONSOLE-CONF-002: shows missing RCA confidence as unknown, distinct from an explicit 0%", () => {
    const { rerender } = render(<ApprovalConfidencePanel breakdown={{ workflowConfidence: 0.76, rcaConfidence: null, level: "Medium" }} />);
    const rca = screen.getByTestId("kn-approval-rca-confidence");
    expect(rca).toHaveTextContent("Unknown");
    expect(rca).toHaveAttribute("data-known", "false");
    expect(rca).not.toHaveTextContent("0%");

    rerender(<ApprovalConfidencePanel breakdown={{ workflowConfidence: 0.88, rcaConfidence: 0, level: "High" }} />);
    const zero = screen.getByTestId("kn-approval-rca-confidence");
    expect(zero).toHaveTextContent("0%");
    expect(zero).toHaveAttribute("data-known", "true");
    expect(zero).not.toHaveTextContent("Unknown");
  });

  it("UT-CONSOLE-CONF-003: associates the qualitative level with workflow selection, not RCA confidence", () => {
    render(<ApprovalConfidencePanel breakdown={highRcaHighWorkflow} />);
    const level = screen.getByTestId("kn-approval-confidence-level");
    expect(level).toHaveTextContent("High");
    expect(level).toHaveTextContent("qualifies workflow selection");
    expect(screen.queryByTestId("kn-approval-rca-confidence")).not.toHaveTextContent("qualifies workflow selection");
  });

  it("UT-CONSOLE-CONF-004: surfaces a partially-read missing workflow confidence as unknown without inventing a value", () => {
    render(<ApprovalConfidencePanel breakdown={highRcaHighWorkflow} workflowConfidenceMissing />);
    const workflow = screen.getByTestId("kn-approval-workflow-confidence");
    expect(workflow).toHaveTextContent("Unknown");
    expect(workflow).toHaveAttribute("data-known", "false");
    expect(screen.getByTestId("kn-approval-rca-confidence")).toHaveTextContent("91%");
  });

  it("UT-CONSOLE-CONF-005: states that interactive selection does not bypass policy evaluation", () => {
    render(<ApprovalConfidencePanel breakdown={highRcaHighWorkflow} />);
    expect(screen.getByText(/does not bypass policy evaluation/i)).toBeInTheDocument();
    expect(screen.getByText(/decided by the user-managed policy/i)).toBeInTheDocument();
  });
});
