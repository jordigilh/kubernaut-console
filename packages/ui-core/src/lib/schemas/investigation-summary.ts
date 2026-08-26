export interface InvestigationSummaryRCA {
  severity: "critical" | "high" | "medium" | "low" | "info";
  confidence: number;
  target: string;
  namespace?: string;
  causal_chain?: string[];
  rca_summary?: string;
  tool_calls_count?: number;
  llm_turns?: number;
}

export interface InvestigationSummaryOption {
  workflow_id: string;
  name: string;
  description: string;
  risk?: "low" | "medium" | "high" | "critical";
  recommended?: boolean;
  parameters?: Record<string, string>;
  ruled_out_reason?: string;
}

export interface ResourceTarget {
  api_version: string;
  kind: string;
  name: string;
  namespace?: string;
}

export interface InvestigationSummary {
  schema_version?: string;
  type?: string;
  session_id: string;
  rr_id?: string;
  signal_name?: string;
  namespace?: string;
  cluster_id?: string;
  summary: string;
  rca: InvestigationSummaryRCA;
  options?: InvestigationSummaryOption[];
  searched_target?: ResourceTarget;
  signal_target?: ResourceTarget;
}

// Every field this payload can carry on the wire, per the real backend
// contract as observed across three independent, pre-existing production
// call sites/integration tests (kubernaut-console#90 investigation):
// IT-CONSOLE-MCP-005/006/007 send `session_id` + `rca` but no top-level
// `summary` (it lives nested at `rca.summary` instead, with the top-level
// field falling back to artifact text -- see useChat.ts's
// `summary: payload.summary || textFallback`); IT-CONSOLE-PROVIDER-002
// sends `type` + `schema_version` + `summary` but no `session_id` at all.
// None of `session_id`/`summary`/`rca` is reliably present on every real
// payload despite all three being typed as required on
// `InvestigationSummary` above (that interface documents the *idealized*
// full shape, not a wire guarantee) -- this is a genuinely progressive,
// incrementally-populated payload protocol, not a fixed schema. A strict
// "all of session_id+summary+rca required" gate (the original, unused
// version of this function) breaks real, currently-correct behavior.
//
// The plausibility check below intentionally does not enforce any single
// field as mandatory. Instead it rejects only genuinely unrecognizable
// input (no field overlap with this list at all) while accepting anything
// that looks like a real, if partial, investigation_summary chunk.
const INVESTIGATION_SUMMARY_FIELDS = [
  "schema_version", "type", "session_id", "rr_id", "signal_name",
  "namespace", "cluster_id", "summary", "rca", "options",
  "searched_target", "signal_target",
] as const;

export function isInvestigationSummary(data: unknown): data is InvestigationSummary {
  if (typeof data !== "object" || data === null) return false;
  const obj = data as Record<string, unknown>;
  // When `rca` IS present, it must be a non-null object -- a malformed rca
  // is still rejected even on an otherwise-plausible payload.
  if ("rca" in obj && (typeof obj.rca !== "object" || obj.rca === null)) return false;
  return INVESTIGATION_SUMMARY_FIELDS.some((field) => field in obj);
}
