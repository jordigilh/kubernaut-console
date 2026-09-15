import { describe, it, expect, beforeEach } from "vitest";
import {
  clearConsoleSessionState,
  clearSessionState,
  isPastDecisionPhase,
  isWorkflowResolved,
  loadPersistedPhase,
  markWorkflowResolved,
  savePersistedPhase,
} from "./session-state";

describe("session-state", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it("persists and loads phase", () => {
    savePersistedPhase("verifying");
    expect(loadPersistedPhase()).toBe("verifying");
    clearSessionState();
    expect(loadPersistedPhase()).toBeUndefined();
  });

  it("UT-CONSOLE-SESSION-019 [FedRAMP AC-12, SC-7; OWASP ASVS V3.3]: clears authenticated session state and rotates context", () => {
    sessionStorage.setItem("kubernaut-console-messages", JSON.stringify([
      { id: "old-message", role: "user", text: "private incident details", timestamp: 1 },
    ]));
    sessionStorage.setItem("kubernaut-pending-context", JSON.stringify(["old investigation"]));
    sessionStorage.setItem("kubernaut-console-context", "old-context");
    savePersistedPhase("complete");
    markWorkflowResolved("rr-old");

    const freshContext = clearConsoleSessionState();

    expect(sessionStorage.getItem("kubernaut-console-messages")).toBeNull();
    expect(sessionStorage.getItem("kubernaut-pending-context")).toBeNull();
    expect(loadPersistedPhase()).toBeUndefined();
    expect(isWorkflowResolved("rr-old")).toBe(false);
    expect(freshContext).not.toBe("old-context");
    expect(sessionStorage.getItem("kubernaut-console-context")).toBe(freshContext);
    expect(freshContext).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });

  it("tracks workflow resolved per rrId", () => {
    markWorkflowResolved("rr-abc");
    expect(isWorkflowResolved("rr-abc")).toBe(true);
    expect(isWorkflowResolved("rr-other")).toBe(false);
  });

  it("isPastDecisionPhase excludes investigation and decision", () => {
    expect(isPastDecisionPhase("investigation")).toBe(false);
    expect(isPastDecisionPhase("decision")).toBe(false);
    expect(isPastDecisionPhase("remediation")).toBe(true);
    expect(isPastDecisionPhase("verifying")).toBe(true);
  });
});
