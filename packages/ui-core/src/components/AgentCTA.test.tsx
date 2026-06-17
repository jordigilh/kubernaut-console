import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { AgentCTA } from "./AgentCTA";

describe("AgentCTA", () => {
  it("UT-CONSOLE-CTA-001: renders recommendation text", () => {
    render(<AgentCTA text="I recommend a Git revert." />);
    expect(screen.getByText("I recommend a Git revert.")).toBeInTheDocument();
  });

  it("UT-CONSOLE-CTA-002: renders multi-line text as alert title", () => {
    const text = "In-cluster patches won't persist.\nSelect a workflow.";
    render(<AgentCTA text={text} />);
    expect(screen.getByTestId("agent-cta")).toBeInTheDocument();
  });

  it("UT-CONSOLE-CTA-003: renders as PF6 Alert component", () => {
    render(<AgentCTA text="Test" />);
    const el = screen.getByTestId("agent-cta");
    expect(el.className).toContain("pf-v6-c-alert");
  });

  it("UT-CONSOLE-CTA-004: renders as info variant", () => {
    render(<AgentCTA text="Test" />);
    const el = screen.getByTestId("agent-cta");
    expect(el.className).toContain("pf-m-info");
  });
});
