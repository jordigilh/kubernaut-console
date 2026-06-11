import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { WorkflowCards } from "./WorkflowCards";
import type { WorkflowOption } from "../hooks/useChat";

const options: WorkflowOption[] = [
  {
    workflowId: "git-revert-v2",
    name: "git-revert-v2",
    description: "Reverts the most recent commit in a GitOps-managed repository.",
    risk: "low",
    recommended: true,
    parameters: {
      TARGET_RESOURCE_NAMESPACE: "demo-webui",
      TARGET_RESOURCE_KIND: "v1/ConfigMap",
      TARGET_RESOURCE_NAME: "app-config",
    },
  },
  {
    workflowId: "patch-configuration-v1",
    name: "patch-configuration-v1",
    description: "Patches ConfigMap directly in the cluster.",
    risk: "high",
    recommended: false,
    ruledOutReason: "selfHeal:true will revert in-cluster patches",
  },
];

describe("WorkflowCards", () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it("UT-CONSOLE-WF-001: renders recommended card in expanded state with description", () => {
    render(<WorkflowCards options={options} />);
    expect(screen.getByText("git-revert-v2")).toBeInTheDocument();
    expect(screen.getByText(/Reverts the most recent commit/)).toBeInTheDocument();
  });

  it("UT-CONSOLE-WF-002: renders 'Recommended' badge on recommended card", () => {
    render(<WorkflowCards options={options} />);
    expect(screen.getByText("Recommended")).toBeInTheDocument();
  });

  it("UT-CONSOLE-WF-003: renders parameters for recommended card", () => {
    render(<WorkflowCards options={options} />);
    expect(screen.getByText(/TARGET_RESOURCE_NAMESPACE=demo-webui/)).toBeInTheDocument();
    expect(screen.getByText(/TARGET_RESOURCE_NAME=app-config/)).toBeInTheDocument();
  });

  it("UT-CONSOLE-WF-004: renders ruled-out card in collapsed state with reason", () => {
    render(<WorkflowCards options={options} />);
    expect(screen.getByText("patch-configuration-v1")).toBeInTheDocument();
    expect(screen.getByText("Ruled out")).toBeInTheDocument();
    expect(screen.getByText(/selfHeal:true will revert/)).toBeInTheDocument();
  });

  it("UT-CONSOLE-WF-005: ruled-out card has reduced opacity", () => {
    render(<WorkflowCards options={options} />);
    const card = screen.getByTestId("workflow-card-patch-configuration-v1");
    expect(card.className).toContain("opacity-50");
  });

  it("UT-CONSOLE-WF-006: shows countdown button with 'Executing in' text", () => {
    render(<WorkflowCards options={options} />);
    expect(screen.getByText(/Executing in \d+s/)).toBeInTheDocument();
  });

  it("UT-CONSOLE-WF-007: shows cancel button alongside countdown", () => {
    render(<WorkflowCards options={options} />);
    expect(screen.getByRole("button", { name: /cancel/i })).toBeInTheDocument();
  });

  it("UT-CONSOLE-WF-008: countdown decrements over time", () => {
    render(<WorkflowCards options={options} />);
    expect(screen.getByText("Executing in 10s...")).toBeInTheDocument();
    act(() => { vi.advanceTimersByTime(3000); });
    expect(screen.getByText("Executing in 7s...")).toBeInTheDocument();
  });

  // SC-5: Denial of Service Protection — auto-execute countdown ensures operator awareness before action
  it("UT-CONSOLE-WF-009: calls onExecute when countdown reaches 0", () => {
    const onExecute = vi.fn();
    render(<WorkflowCards options={options} onExecute={onExecute} />);
    act(() => { vi.advanceTimersByTime(10000); });
    expect(onExecute).toHaveBeenCalledWith("git-revert-v2");
  });

  // SC-5: Denial of Service Protection — cancel provides execution guard against unintended remediation
  it("UT-CONSOLE-WF-010: cancel button stops countdown and calls onCancel", () => {
    const onCancel = vi.fn();
    render(<WorkflowCards options={options} onCancel={onCancel} />);
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(onCancel).toHaveBeenCalled();
    expect(screen.queryByText(/Executing in/)).not.toBeInTheDocument();
  });

  it("UT-CONSOLE-WF-011: renders green checkmark on recommended card", () => {
    render(<WorkflowCards options={options} />);
    expect(screen.getByTestId("checkmark-icon")).toBeInTheDocument();
  });

  it("UT-CONSOLE-WF-012: renders red minus icon on ruled-out card", () => {
    render(<WorkflowCards options={options} />);
    expect(screen.getByTestId("ruled-out-icon")).toBeInTheDocument();
  });
});
