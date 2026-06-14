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
