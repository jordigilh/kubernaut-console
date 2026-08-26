import { describe, it, expect } from "vitest";
import { isInvestigationSummary } from "./investigation-summary";
import type { InvestigationSummary } from "./investigation-summary";

describe("isInvestigationSummary", () => {
  const validPayload: InvestigationSummary = {
    schema_version: "1.0",
    type: "investigation_summary",
    session_id: "ka-session-xyz",
    rr_id: "rr-d835a1f68ee8-f2aea97c",
    summary: "2 remediations tracked, both in terminal states.",
    rca: {
      severity: "high",
      confidence: 0.92,
      target: "deployment/worker",
      causal_chain: ["OOM kill", "memory limit too low", "traffic spike"],
      rca_summary: "The worker deployment is OOM-killing due to insufficient memory limits.",
      tool_calls_count: 12,
      llm_turns: 4,
    },
    options: [
      {
        workflow_id: "crashloop-rollback-v1",
        name: "Rolling restart",
        description: "Restart pods sequentially",
        risk: "low",
        recommended: true,
        parameters: { TARGET_NAMESPACE: "demo-checkout" },
      },
      {
        workflow_id: "scale-up-v1",
        name: "Scale up",
        description: "Add replicas to handle load",
        risk: "low",
        recommended: false,
        ruled_out_reason: "Does not address root cause (OOM)",
      },
    ],
  };

  it("UT-SCHEMA-001: returns true for a valid investigation_summary payload", () => {
    expect(isInvestigationSummary(validPayload)).toBe(true);
  });

  it("UT-SCHEMA-002: returns true when options is absent (optional field)", () => {
    const withoutOptions = { ...validPayload };
    delete (withoutOptions as Record<string, unknown>).options;
    expect(isInvestigationSummary(withoutOptions)).toBe(true);
  });

  it("UT-SCHEMA-003: returns false for null", () => {
    expect(isInvestigationSummary(null)).toBe(false);
  });

  it("UT-SCHEMA-004: returns false for non-object primitives", () => {
    expect(isInvestigationSummary("string")).toBe(false);
    expect(isInvestigationSummary(42)).toBe(false);
    expect(isInvestigationSummary(undefined)).toBe(false);
  });

  it("UT-SCHEMA-005: returns true regardless of type field value (detection moved to artifact metadata)", () => {
    expect(isInvestigationSummary({ ...validPayload, type: "remediation_list" })).toBe(true);
  });

  // kubernaut-console#90: session_id is NOT reliably present on every real
  // wire payload -- IT-CONSOLE-PROVIDER-002 (KubernautChat.integration.test.tsx)
  // is a pre-existing, currently-correct integration test whose payload has
  // no session_id at all (only type/schema_version/rr_id/summary). Requiring
  // it unconditionally would break that real, intended behavior, so this
  // function no longer treats any single field as individually mandatory --
  // see UT-SCHEMA-006 below for what it does still reject.
  it("UT-SCHEMA-006a: still returns true when session_id is absent but other recognized fields are present", () => {
    const missing = { ...validPayload };
    delete (missing as Record<string, unknown>).session_id;
    expect(isInvestigationSummary(missing)).toBe(true);
  });

  it("UT-SCHEMA-006: returns false when the payload has none of the recognized investigation_summary fields (genuine garbage, not a partial payload)", () => {
    expect(isInvestigationSummary({ unexpected: "shape", not_a_real_field: true })).toBe(false);
    expect(isInvestigationSummary({})).toBe(false);
  });

  it("UT-SCHEMA-007: returns false when rca is null", () => {
    expect(isInvestigationSummary({ ...validPayload, rca: null })).toBe(false);
  });

  it("UT-SCHEMA-008: returns false when rca is not an object", () => {
    expect(isInvestigationSummary({ ...validPayload, rca: "not an object" })).toBe(false);
  });

  it("UT-SCHEMA-009: returns true when rca is entirely absent (partial/incremental SSE chunk, not yet available)", () => {
    const withoutRca = { ...validPayload };
    delete (withoutRca as Record<string, unknown>).rca;
    expect(isInvestigationSummary(withoutRca)).toBe(true);
  });

  // kubernaut-console#90: same rationale as UT-SCHEMA-006a -- top-level
  // summary is NOT reliably present either (IT-CONSOLE-MCP-005/006/007 send
  // `rca: { summary: ... }` nested, with production code (useChat.ts)
  // falling back to artifact text when the top-level field is absent).
  it("UT-SCHEMA-010: still returns true when summary is absent but other recognized fields are present", () => {
    const missing = { ...validPayload };
    delete (missing as Record<string, unknown>).summary;
    expect(isInvestigationSummary(missing)).toBe(true);
  });
});
