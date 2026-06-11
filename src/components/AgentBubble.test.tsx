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

  // AU-12: Content of Audit Records — presentation ordering ensures complete context before decision
  it("UT-CONSOLE-BUBBLE-006: renders components in correct order: thinking > RCA > CTA > workflows", () => {
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
    const thinkingIdx = testIds.indexOf("thinking-body");
    const rcaIdx = testIds.indexOf("severity-accent");
    const ctaIdx = testIds.indexOf("agent-cta");
    expect(thinkingIdx).toBeLessThan(rcaIdx);
    expect(rcaIdx).toBeLessThan(ctaIdx);
  });
});
