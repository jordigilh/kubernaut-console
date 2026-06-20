import { describe, it, expect, beforeEach } from "vitest";
import {
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
