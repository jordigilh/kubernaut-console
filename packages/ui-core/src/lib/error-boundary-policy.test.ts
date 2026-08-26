import { describe, it, expect } from "vitest";
import { formatErrorBoundaryMessage, generateCorrelationId } from "./error-boundary-policy";

// kubernaut-console#97 (F-19) / #99 (F-10): the message-disclosure policy
// is a pure function specifically so it's unit-testable for both the dev
// and prod branch -- see docs/tests/97-99/TEST_PLAN.md for why the real
// ErrorBoundary component can't be flipped into "prod mode" from a Vitest
// test (import.meta.env.DEV is statically true in this repo's test runs).
describe("formatErrorBoundaryMessage", () => {
  it("UT-CONSOLE-EB-005: dev + error with a message returns the raw message", () => {
    expect(formatErrorBoundaryMessage(new Error("Cannot read properties of undefined"), "cid-1", true))
      .toBe("Cannot read properties of undefined");
  });

  it("UT-CONSOLE-EB-006: dev + null error returns the generic fallback (closes #99/F-10)", () => {
    expect(formatErrorBoundaryMessage(null, "cid-1", true)).toBe("An unexpected error occurred.");
  });

  it("UT-CONSOLE-EB-007: dev + empty-string message returns the generic fallback", () => {
    expect(formatErrorBoundaryMessage(new Error(""), "cid-1", true)).toBe("An unexpected error occurred.");
  });

  it("UT-CONSOLE-EB-008: prod never contains the original message, even one with path-/stack-like content", () => {
    const sensitiveMessage = "Cannot read properties of undefined (reading 'token') at /Users/dev/secret-project/src/internal/AuthProvider.tsx:42";
    const result = formatErrorBoundaryMessage(new Error(sensitiveMessage), "cid-abc123", false);
    expect(result).not.toContain(sensitiveMessage);
    expect(result).not.toContain("AuthProvider.tsx");
    expect(result).not.toContain("/Users/dev");
  });

  it("UT-CONSOLE-EB-009: prod message includes the given correlationId", () => {
    const result = formatErrorBoundaryMessage(new Error("boom"), "cid-xyz789", false);
    expect(result).toContain("cid-xyz789");
  });

  it("UT-CONSOLE-EB-010: prod + null error still returns the generic+correlationId message (no crash)", () => {
    const result = formatErrorBoundaryMessage(null, "cid-null-case", false);
    expect(result).toContain("cid-null-case");
    expect(result).toContain("An unexpected error occurred.");
  });
});

describe("generateCorrelationId", () => {
  it("UT-CONSOLE-EB-011: returns different non-empty strings on successive calls", () => {
    const id1 = generateCorrelationId();
    const id2 = generateCorrelationId();
    expect(id1.length).toBeGreaterThan(0);
    expect(id2.length).toBeGreaterThan(0);
    expect(id1).not.toBe(id2);
  });
});
