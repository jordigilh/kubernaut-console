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
  it("UT-CONSOLE-THINK-001: renders 'Investigating' label with animated dots when active", () => {
    render(<ThinkingPanel entries={entries} isActive={true} startTime={Date.now() - 5000} />);
    expect(screen.getByText("Investigating")).toBeInTheDocument();
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
  it("UT-CONSOLE-THINK-004: renders tool_call entries with monospace styling", () => {
    render(<ThinkingPanel entries={entries} isActive={false} startTime={Date.now()} />);
    const el = screen.getByText("kubectl_previous_logs Pod/web-frontend");
    expect(el).toBeInTheDocument();
    expect(el.className).toContain("font-mono");
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

  it("UT-CONSOLE-THINK-008: collapses and expands on chevron click", () => {
    render(<ThinkingPanel entries={entries} isActive={false} startTime={Date.now()} />);
    const toggle = screen.getByRole("button");
    fireEvent.click(toggle);
    expect(screen.queryByTestId("thinking-body")).not.toBeInTheDocument();
    fireEvent.click(toggle);
    expect(screen.getByTestId("thinking-body")).toBeInTheDocument();
  });

  it("UT-CONSOLE-THINK-009: shows step count when not active", () => {
    render(<ThinkingPanel entries={entries} isActive={false} startTime={Date.now()} />);
    expect(screen.getByText(/5 steps/)).toBeInTheDocument();
  });
});
