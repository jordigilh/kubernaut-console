import { describe, it, expect } from "vitest";
import { findApprovalMessageIndex } from "./approval-dedup";
import type { ChatMessage, ApprovalRequest } from "../hooks/useChat";

function agentMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: "m1",
    role: "agent",
    text: "",
    timestamp: 0,
    ...overrides,
  };
}

const baseApproval: ApprovalRequest = {
  name: "rar-existing",
  confidence: 0.9,
  confidenceLevel: "high",
  reason: "Production approval required",
  requiredBy: new Date(Date.now() + 300_000).toISOString(),
};

describe("findApprovalMessageIndex", () => {
  it("UT-CONSOLE-APPROVAL-001: same rrId, no approvalRequest set yet -> converges onto that message (console#115 race: path B resolves before path A's SSE event lands)", () => {
    const messages = [agentMessage({ id: "turn-1", rrId: "rr-1" })];
    expect(findApprovalMessageIndex(messages, "rr-1", "rar-bare")).toBe(0);
  });

  it("UT-CONSOLE-APPROVAL-002: same rrId, approvalRequest already set with a different name -> still converges onto that message (caller must check approvalRequest before overwriting)", () => {
    const messages = [agentMessage({ id: "turn-1", rrId: "rr-1", approvalRequest: { ...baseApproval, name: "rar-bare" } })];
    expect(findApprovalMessageIndex(messages, "rr-1", "kubernaut-system/rar-bare")).toBe(0);
  });

  it("UT-CONSOLE-APPROVAL-003: different rrId, same RAR name -> found via name fallback", () => {
    const messages = [agentMessage({ id: "turn-1", rrId: "rr-1", approvalRequest: { ...baseApproval, name: "rar-shared" } })];
    expect(findApprovalMessageIndex(messages, "rr-2", "rar-shared")).toBe(0);
  });

  it("UT-CONSOLE-APPROVAL-004: different rrId, different RAR name -> not found (-1), caller must append", () => {
    const messages = [agentMessage({ id: "turn-1", rrId: "rr-1", approvalRequest: { ...baseApproval, name: "rar-1" } })];
    expect(findApprovalMessageIndex(messages, "rr-2", "rar-2")).toBe(-1);
  });

  it("UT-CONSOLE-APPROVAL-005: no messages at all -> not found (-1)", () => {
    expect(findApprovalMessageIndex([], "rr-1", "rar-1")).toBe(-1);
  });

  it("UT-CONSOLE-APPROVAL-006: candidate and existing rrId both undefined, names differ -> not found (no false-positive convergence)", () => {
    const messages = [agentMessage({ id: "turn-1", rrId: undefined, approvalRequest: { ...baseApproval, name: "rar-1" } })];
    expect(findApprovalMessageIndex(messages, undefined, "rar-2")).toBe(-1);
  });

  it("UT-CONSOLE-APPROVAL-007: multiple agent messages share rrId (multi-turn conversation about the same RR) -> converges onto the most recent one", () => {
    const messages = [
      agentMessage({ id: "turn-1", rrId: "rr-1" }),
      { id: "user-1", role: "user" as const, text: "fix it", timestamp: 1 },
      agentMessage({ id: "turn-2", rrId: "rr-1" }),
    ];
    expect(findApprovalMessageIndex(messages, "rr-1", "rar-1")).toBe(2);
  });
});
