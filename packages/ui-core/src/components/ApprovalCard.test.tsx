import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ApprovalCard } from "./ApprovalCard";
import type { ApprovalRequest, ApprovalResolution } from "../hooks/useChat";

const baseRequest: ApprovalRequest = {
  name: "rar-rr-gitops-drift-abc123",
  namespace: "kubernaut-system",
  remediationRequestName: "rr-gitops-drift-abc123",
  confidence: 0.72,
  confidenceLevel: "Medium",
  reason: "Production namespace requires human approval per policy",
  whyApprovalRequired: "Rego policy matched: production-ns-require-approval",
  investigationSummary: "ConfigMap modified outside GitOps pipeline",
  evidenceCollected: ["ArgoCD detected out-of-sync", "ConfigMap sha256 differs from git HEAD"],
  requiredBy: new Date(Date.now() + 3600_000).toISOString(),
};

// AC-6: Least Privilege — approval card renders structured remediation gate
describe("AC-6: ApprovalCard component", () => {
  const onApprove = vi.fn();
  const onDecline = vi.fn();

  beforeEach(() => {
    vi.useFakeTimers();
    onApprove.mockClear();
    onDecline.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("UT-CONSOLE-APPROVAL-001: renders confidence badge with level and numeric score", () => {
    render(
      <ApprovalCard request={baseRequest} onApprove={onApprove} onDecline={onDecline} userName="admin" />
    );

    expect(screen.getByText("Medium")).toBeInTheDocument();
    expect(screen.getByText("72%")).toBeInTheDocument();
  });

  it("UT-CONSOLE-APPROVAL-002: renders reason and evidence collected", () => {
    render(
      <ApprovalCard request={baseRequest} onApprove={onApprove} onDecline={onDecline} userName="admin" />
    );

    expect(screen.getByText(/Production namespace requires human approval/)).toBeInTheDocument();
    expect(screen.getByText(/ArgoCD detected out-of-sync/)).toBeInTheDocument();
    expect(screen.getByText(/ConfigMap sha256 differs from git HEAD/)).toBeInTheDocument();
  });

  it("UT-CONSOLE-APPROVAL-003: displays countdown timer from requiredBy", () => {
    render(
      <ApprovalCard request={baseRequest} onApprove={onApprove} onDecline={onDecline} userName="admin" />
    );

    expect(screen.getByTestId("approval-countdown")).toBeInTheDocument();
  });

  it("UT-CONSOLE-APPROVAL-004: calls onApprove when Approve button clicked", async () => {
    vi.useRealTimers();
    render(
      <ApprovalCard request={baseRequest} onApprove={onApprove} onDecline={onDecline} userName="admin" />
    );

    const approveBtn = screen.getByRole("button", { name: /approve/i });
    fireEvent.click(approveBtn);

    await waitFor(() => {
      expect(onApprove).toHaveBeenCalledTimes(1);
    });
  });

  it("UT-CONSOLE-APPROVAL-005: calls onDecline when Decline button clicked", async () => {
    vi.useRealTimers();
    render(
      <ApprovalCard request={baseRequest} onApprove={onApprove} onDecline={onDecline} userName="admin" />
    );

    const declineBtn = screen.getByRole("button", { name: /decline/i });
    fireEvent.click(declineBtn);

    await waitFor(() => {
      expect(onDecline).toHaveBeenCalledTimes(1);
    });
  });

  it("UT-CONSOLE-APPROVAL-006: disables buttons when resolution is provided (already decided)", () => {
    const resolution: ApprovalResolution = {
      name: "rar-rr-gitops-drift-abc123",
      decision: "Approved",
      decidedBy: "jane.doe@acme.com",
      decidedAt: "2026-06-11T15:50:00Z",
    };

    render(
      <ApprovalCard
        request={baseRequest}
        resolution={resolution}
        onApprove={onApprove}
        onDecline={onDecline}
        userName="admin"
      />
    );

    const approveBtn = screen.getByRole("button", { name: /approve/i });
    const declineBtn = screen.getByRole("button", { name: /decline/i });
    expect(approveBtn).toBeDisabled();
    expect(declineBtn).toBeDisabled();
    expect(screen.getByText(/Approved/)).toBeInTheDocument();
    expect(screen.getByText(/jane.doe@acme.com/)).toBeInTheDocument();
  });

  it("UT-CONSOLE-APPROVAL-007: shows policy evaluation when present", () => {
    const reqWithPolicy: ApprovalRequest = {
      ...baseRequest,
      policyEvaluation: {
        policyName: "production-ns-approval",
        matchedRules: ["require-human-for-prod", "confidence-below-0.9"],
        decision: "RequireApproval",
      },
    };

    render(
      <ApprovalCard request={reqWithPolicy} onApprove={onApprove} onDecline={onDecline} userName="admin" />
    );

    expect(screen.getByText(/production-ns-approval/)).toBeInTheDocument();
    expect(screen.getByText(/require-human-for-prod/)).toBeInTheDocument();
  });

  it("UT-CONSOLE-APPROVAL-008: shows expired state when requiredBy is in the past", () => {
    const expiredRequest: ApprovalRequest = {
      ...baseRequest,
      requiredBy: new Date(Date.now() - 60_000).toISOString(),
    };

    render(
      <ApprovalCard request={expiredRequest} onApprove={onApprove} onDecline={onDecline} userName="admin" />
    );

    expect(screen.getByText(/expired/i)).toBeInTheDocument();
  });

  // AU-2: Reason field renders with pre-filled username
  it("UT-CONSOLE-APPROVAL-009: renders editable reason field pre-filled with username", () => {
    render(
      <ApprovalCard request={baseRequest} onApprove={onApprove} onDecline={onDecline} userName="jane.doe" />
    );

    const reasonInput = screen.getByLabelText("Reason");
    expect(reasonInput).toHaveValue("Approved by jane.doe");
  });

  // AU-2: Edited reason is passed to onApprove callback
  it("UT-CONSOLE-APPROVAL-010: passes edited reason to onApprove callback", async () => {
    vi.useRealTimers();
    render(
      <ApprovalCard request={baseRequest} onApprove={onApprove} onDecline={onDecline} userName="admin" />
    );

    const reasonInput = screen.getByLabelText("Reason");
    fireEvent.change(reasonInput, { target: { value: "Emergency fix approved" } });

    const approveBtn = screen.getByRole("button", { name: /approve/i });
    fireEvent.click(approveBtn);

    await waitFor(() => {
      expect(onApprove).toHaveBeenCalledWith("Emergency fix approved");
    });
  });

  // AC-6: Decline passes reason to onDecline
  it("UT-CONSOLE-APPROVAL-011: passes reason to onDecline callback", async () => {
    vi.useRealTimers();
    render(
      <ApprovalCard request={baseRequest} onApprove={onApprove} onDecline={onDecline} userName="admin" />
    );

    const reasonInput = screen.getByLabelText("Reason");
    fireEvent.change(reasonInput, { target: { value: "Risk too high" } });

    const declineBtn = screen.getByRole("button", { name: /decline/i });
    fireEvent.click(declineBtn);

    await waitFor(() => {
      expect(onDecline).toHaveBeenCalledWith("Risk too high");
    });
  });
});
