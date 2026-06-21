import { describe, it, expect } from "vitest";
import { maxChatPhase } from "./phase-rank";

describe("maxChatPhase", () => {
  it("returns the more advanced phase", () => {
    expect(maxChatPhase("investigation", "verifying")).toBe("verifying");
    expect(maxChatPhase("remediation", "investigation")).toBe("remediation");
    expect(maxChatPhase("decision", "remediation")).toBe("remediation");
  });

  it("handles undefined inputs", () => {
    expect(maxChatPhase(undefined, "verifying")).toBe("verifying");
    expect(maxChatPhase("decision", undefined)).toBe("decision");
  });
});
