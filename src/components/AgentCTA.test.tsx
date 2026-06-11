import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { AgentCTA } from "./AgentCTA";

describe("AgentCTA", () => {
  it("UT-CONSOLE-CTA-001: renders recommendation text", () => {
    render(<AgentCTA text="I recommend a Git revert." />);
    expect(screen.getByText("I recommend a Git revert.")).toBeInTheDocument();
  });

  it("UT-CONSOLE-CTA-002: renders multi-line text preserving lines", () => {
    const text = "In-cluster patches won't persist.\nSelect a workflow.";
    render(<AgentCTA text={text} />);
    expect(screen.getByText("In-cluster patches won't persist.")).toBeInTheDocument();
    expect(screen.getByText("Select a workflow.")).toBeInTheDocument();
  });

  it("UT-CONSOLE-CTA-003: has teal background styling", () => {
    render(<AgentCTA text="Test" />);
    const el = screen.getByTestId("agent-cta");
    expect(el.className).toContain("bg-kubernaut-teal-50");
  });

  it("UT-CONSOLE-CTA-004: has teal text color", () => {
    render(<AgentCTA text="Test" />);
    const el = screen.getByTestId("agent-cta");
    expect(el.className).toContain("text-kubernaut-teal-600");
  });
});
