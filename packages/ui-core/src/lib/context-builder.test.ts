import { describe, it, expect } from "vitest";
import { buildDeferredContext } from "./context-builder";

describe("buildDeferredContext (ADR-008)", () => {
  it("UT-CONSOLE-SESSION-001: produces XML-tagged format with RR ID and phase", () => {
    const result = buildDeferredContext("kubernaut-system/rr-redis-oom-123", "Succeeded");
    expect(result).toContain("<previous_investigation>");
    expect(result).toContain("</previous_investigation>");
    expect(result).toContain("rr_id: kubernaut-system/rr-redis-oom-123");
    expect(result).toContain("phase: Succeeded");
  });

  it("UT-CONSOLE-SESSION-002: includes target when provided in metadata", () => {
    const result = buildDeferredContext("ns/rr-1", "Completed", {
      target: "Deployment/cache-primary",
    });
    expect(result).toContain("target: Deployment/cache-primary");
  });

  it("UT-CONSOLE-SESSION-003: includes resource when provided in metadata", () => {
    const result = buildDeferredContext("ns/rr-1", "Failed", {
      resource: "Pod/redis-0",
    });
    expect(result).toContain("resource: Pod/redis-0");
  });

  it("UT-CONSOLE-SESSION-004: includes alert name when provided", () => {
    const result = buildDeferredContext("ns/rr-1", "Completed", {
      alert_name: "KubePodCrashLooping",
    });
    expect(result).toContain("alert: KubePodCrashLooping");
  });

  it("UT-CONSOLE-SESSION-005: falls back to signal_name when alert_name is absent", () => {
    const result = buildDeferredContext("ns/rr-1", "Completed", {
      signal_name: "HighMemoryUsage",
    });
    expect(result).toContain("alert: HighMemoryUsage");
  });

  it("UT-CONSOLE-SESSION-006: always includes tool hints", () => {
    const result = buildDeferredContext("ns/rr-1", "Completed");
    expect(result).toContain("kubernaut_get_audit_trail(rr_id)");
    expect(result).toContain("kubernaut_get_remediation_request(rr_id)");
  });

  it("UT-CONSOLE-SESSION-007: omits optional fields when metadata is undefined", () => {
    const result = buildDeferredContext("ns/rr-1", "TimedOut");
    expect(result).not.toContain("target:");
    expect(result).not.toContain("resource:");
    expect(result).not.toContain("alert:");
  });

  it("UT-CONSOLE-SESSION-008: omits optional fields when metadata values are undefined", () => {
    const result = buildDeferredContext("ns/rr-1", "TimedOut", {
      target: undefined,
      resource: undefined,
      alert_name: undefined,
    });
    expect(result).not.toContain("target:");
    expect(result).not.toContain("resource:");
    expect(result).not.toContain("alert:");
  });
});
