import { describe, expect, it } from "vitest";
import { shouldAnchorToNewRca } from "./chat-scroll";

describe("shouldAnchorToNewRca", () => {
  it("UT-CONSOLE-CHAT-SCROLL-001: anchors when a new RCA appears while the user is at the live edge", () => {
    expect(shouldAnchorToNewRca(undefined, "agent-1", false)).toBe(true);
  });

  it("UT-CONSOLE-CHAT-SCROLL-002: does not re-anchor when the existing RCA is updated", () => {
    expect(shouldAnchorToNewRca("agent-1", "agent-1", false)).toBe(false);
  });

  it("UT-CONSOLE-CHAT-SCROLL-003: preserves a user-selected scroll position", () => {
    expect(shouldAnchorToNewRca(undefined, "agent-1", true)).toBe(false);
  });

  it("UT-CONSOLE-CHAT-SCROLL-004: does not anchor when no RCA is present", () => {
    expect(shouldAnchorToNewRca(undefined, undefined, false)).toBe(false);
  });
});
