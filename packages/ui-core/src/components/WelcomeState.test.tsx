import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { WelcomeState } from "./WelcomeState";

describe("WelcomeState", () => {
  it("UT-CONSOLE-WELCOME-001 [console#47]: explains the default full_remediation phrasing", () => {
    render(<WelcomeState onSuggest={vi.fn()} />);
    expect(screen.getByText('"Investigate X"')).toBeInTheDocument();
    expect(screen.getByText(/suggests fixes to choose from/i)).toBeInTheDocument();
  });

  it("UT-CONSOLE-WELCOME-002 [console#47]: explains the interactive-only phrasing", () => {
    render(<WelcomeState onSuggest={vi.fn()} />);
    expect(screen.getByText('"Just investigate X"')).toBeInTheDocument();
    expect(screen.getByText(/no fix suggestions unless you ask/i)).toBeInTheDocument();
  });

  it("UT-CONSOLE-WELCOME-003 [console#47]: explains the autonomous remediation phrasing", () => {
    render(<WelcomeState onSuggest={vi.fn()} />);
    expect(screen.getByText('"Fix X"')).toBeInTheDocument();
    expect(screen.getByText(/no further back-and-forth/i)).toBeInTheDocument();
  });

  it("UT-CONSOLE-WELCOME-004: still renders the suggested-prompt buttons and forwards clicks", () => {
    const onSuggest = vi.fn();
    render(<WelcomeState onSuggest={onSuggest} />);
    fireEvent.click(screen.getByText("Investigate the CrashLoopBackOff alert"));
    expect(onSuggest).toHaveBeenCalledWith("Investigate the CrashLoopBackOff alert");
  });

  it("UT-CONSOLE-WELCOME-005 [console#47]: mode hints are exposed as an accessible group", () => {
    render(<WelcomeState onSuggest={vi.fn()} />);
    expect(screen.getByLabelText(/how to phrase your request/i)).toBeInTheDocument();
  });
});
