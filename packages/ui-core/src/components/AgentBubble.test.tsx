import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { AgentBubble } from "./AgentBubble";
import type { ChatMessage } from "../hooks/useChat";

describe("AgentBubble", () => {
  it("UT-CONSOLE-BUBBLE-001: renders ThinkingPanel when thinking entries exist", () => {
    const msg: ChatMessage = {
      id: "1", role: "agent", text: "", timestamp: Date.now(),
      thinking: [{ id: "t1", type: "preflight", text: "Analyzing..." }],
      isStreaming: true,
    };
    render(<AgentBubble message={msg} />);
    expect(screen.getByText("Analyzing...")).toBeInTheDocument();
  });

  it("UT-CONSOLE-BUBBLE-002: renders RCACard when rca data is present", () => {
    const msg: ChatMessage = {
      id: "1", role: "agent", text: "", timestamp: Date.now(),
      rca: {
        severity: "critical",
        confidence: 0.95,
        causalChain: ["Signal: crash"],
        target: "ConfigMap/test",
        toolCallsCount: 10,
        llmTurns: 8,
        summary: "Test RCA summary",
      },
    };
    render(<AgentBubble message={msg} />);
    expect(screen.getByText("Root Cause Analysis")).toBeInTheDocument();
    expect(screen.getByText("Test RCA summary")).toBeInTheDocument();
  });

  it("UT-CONSOLE-BUBBLE-003: renders AgentCTA for decision messages with text", () => {
    const msg: ChatMessage = {
      id: "1", role: "agent", text: "I recommend a Git revert.", timestamp: Date.now(),
      phase: "decision",
      workflowOptions: [{ workflowId: "wf-1", name: "test", description: "desc", recommended: true }],
    };
    render(<AgentBubble message={msg} />);
    expect(screen.getByTestId("agent-cta")).toBeInTheDocument();
    expect(screen.getByText("I recommend a Git revert.")).toBeInTheDocument();
  });

  it("UT-CONSOLE-BUBBLE-004: renders WorkflowCards when workflowOptions exist", () => {
    const msg: ChatMessage = {
      id: "1", role: "agent", text: "", timestamp: Date.now(),
      phase: "decision",
      workflowOptions: [
        { workflowId: "wf-1", name: "git-revert-v2", description: "Reverts commit", recommended: true },
      ],
    };
    render(<AgentBubble message={msg} />);
    expect(screen.getByText("git-revert-v2")).toBeInTheDocument();
  });

  it("UT-CONSOLE-BUBBLE-005: renders MarkdownContent for non-decision messages", () => {
    const msg: ChatMessage = {
      id: "1", role: "agent", text: "Regular response text", timestamp: Date.now(),
    };
    render(<AgentBubble message={msg} />);
    expect(screen.getByText("Regular response text")).toBeInTheDocument();
  });

  it("UT-CONSOLE-BUBBLE-007: renders security findings when alignmentVerdict present (rendering gate)", () => {
    const msg: ChatMessage = {
      id: "1", role: "agent", text: "", timestamp: Date.now(),
      phase: "investigation",
      thinking: [{ id: "t1", type: "tool_call", text: "kubectl_get ConfigMap/app-config" }],
      recoverySignal: "alignment_check_failed",
      alignmentVerdict: {
        result: "suspicious",
        circuit_breaker_activated: true,
        summary: "Prompt injection detected",
        flagged: 1,
        total: 12,
        findings: [{
          step_index: 7,
          step_kind: "tool_result",
          tool: "kubectl_get",
          explanation: "Encoded shell commands in ConfigMap",
        }],
      },
    };
    render(<AgentBubble message={msg} recoverySignal="alignment_check_failed" />);
    expect(screen.getByRole("group", { name: /security findings/i })).toBeInTheDocument();
    expect(screen.getByText(/Prompt injection detected/)).toBeInTheDocument();
  });

  it("UT-CONSOLE-BUBBLE-008: does NOT render security findings when alignmentVerdict absent", () => {
    const msg: ChatMessage = {
      id: "1", role: "agent", text: "", timestamp: Date.now(),
      phase: "investigation",
      thinking: [{ id: "t1", type: "tool_call", text: "kubectl_get ConfigMap/app-config" }],
      recoverySignal: "alignment_check_failed",
    };
    render(<AgentBubble message={msg} recoverySignal="alignment_check_failed" />);
    expect(screen.queryByRole("group", { name: /security findings/i })).not.toBeInTheDocument();
  });

  it("UT-CONSOLE-BUBBLE-009: renders rca.summary as plain text instead of nothing when rca exists but lacks causalChain/toolCallsCount (regression: kubernaut-console#50)", () => {
    const msg: ChatMessage = {
      id: "1", role: "agent", text: "", timestamp: Date.now(),
      rca: {
        severity: "critical",
        confidence: 0.6,
        causalChain: [],
        target: "Deployment/memory-eater",
        toolCallsCount: 0,
        llmTurns: 0,
        summary: "Severity assessed from resource metadata (investigation in progress by console-e2e-test)",
      },
    };
    render(<AgentBubble message={msg} />);
    expect(screen.getByText(/Severity assessed from resource metadata/)).toBeInTheDocument();
    // Must NOT render the full RCACard (severity-accent) -- that guard exists
    // for a good reason (no premature placeholder-only findings card) and
    // must be preserved; this is purely a "don't render nothing" fallback.
    expect(screen.queryByTestId("severity-accent")).not.toBeInTheDocument();
  });

  it("UT-CONSOLE-BUBBLE-010: falls back to message.text when rca has no summary and lacks causalChain/toolCallsCount", () => {
    const msg: ChatMessage = {
      id: "1", role: "agent", text: "An investigation is already in progress for this target.", timestamp: Date.now(),
      rca: {
        severity: "high",
        confidence: 0.5,
        causalChain: [],
        target: "Deployment/memory-eater",
        toolCallsCount: 0,
        llmTurns: 0,
        summary: "",
      },
    };
    render(<AgentBubble message={msg} />);
    expect(screen.getByText("An investigation is already in progress for this target.")).toBeInTheDocument();
    expect(screen.queryByTestId("severity-accent")).not.toBeInTheDocument();
  });

  it("UT-CONSOLE-BUBBLE-011: hides 'No action needed'/'Escalate to team' when RCA arrives before workflow discovery completes", () => {
    const msg: ChatMessage = {
      id: "1", role: "agent", text: "", timestamp: Date.now(),
      phase: "decision",
      rca: {
        severity: "critical", confidence: 0, causalChain: ["Signal: crash"],
        target: "Deployment/worker", toolCallsCount: 0, llmTurns: 0, summary: "Crash looping",
      },
      // No workflowOptions: discover_workflows still in flight.
    };
    render(<AgentBubble message={msg} onDismiss={() => {}} onEscalate={() => {}} />);
    // RCA card itself still renders early (intended).
    expect(screen.getByText("Root Cause Analysis")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /no action needed/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /escalate to team/i })).not.toBeInTheDocument();
  });

  it("UT-CONSOLE-BUBBLE-012: shows 'No action needed'/'Escalate to team' once discovery completes with zero options (no_matching_workflows)", () => {
    const msg: ChatMessage = {
      id: "1", role: "agent", text: "", timestamp: Date.now(),
      phase: "decision",
      rca: {
        severity: "critical", confidence: 0.9, causalChain: ["Signal: crash"],
        target: "Deployment/worker", toolCallsCount: 5, llmTurns: 3, summary: "Crash looping",
      },
      workflowOptions: [],
    };
    render(<AgentBubble message={msg} onDismiss={() => {}} onEscalate={() => {}} />);
    expect(screen.getByRole("button", { name: /no action needed/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /escalate to team/i })).toBeInTheDocument();
  });

  // AU-12: Content of Audit Records — presentation ordering: CTA > thinking > RCA > workflows
  it("UT-CONSOLE-BUBBLE-006: renders components in correct order: CTA > thinking > RCA > workflows", () => {
    const msg: ChatMessage = {
      id: "1", role: "agent", text: "Recommendation text", timestamp: Date.now(),
      phase: "decision",
      thinking: [{ id: "t1", type: "tool_call", text: "kubectl_get" }],
      rca: {
        severity: "critical", confidence: 0.9, causalChain: ["Signal: x"],
        target: "T", toolCallsCount: 5, llmTurns: 3, summary: "Sum",
      },
      workflowOptions: [{ workflowId: "wf-1", name: "wf-1", description: "d", recommended: true }],
    };
    const { container } = render(<AgentBubble message={msg} />);
    const elements = container.querySelectorAll("[data-testid]");
    const testIds = Array.from(elements).map(el => el.getAttribute("data-testid"));
    const ctaIdx = testIds.indexOf("agent-cta");
    const thinkingIdx = testIds.indexOf("thinking-body");
    const rcaIdx = testIds.indexOf("severity-accent");
    expect(ctaIdx).toBeLessThan(thinkingIdx);
    expect(thinkingIdx).toBeLessThan(rcaIdx);
  });
});
