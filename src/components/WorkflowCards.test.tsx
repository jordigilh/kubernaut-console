import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { WorkflowCards } from "./WorkflowCards";
import type { WorkflowOption, AlignmentVerdict } from "../hooks/useChat";

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

  it("UT-CONSOLE-WF-004: renders ruled-out card in collapsed state with description", () => {
    render(<WorkflowCards options={options} />);
    expect(screen.getByText("patch-configuration-v1")).toBeInTheDocument();
    expect(screen.getByText("Ruled out")).toBeInTheDocument();
    expect(screen.getByText("Patches ConfigMap directly in the cluster.")).toBeInTheDocument();
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

  it("UT-CONSOLE-WF-013: SI-10 — clicking ruled-out card shows confirmation with reason", () => {
    render(<WorkflowCards options={options} onExecute={vi.fn()} />);
    const card = screen.getByTestId("workflow-card-patch-configuration-v1");
    fireEvent.click(card);
    expect(screen.getByText(/selfHeal:true will revert/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /proceed anyway/i })).toBeInTheDocument();
  });

  it("UT-CONSOLE-WF-014: SI-10 — confirming ruled-out starts countdown then executes", () => {
    vi.useFakeTimers();
    const onExecute = vi.fn();
    render(<WorkflowCards options={options} onExecute={onExecute} />);
    const card = screen.getByTestId("workflow-card-patch-configuration-v1");
    fireEvent.click(card);
    fireEvent.click(screen.getByRole("button", { name: /proceed anyway/i }));
    expect(screen.getByText(/Proceeding in 10s/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /cancel/i })).toBeInTheDocument();
    expect(onExecute).not.toHaveBeenCalled();

    // Click to execute immediately
    fireEvent.click(screen.getByRole("button", { name: /proceed now/i }));
    expect(onExecute).toHaveBeenCalledWith("patch-configuration-v1");
    vi.useRealTimers();
  });

  it("UT-CONSOLE-WF-015: SI-10 — clicking ruled-out card again dismisses confirmation", () => {
    render(<WorkflowCards options={options} onExecute={vi.fn()} />);
    const card = screen.getByTestId("workflow-card-patch-configuration-v1");
    fireEvent.click(card);
    fireEvent.click(card);
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

  // --- Escape hatch button disable after click (#13) ---

  it("UT-CONSOLE-WF-036: #13 — clicking 'No action needed' disables both escape-hatch buttons", () => {
    const onDismiss = vi.fn();
    render(<WorkflowCards options={options} onDismiss={onDismiss} onEscalate={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /no action needed/i }));
    expect(screen.getByRole("button", { name: /no action needed/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /escalate to team/i })).toBeDisabled();
  });

  it("UT-CONSOLE-WF-037: #13 — clicking 'Escalate to team' hides buttons and shows escalation input", () => {
    render(<WorkflowCards options={options} onDismiss={vi.fn()} onEscalate={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /escalate to team/i }));
    expect(screen.queryByRole("button", { name: /no action needed/i })).not.toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: /escalation reason/i })).toBeInTheDocument();
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

  // --- Alignment verdict inline findings (SI-4: security findings display) ---

  describe("SI-4: Alignment verdict inline findings", () => {
    const verdict: AlignmentVerdict = {
      result: "suspicious",
      circuit_breaker_activated: true,
      summary: "Prompt injection detected in tool output from kubectl_get ConfigMap/app-config",
      flagged: 1,
      total: 12,
      findings: [{
        step_index: 7,
        step_kind: "tool_result",
        tool: "kubectl_get",
        explanation: "ConfigMap contains encoded shell commands disguised as configuration values",
      }],
    };

    it("UT-CONSOLE-WF-024: SI-4 — renders security findings when alignmentVerdict present", () => {
      render(<WorkflowCards options={[]} alignmentVerdict={verdict} />);
      expect(screen.getByRole("group", { name: /security findings/i })).toBeInTheDocument();
    });

    it("UT-CONSOLE-WF-025: SI-4 — displays verdict summary text", () => {
      render(<WorkflowCards options={[]} alignmentVerdict={verdict} />);
      expect(screen.getByText(/Prompt injection detected/)).toBeInTheDocument();
    });

    it("UT-CONSOLE-WF-026: SI-4 — displays flagged step count", () => {
      render(<WorkflowCards options={[]} alignmentVerdict={verdict} />);
      expect(screen.getByText(/1 of 12/)).toBeInTheDocument();
    });

    it("UT-CONSOLE-WF-027: SI-4 — displays finding tool name and explanation", () => {
      render(<WorkflowCards options={[]} alignmentVerdict={verdict} />);
      expect(screen.getAllByText(/kubectl_get/).length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText(/encoded shell commands/)).toBeInTheDocument();
    });

    it("UT-CONSOLE-WF-028: SI-4 — suppresses workflow cards when alignmentVerdict present", () => {
      render(<WorkflowCards options={options} alignmentVerdict={verdict} />);
      expect(screen.queryByText("git-revert-v2")).not.toBeInTheDocument();
      expect(screen.queryByText("Recommended")).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /execute/i })).not.toBeInTheDocument();
    });

    it("UT-CONSOLE-WF-029: SI-4 — suppresses escape hatch buttons when alignmentVerdict present", () => {
      render(<WorkflowCards options={[]} alignmentVerdict={verdict} onDismiss={vi.fn()} onEscalate={vi.fn()} />);
      expect(screen.queryByRole("button", { name: /no action needed/i })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /escalate to team/i })).not.toBeInTheDocument();
    });

    it("UT-CONSOLE-WF-030: SI-4 — shows remediation blocked indicator", () => {
      render(<WorkflowCards options={[]} alignmentVerdict={verdict} />);
      expect(screen.getByText(/remediation blocked/i)).toBeInTheDocument();
    });

    it("UT-CONSOLE-WF-031: SI-4 — renders multiple findings when present", () => {
      const multiVerdict: AlignmentVerdict = {
        ...verdict,
        flagged: 2,
        findings: [
          { step_index: 3, step_kind: "tool_result", tool: "kubectl_get", explanation: "First suspicious step" },
          { step_index: 7, step_kind: "llm_reasoning", tool: "", explanation: "Second suspicious step" },
        ],
      };
      render(<WorkflowCards options={[]} alignmentVerdict={multiVerdict} />);
      expect(screen.getByText(/First suspicious step/)).toBeInTheDocument();
      expect(screen.getByText(/Second suspicious step/)).toBeInTheDocument();
    });
  });

  describe("Target Divergence (#1437)", () => {
    const divergence = {
      discoveryTarget: { apiVersion: "v1", kind: "ConfigMap", name: "worker-config", namespace: "demo-storefront" },
      signalTarget: { apiVersion: "apps/v1", kind: "Deployment", name: "worker", namespace: "demo-storefront" },
    };

    it("UT-CONSOLE-WF-032: renders target divergence explanation when no workflows and targets differ", () => {
      render(<WorkflowCards options={[]} targetDivergence={divergence} onDismiss={vi.fn()} onEscalate={vi.fn()} />);
      expect(screen.getByText("No remediation workflows found")).toBeInTheDocument();
      expect(screen.getByText(/ConfigMap\/worker-config/)).toBeInTheDocument();
      expect(screen.getByText(/Deployment\/worker/)).toBeInTheDocument();
      expect(screen.getByText(/root cause to a different resource/)).toBeInTheDocument();
    });

    it("UT-CONSOLE-WF-033: renders informative note (not warning) when workflows exist with divergence", () => {
      const opts = [{ workflowId: "wf-1", name: "Rollback", description: "desc", recommended: true }];
      render(<WorkflowCards options={opts} targetDivergence={divergence} onExecute={vi.fn()} />);
      expect(screen.queryByText("No remediation workflows found")).not.toBeInTheDocument();
      expect(screen.getByText(/Targeting root cause:/)).toBeInTheDocument();
      expect(screen.getByText(/ConfigMap\/worker-config/)).toBeInTheDocument();
      expect(screen.getByText(/differs from alert target/)).toBeInTheDocument();
    });

    it("UT-CONSOLE-WF-034: does NOT render divergence when targetDivergence is undefined", () => {
      render(<WorkflowCards options={[]} onDismiss={vi.fn()} onEscalate={vi.fn()} />);
      expect(screen.queryByText("No remediation workflows found")).not.toBeInTheDocument();
    });

    it("UT-CONSOLE-WF-035: escape hatch buttons remain visible alongside divergence", () => {
      render(<WorkflowCards options={[]} targetDivergence={divergence} onDismiss={vi.fn()} onEscalate={vi.fn()} />);
      expect(screen.getByRole("button", { name: /no action needed/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /escalate to team/i })).toBeInTheDocument();
    });
  });
});
