import { describe, it, expect } from "vitest";
import { isInvestigationEngaged, isReadOnlyQuery } from "./query-intent";
import type { ChatMessage } from "../hooks/useChat";

describe("query-intent", () => {
  it("detects read-only alert listing queries", () => {
    expect(isReadOnlyQuery("list active alerts")).toBe(true);
    expect(isReadOnlyQuery("Show me recent incidents in the cluster")).toBe(false);
    expect(isReadOnlyQuery("Investigate the CrashLoopBackOff alert")).toBe(false);
  });

  it("does not treat read-only session as investigation engaged", () => {
    const messages: ChatMessage[] = [
      { id: "1", role: "user", text: "list active alerts", timestamp: 1 },
      { id: "2", role: "agent", text: "", timestamp: 2, rrId: "rr-x", thinking: [{ id: "t", type: "tool_call", text: "..." }] },
    ];
    expect(isInvestigationEngaged(messages)).toBe(false);
  });

  it("treats explicit investigate message as engaged", () => {
    const messages: ChatMessage[] = [
      { id: "1", role: "user", text: "investigate prometheus alert", timestamp: 1 },
    ];
    expect(isInvestigationEngaged(messages)).toBe(true);
  });

  it("treats workflow options as engaged even after read-only opener", () => {
    const messages: ChatMessage[] = [
      { id: "1", role: "user", text: "list active alerts", timestamp: 1 },
      { id: "2", role: "agent", text: "", timestamp: 2, workflowOptions: [{ workflowId: "w1", name: "fix", description: "d" }] },
    ];
    expect(isInvestigationEngaged(messages)).toBe(true);
  });
});
