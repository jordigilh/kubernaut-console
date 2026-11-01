import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ApprovalDecisionConfirmation } from "./ApprovalDecisionConfirmation";
import { FIXTURE_REVIEWER, type ApprovalDecisionSnapshot } from "../lib/approval-review";

const snapshot: ApprovalDecisionSnapshot = {
  requestId: "rar-demo-02",
  target: { kind: "Deployment", name: "demo-operator", namespace: "demo-operator" },
  source: { clusterId: "spoke-a", environment: "Production" },
  deadline: "2026-10-31T14:13:00Z",
  reviewer: FIXTURE_REVIEWER,
  reason: "Reviewing the recorded proposal.",
  reviewedContentVersion: "rar-demo-02/review-v1",
};

describe("ApprovalDecisionConfirmation", () => {
  it("focuses the dialog, contains Tab focus, closes on Escape, and restores the trigger", () => {
    const trigger = document.createElement("button");
    trigger.type = "button";
    trigger.textContent = "Approve";
    document.body.append(trigger);
    trigger.focus();

    const onCancel = vi.fn();
    const { unmount } = render(
      <ApprovalDecisionConfirmation
        decision="Approved"
        snapshot={snapshot}
        isSubmitting={false}
        onCancel={onCancel}
        onConfirm={vi.fn()}
      />,
    );

    const cancel = screen.getByRole("button", { name: "Cancel" });
    const confirm = screen.getByRole("button", { name: "Confirm Approved" });
    expect(cancel).toHaveFocus();

    fireEvent.keyDown(document, { key: "Tab" });
    expect(confirm).toHaveFocus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(cancel).toHaveFocus();
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(confirm).toHaveFocus();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onCancel).toHaveBeenCalledOnce();
    unmount();
    expect(trigger).toHaveFocus();
    trigger.remove();
  });

  it("does not dismiss while a fixture decision is submitting", () => {
    const onCancel = vi.fn();
    render(
      <ApprovalDecisionConfirmation
        decision="Rejected"
        snapshot={snapshot}
        isSubmitting
        onCancel={onCancel}
        onConfirm={vi.fn()}
      />,
    );

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onCancel).not.toHaveBeenCalled();
  });
});
