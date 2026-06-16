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
  summary: string;
  rca: InvestigationSummaryRCA;
  options?: InvestigationSummaryOption[];
  discovery_target?: ResourceTarget;
  signal_target?: ResourceTarget;
}

export function isInvestigationSummary(data: unknown): data is InvestigationSummary {
  if (typeof data !== "object" || data === null) return false;
  const obj = data as Record<string, unknown>;
  return (
    typeof obj.session_id === "string" &&
    typeof obj.summary === "string" &&
    typeof obj.rca === "object" && obj.rca !== null
  );
}
