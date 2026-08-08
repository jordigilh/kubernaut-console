import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { WelcomeState } from "./WelcomeState";

describe("WelcomeState", () => {
  it("UT-CONSOLE-WELCOME-001 [console#47]: explains the interactive-remediation phrasing", () => {
    render(<WelcomeState onSuggest={vi.fn()} onFillTemplate={vi.fn()} />);
    expect(screen.getByText('"Investigate ..."')).toBeInTheDocument();
    expect(screen.getByText(/start an interactive remediation/i)).toBeInTheDocument();
  });

  it("UT-CONSOLE-WELCOME-003 [console#47]: explains the autonomous remediation phrasing", () => {
    render(<WelcomeState onSuggest={vi.fn()} onFillTemplate={vi.fn()} />);
    expect(screen.getByText('"Fix ..."')).toBeInTheDocument();
    expect(screen.getByText(/trigger an autonomous remediation/i)).toBeInTheDocument();
  });

  it("UT-CONSOLE-WELCOME-002 [console#47]: does not advertise investigate-only phrasing (leaves the RR without a resolution path)", () => {
    render(<WelcomeState onSuggest={vi.fn()} onFillTemplate={vi.fn()} />);
    expect(screen.queryByText('"Just investigate ..."')).not.toBeInTheDocument();
    expect(screen.queryByText(/no fix suggestions unless you ask/i)).not.toBeInTheDocument();
  });

  it("UT-CONSOLE-WELCOME-007 [console#69]: gives a concrete example of a filled-in template", () => {
    render(<WelcomeState onSuggest={vi.fn()} onFillTemplate={vi.fn()} />);
    expect(screen.getByText('"Investigate the alert in the payments namespace"')).toBeInTheDocument();
  });

  it("UT-CONSOLE-WELCOME-005 [console#47]: mode hints are exposed as an accessible group of exactly 3 options", () => {
    render(<WelcomeState onSuggest={vi.fn()} onFillTemplate={vi.fn()} />);
    const group = screen.getByLabelText(/how to phrase your request/i);
    expect(group).toBeInTheDocument();
    expect(group.tagName).toBe("UL");
    expect(group.querySelectorAll("li")).toHaveLength(3);
  });

  it("UT-CONSOLE-WELCOME-008 [console#69]: 'List active alerts' is a complete command sent immediately", () => {
    const onSuggest = vi.fn();
    const onFillTemplate = vi.fn();
    render(<WelcomeState onSuggest={onSuggest} onFillTemplate={onFillTemplate} />);
    fireEvent.click(screen.getByRole("button", { name: /suggest: list active alerts/i }));
    expect(onSuggest).toHaveBeenCalledWith("List active alerts");
    expect(onFillTemplate).not.toHaveBeenCalled();
  });

  it("UT-CONSOLE-WELCOME-009 [console#69]: 'Investigate ...' fills the input with the verb instead of sending an incomplete command", () => {
    const onSuggest = vi.fn();
    const onFillTemplate = vi.fn();
    render(<WelcomeState onSuggest={onSuggest} onFillTemplate={onFillTemplate} />);
    fireEvent.click(screen.getByRole("button", { name: /start typing a "investigate \.\.\." request/i }));
    expect(onFillTemplate).toHaveBeenCalledWith("Investigate ");
    expect(onSuggest).not.toHaveBeenCalled();
  });

  it("UT-CONSOLE-WELCOME-010 [console#69]: 'Fix ...' fills the input with the verb instead of sending an incomplete command", () => {
    const onSuggest = vi.fn();
    const onFillTemplate = vi.fn();
    render(<WelcomeState onSuggest={onSuggest} onFillTemplate={onFillTemplate} />);
    fireEvent.click(screen.getByRole("button", { name: /start typing a "fix \.\.\." request/i }));
    expect(onFillTemplate).toHaveBeenCalledWith("Fix ");
    expect(onSuggest).not.toHaveBeenCalled();
  });
});
