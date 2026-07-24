import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ThinkingPanel } from "./ThinkingPanel";
import type { ThinkingEntry } from "../hooks/useChat";

const entries: ThinkingEntry[] = [
  { id: "t1", type: "preflight", text: "Analyzing..." },
  { id: "t2", type: "preflight", text: "Checking for existing active remediation..." },
  { id: "t3", type: "tool_call", text: "kubectl_previous_logs Pod/web-frontend" },
  { id: "t4", type: "reasoning", text: "Container failing due to invalid config." },
  { id: "t5", type: "status", text: "Investigation complete." },
];

describe("ThinkingPanel", () => {
  // AU-2: Audit Events / IR-4: Incident Handling — investigation visibility ensures operator awareness
  it("UT-CONSOLE-THINK-001: renders 'Thinking' label when active", () => {
    render(<ThinkingPanel entries={entries} isActive={true} startTime={Date.now() - 5000} />);
    expect(screen.getByText(/Thinking/)).toBeInTheDocument();
  });

  it("UT-CONSOLE-THINK-002: shows elapsed time when startTime is provided", () => {
    const fiveMinAgo = Date.now() - 151000;
    render(<ThinkingPanel entries={entries} isActive={true} startTime={fiveMinAgo} />);
    expect(screen.getByTestId("elapsed-time")).toBeInTheDocument();
  });

  // AU-2: Audit Events / IR-4: Incident Handling — preflight steps visible to operator for audit trail
  it("UT-CONSOLE-THINK-003: renders preflight entries as markdown", () => {
    render(<ThinkingPanel entries={entries} isActive={false} startTime={Date.now()} />);
    expect(screen.getByText("Analyzing...")).toBeInTheDocument();
  });

  // AU-2: Audit Events / IR-4: Incident Handling — tool calls visible to operator for forensic reconstruction
  it("UT-CONSOLE-THINK-004: renders tool_call entries in code element", () => {
    render(<ThinkingPanel entries={entries} isActive={false} startTime={Date.now()} />);
    const el = screen.getByText("kubectl_previous_logs Pod/web-frontend");
    expect(el).toBeInTheDocument();
    expect(el.tagName.toLowerCase()).toBe("code");
  });

  it("UT-CONSOLE-THINK-005: renders reasoning entries as markdown", () => {
    render(<ThinkingPanel entries={entries} isActive={false} startTime={Date.now()} />);
    expect(screen.getByText("Container failing due to invalid config.")).toBeInTheDocument();
  });

  it("UT-CONSOLE-THINK-006: renders status entries with normal styling", () => {
    render(<ThinkingPanel entries={entries} isActive={false} startTime={Date.now()} />);
    expect(screen.getByText("Investigation complete.")).toBeInTheDocument();
  });

  it("UT-CONSOLE-THINK-007: panel body is visible by default (not collapsed)", () => {
    render(<ThinkingPanel entries={entries} isActive={true} startTime={Date.now()} />);
    expect(screen.getByTestId("thinking-body")).toBeInTheDocument();
  });

  it("UT-CONSOLE-THINK-008: collapses and expands on toggle click", () => {
    render(<ThinkingPanel entries={entries} isActive={false} startTime={Date.now()} />);
    const toggle = screen.getByRole("button");
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
  });

  it("UT-CONSOLE-THINK-009: shows step count when not active", () => {
    render(<ThinkingPanel entries={entries} isActive={false} startTime={Date.now()} />);
    expect(screen.getByText(/5 steps/)).toBeInTheDocument();
  });

  it("UT-CONSOLE-THINK-010: renders custom label when provided", () => {
    render(<ThinkingPanel entries={entries} isActive={true} startTime={Date.now()} label="Discovering workflows" />);
    expect(screen.getByText(/Discovering workflows/)).toBeInTheDocument();
  });

  it("UT-CONSOLE-THINK-011: defaults to 'Thinking' when no label provided", () => {
    render(<ThinkingPanel entries={entries} isActive={true} startTime={Date.now()} />);
    expect(screen.getByText(/Thinking/)).toBeInTheDocument();
  });

  it("UT-CONSOLE-THINK-012: toggle button has aria-expanded reflecting open state by default", () => {
    render(<ThinkingPanel entries={entries} isActive={false} startTime={Date.now()} />);
    const toggle = screen.getByRole("button");
    expect(toggle).toHaveAttribute("aria-expanded", "true");
  });

  it("UT-CONSOLE-THINK-013: aria-expanded toggles to false when panel is collapsed", async () => {
    render(<ThinkingPanel entries={entries} isActive={false} startTime={Date.now()} />);
    const toggle = screen.getByRole("button");
    await fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
  });

  // AU-2/AU-3: Audit Events / Content of Audit Records — BR-AI-086 / #1634,
  // #1635: genuine captured LLM reasoning must be visually distinguishable
  // from orchestration narration ("reasoning" type) so operators can
  // correctly attribute evidentiary weight during incident review. IR-4:
  // Incident Handling — misreading narration as the model's actual
  // deliberation (or vice versa) would compromise root-cause analysis.
  describe("AU-2/AU-3, IR-4: reasoning_content visual differentiation from orchestration narration (BR-AI-086, #1634/#1635)", () => {
    const entriesWithReasoningContent: ThinkingEntry[] = [
      { id: "t1", type: "reasoning", text: "Checking pod status..." },
      { id: "t2", type: "reasoning_content", text: "Memory usage climbed steadily before the OOMKill, consistent with a slow leak." },
    ];

    it("UT-CONSOLE-THINK-014: renders reasoning_content entries with a distinct 'Reasoning' label", () => {
      render(<ThinkingPanel entries={entriesWithReasoningContent} isActive={false} startTime={Date.now()} />);
      expect(screen.getByText("Memory usage climbed steadily before the OOMKill, consistent with a slow leak.")).toBeInTheDocument();
      expect(screen.getByText("Reasoning")).toBeInTheDocument();
    });

    it("UT-CONSOLE-THINK-015: does not render the 'Reasoning' label for plain orchestration narration", () => {
      const onlyNarration: ThinkingEntry[] = [{ id: "t1", type: "reasoning", text: "Checking pod status..." }];
      render(<ThinkingPanel entries={onlyNarration} isActive={false} startTime={Date.now()} />);
      expect(screen.getByText("Checking pod status...")).toBeInTheDocument();
      expect(screen.queryByText("Reasoning")).not.toBeInTheDocument();
    });

    it("UT-CONSOLE-THINK-016: applies the kn-reasoning-content class to distinguish styling from narration", () => {
      render(<ThinkingPanel entries={entriesWithReasoningContent} isActive={false} startTime={Date.now()} />);
      const reasoningContentText = screen.getByText("Memory usage climbed steadily before the OOMKill, consistent with a slow leak.");
      expect(reasoningContentText.closest(".kn-reasoning-content")).not.toBeNull();
    });
  });

  // AU-3, IR-4, SI-10: redaction-aware placeholder (kubernaut-console#32,
  // upstream kubernaut#1716) — a boolean-only "reasoning occurred, provider
  // withheld it" signal renders as an explicit placeholder rather than a
  // silent gap that would read as a bug.
  describe("AU-3, IR-4, SI-10: redaction-aware placeholder for withheld reasoning (#32, upstream #1716)", () => {
    it("UT-CONSOLE-THINK-017: renders the 'Reasoning hidden by provider' placeholder for a redacted entry", () => {
      const redactedEntries: ThinkingEntry[] = [
        { id: "t1", type: "reasoning_content", text: "", redacted: true },
      ];
      render(<ThinkingPanel entries={redactedEntries} isActive={false} startTime={Date.now()} />);
      expect(screen.getByText("Reasoning hidden by provider")).toBeInTheDocument();
    });

    it("UT-CONSOLE-THINK-018: does not render the placeholder for a normal (non-redacted) reasoning_content entry", () => {
      const normalEntries: ThinkingEntry[] = [
        { id: "t1", type: "reasoning_content", text: "Memory usage climbed steadily." },
      ];
      render(<ThinkingPanel entries={normalEntries} isActive={false} startTime={Date.now()} />);
      expect(screen.queryByText("Reasoning hidden by provider")).not.toBeInTheDocument();
      expect(screen.getByText("Memory usage climbed steadily.")).toBeInTheDocument();
    });
  });
});
