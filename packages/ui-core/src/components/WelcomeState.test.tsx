import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { WelcomeState } from "./WelcomeState";

describe("WelcomeState", () => {
  it("UT-CONSOLE-WELCOME-001 [console#47]: explains the default full_remediation phrasing", () => {
    render(<WelcomeState onSuggest={vi.fn()} />);
    expect(screen.getByText('"Investigate and propose remediation for X"')).toBeInTheDocument();
    expect(screen.getByText(/suggests fixes to choose from/i)).toBeInTheDocument();
  });

  it("UT-CONSOLE-WELCOME-002 [console#47]: does not advertise investigate-only phrasing (leaves the RR without a resolution path)", () => {
    render(<WelcomeState onSuggest={vi.fn()} />);
    expect(screen.queryByText('"Just investigate X"')).not.toBeInTheDocument();
    expect(screen.queryByText(/no fix suggestions unless you ask/i)).not.toBeInTheDocument();
  });

  it("UT-CONSOLE-WELCOME-007: explains what X refers to", () => {
    render(<WelcomeState onSuggest={vi.fn()} />);
    expect(screen.getByText(/X is the target of the investigation/i)).toBeInTheDocument();
  });

  it("UT-CONSOLE-WELCOME-003 [console#47]: explains the autonomous remediation phrasing", () => {
    render(<WelcomeState onSuggest={vi.fn()} />);
    expect(screen.getByText('"Fix X"')).toBeInTheDocument();
    expect(screen.getByText(/no further back-and-forth/i)).toBeInTheDocument();
  });

  it("UT-CONSOLE-WELCOME-004: still renders the suggested-prompt buttons and forwards clicks", () => {
    const onSuggest = vi.fn();
    render(<WelcomeState onSuggest={onSuggest} />);
    fireEvent.click(screen.getByText("Show me recent incidents in the cluster"));
    expect(onSuggest).toHaveBeenCalledWith("Show me recent incidents in the cluster");
  });

  it("UT-CONSOLE-WELCOME-006: only shows the one suggestion generic enough to always apply", () => {
    render(<WelcomeState onSuggest={vi.fn()} />);
    expect(screen.queryByText("What's happening with the payments pods?")).not.toBeInTheDocument();
    expect(screen.queryByText("Investigate the CrashLoopBackOff alert")).not.toBeInTheDocument();
  });

  it("UT-CONSOLE-WELCOME-005 [console#47]: mode hints are exposed as an accessible group", () => {
    render(<WelcomeState onSuggest={vi.fn()} />);
    expect(screen.getByLabelText(/how to phrase your request/i)).toBeInTheDocument();
  });
});
