import { describe, it, expect } from "vitest";
import { hasApprovalCardFor } from "./approval-dedup";
import type { ChatMessage, ApprovalRequest } from "../hooks/useChat";

function approvalMessage(overrides: Partial<ChatMessage> & { approvalRequest: ApprovalRequest }): ChatMessage {
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

describe("hasApprovalCardFor", () => {
  it("UT-CONSOLE-APPROVAL-001: same rrId, different RAR name -> true (console#115 dedup)", () => {
    const messages = [approvalMessage({ rrId: "rr-1", approvalRequest: { ...baseApproval, name: "rar-bare" } })];
    expect(hasApprovalCardFor(messages, "rr-1", "kubernaut-system/rar-bare")).toBe(true);
  });

  it("UT-CONSOLE-APPROVAL-002: different rrId, same RAR name -> true (name fallback)", () => {
    const messages = [approvalMessage({ rrId: "rr-1", approvalRequest: { ...baseApproval, name: "rar-shared" } })];
    expect(hasApprovalCardFor(messages, "rr-2", "rar-shared")).toBe(true);
  });

  it("UT-CONSOLE-APPROVAL-003: different rrId, different RAR name -> false (distinct approvals both render)", () => {
    const messages = [approvalMessage({ rrId: "rr-1", approvalRequest: { ...baseApproval, name: "rar-1" } })];
    expect(hasApprovalCardFor(messages, "rr-2", "rar-2")).toBe(false);
  });

  it("UT-CONSOLE-APPROVAL-004: no existing approval-carrying message -> false", () => {
    const messages: ChatMessage[] = [{ id: "m1", role: "agent", text: "hello", timestamp: 0, rrId: "rr-1" }];
    expect(hasApprovalCardFor(messages, "rr-1", "rar-1")).toBe(false);
  });

  it("UT-CONSOLE-APPROVAL-005: both candidate and existing rrId are undefined, names differ -> false (no false-positive dedup)", () => {
    const messages = [approvalMessage({ rrId: undefined, approvalRequest: { ...baseApproval, name: "rar-1" } })];
    expect(hasApprovalCardFor(messages, undefined, "rar-2")).toBe(false);
  });
});
