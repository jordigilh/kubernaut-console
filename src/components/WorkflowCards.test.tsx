import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { WorkflowCards } from "./WorkflowCards";
import type { WorkflowOption } from "../hooks/useChat";

const options: WorkflowOption[] = [
  {
    workflowId: "wf-7af4825d-11be",
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

  it("UT-CONSOLE-WF-005: ruled-out card is clickable (not disabled)", () => {
    render(<WorkflowCards options={options} onExecute={vi.fn()} />);
    const card = screen.getByTestId("workflow-card-patch-configuration-v1");
    expect(card.className).not.toContain("opacity-50");
    expect(card).not.toHaveAttribute("aria-disabled");
  });

  it("UT-CONSOLE-WF-006: shows Execute button initially, countdown starts after click", () => {
    render(<WorkflowCards options={options} />);
    expect(screen.getByRole("button", { name: /execute/i })).toBeInTheDocument();
    expect(screen.queryByText(/Executing in/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /execute/i }));
    expect(screen.getByText(/Executing in \d+s/)).toBeInTheDocument();
  });

  it("UT-CONSOLE-WF-007: shows cancel button alongside countdown after Execute click", () => {
    render(<WorkflowCards options={options} />);
    fireEvent.click(screen.getByRole("button", { name: /execute/i }));
    expect(screen.getByRole("button", { name: /cancel/i })).toBeInTheDocument();
  });

  it("UT-CONSOLE-WF-008: countdown decrements over time", () => {
    render(<WorkflowCards options={options} />);
    fireEvent.click(screen.getByRole("button", { name: /execute/i }));
    expect(screen.getByText("Executing in 10s...")).toBeInTheDocument();
    act(() => { vi.advanceTimersByTime(3000); });
    expect(screen.getByText("Executing in 7s...")).toBeInTheDocument();
  });

  // SC-5: Denial of Service Protection — auto-execute countdown ensures operator awareness before action
  it("UT-CONSOLE-WF-009: calls onExecute when countdown reaches 0", () => {
    const onExecute = vi.fn();
    render(<WorkflowCards options={options} onExecute={onExecute} />);
    fireEvent.click(screen.getByRole("button", { name: /execute/i }));
    act(() => { vi.advanceTimersByTime(10000); });
    expect(onExecute).toHaveBeenCalledWith("wf-7af4825d-11be");
  });

  // SC-5: Denial of Service Protection — cancel provides local execution guard (stops timer only, no AF message)
  it("UT-CONSOLE-WF-010: cancel button stops countdown locally without sending to AF", () => {
    const onExecute = vi.fn();
    render(<WorkflowCards options={options} onExecute={onExecute} />);
    fireEvent.click(screen.getByRole("button", { name: /execute/i }));
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(screen.queryByText(/Executing in/)).not.toBeInTheDocument();
    act(() => { vi.advanceTimersByTime(15000); });
    expect(onExecute).not.toHaveBeenCalled();
  });

  it("UT-CONSOLE-WF-011: renders green checkmark on recommended card", () => {
    render(<WorkflowCards options={options} />);
    expect(screen.getByTestId("checkmark-icon")).toBeInTheDocument();
  });

  it("UT-CONSOLE-WF-012: renders red minus icon on ruled-out card", () => {
    render(<WorkflowCards options={options} />);
    expect(screen.getByTestId("ruled-out-icon")).toBeInTheDocument();
  });

  // --- Ruled-out selectable with confirmation (SI-10: prevents accidental execution) ---

  it("UT-CONSOLE-WF-013: SI-10 — clicking ruled-out card shows confirmation with ruledOutReason", () => {
    render(<WorkflowCards options={options} onExecute={vi.fn()} />);
    const card = screen.getByTestId("workflow-card-patch-configuration-v1");
    fireEvent.click(card);
    expect(screen.getByText(/This workflow was ruled out/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /proceed anyway/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /go back/i })).toBeInTheDocument();
  });

  it("UT-CONSOLE-WF-014: SI-10 — confirming ruled-out calls onExecute with its workflowId", () => {
    const onExecute = vi.fn();
    render(<WorkflowCards options={options} onExecute={onExecute} />);
    const card = screen.getByTestId("workflow-card-patch-configuration-v1");
    fireEvent.click(card);
    fireEvent.click(screen.getByRole("button", { name: /proceed anyway/i }));
    expect(onExecute).toHaveBeenCalledWith("patch-configuration-v1");
  });

  it("UT-CONSOLE-WF-015: SI-10 — cancelling ruled-out confirmation returns to normal state", () => {
    render(<WorkflowCards options={options} onExecute={vi.fn()} />);
    const card = screen.getByTestId("workflow-card-patch-configuration-v1");
    fireEvent.click(card);
    fireEvent.click(screen.getByRole("button", { name: /go back/i }));
    expect(screen.queryByRole("button", { name: /proceed anyway/i })).not.toBeInTheDocument();
  });

  it("UT-CONSOLE-WF-016: ruled-out cards show cursor pointer for clickability", () => {
    render(<WorkflowCards options={options} onExecute={vi.fn()} />);
    const card = screen.getByTestId("workflow-card-patch-configuration-v1");
    expect(card.className).toContain("cursor-pointer");
  });

  // --- Escape hatches (AC-6: structural LLM bypass for operator decisions) ---

  it("UT-CONSOLE-WF-017: AC-6 — renders 'No action needed' escape hatch button", () => {
    render(<WorkflowCards options={options} onDismiss={vi.fn()} />);
    expect(screen.getByRole("button", { name: /no action needed/i })).toBeInTheDocument();
  });

  it("UT-CONSOLE-WF-018: AC-6 — renders 'Escalate to team' escape hatch button", () => {
    render(<WorkflowCards options={options} onEscalate={vi.fn()} />);
    expect(screen.getByRole("button", { name: /escalate to team/i })).toBeInTheDocument();
  });

  it("UT-CONSOLE-WF-019: AC-6 — clicking 'No action needed' calls onDismiss", () => {
    const onDismiss = vi.fn();
    render(<WorkflowCards options={options} onDismiss={onDismiss} />);
    fireEvent.click(screen.getByRole("button", { name: /no action needed/i }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("UT-CONSOLE-WF-020: AC-6 — inline escalation submits reason via onEscalate", () => {
    const onEscalate = vi.fn();
    render(<WorkflowCards options={options} onEscalate={onEscalate} />);
    fireEvent.click(screen.getByRole("button", { name: /escalate to team/i }));
    expect(onEscalate).not.toHaveBeenCalled();
    const input = screen.getByRole("textbox", { name: /escalation reason/i });
    fireEvent.change(input, { target: { value: "DBA team needed" } });
    fireEvent.click(screen.getByRole("button", { name: /submit escalation/i }));
    expect(onEscalate).toHaveBeenCalledWith("DBA team needed");
  });

  // --- Reactive banner (IR-5: recovery/alignment signals surface to operator) ---

  it("UT-CONSOLE-WF-021: IR-5 — shows recovery banner when recoverySignal='problem_resolved'", () => {
    render(<WorkflowCards options={options} recoverySignal="problem_resolved" onDismiss={vi.fn()} />);
    expect(screen.getByText(/appears to have self-resolved/i)).toBeInTheDocument();
  });

  it("UT-CONSOLE-WF-022: IR-5 — shows security banner when recoverySignal='alignment_check_failed'", () => {
    render(<WorkflowCards options={options} recoverySignal="alignment_check_failed" onEscalate={vi.fn()} />);
    expect(screen.getByText(/security concern/i)).toBeInTheDocument();
  });

  it("UT-CONSOLE-WF-023: IR-5 — Dismiss button is visually emphasized when recoverySignal='problem_resolved'", () => {
    render(<WorkflowCards options={options} recoverySignal="problem_resolved" onDismiss={vi.fn()} />);
    const dismissBtn = screen.getByRole("button", { name: /no action needed/i });
    expect(dismissBtn.className).toContain("ring-2");
  });
});
