/** Synthetic, sanitized presentation records; not upstream schemas or grants. */
export interface GovernancePolicy {
  id: string; scope: string; owner?: string; configReference?: string;
  currentRevision?: string; currentThreshold?: string;
  historical: { revision?: string; hash?: string; rules?: string; decision?: string };
}
export interface GovernanceScopeRule {
  id: string; scope: string; resource: string; namespace: string | null;
  resourceLabel?: boolean; namespaceLabel?: boolean; effective: string; provenance: string;
}
export interface GovernanceCase { id: string; scope: string }
export interface GovernanceEvent {
  id: string; scope: string; caseId: string; version: string; time: string;
  category: string; action: string; outcome: string;
  actor: { kind: "service" | "human"; name: string }; initiator?: string; reviewer?: string;
  reason?: string; policy?: string; resource?: string;
}
export interface GovernanceSetting { id: string; scope: string; owner: string; value?: string }
export interface GovernanceFixtureData {
  scope: string; source: string; observedAt?: string; completeness: string; retention: string;
  policies: readonly GovernancePolicy[]; rules: readonly GovernanceScopeRule[];
  cases: readonly GovernanceCase[]; events: readonly GovernanceEvent[]; settings: readonly GovernanceSetting[];
}

export const governanceFixtures: GovernanceFixtureData = {
  scope: "fixture-scope-a", source: "Synthetic governance fixture", observedAt: "2026-01-01T00:00:00Z", completeness: "Partial loaded fixture", retention: "Not supplied",
  policies: [{ id: "approval-fixture", scope: "fixture-scope-a", owner: "Operator", configReference: "Approval policy configuration", currentRevision: "revision-current", historical: { revision: "revision-recorded", rules: "Recorded approval rule", decision: "Approval required" } }],
  rules: [
    { id: "scope-override", scope: "fixture-scope-a", resource: "excluded-example", namespace: "payments", resourceLabel: false, namespaceLabel: true, effective: "Excluded", provenance: "Explicit resource false overrides namespace" },
    { id: "scope-inherited", scope: "fixture-scope-a", resource: "checkout", namespace: "payments", namespaceLabel: true, effective: "Included", provenance: "Namespace inheritance" },
    { id: "scope-cluster", scope: "fixture-scope-a", resource: "node-example", namespace: null, resourceLabel: true, effective: "Included", provenance: "Resource label; no namespace inheritance" },
  ],
  cases: [{ id: "case-fixture-1", scope: "fixture-scope-a" }],
  events: [{ id: "event-fixture-1", scope: "fixture-scope-a", caseId: "case-fixture-1", version: "fixture-v1", time: "2026-01-01T00:00:00Z", category: "approval", action: "decision", outcome: "recorded", actor: { kind: "service", name: "fixture-service" }, initiator: "fixture-initiator", reviewer: "fixture-reviewer", resource: "checkout" }],
  settings: [{ id: "platform-fixture", scope: "fixture-scope-a", owner: "Operator / GitOps", value: "Not recorded" }, { id: "access-fixture", scope: "fixture-scope-a", owner: "Trusted host access context" }],
};

const valid = (value: string) => Boolean(value.trim());
function unique<T extends { id: string; scope: string }>(data: GovernanceFixtureData, scope: string, id: string, items: readonly T[]): T | undefined {
  if (!valid(scope) || scope !== data.scope || !valid(id)) return undefined;
  const matches = items.filter((item) => item.id === id);
  return matches.length === 1 && matches[0].scope === scope ? matches[0] : undefined;
}
export const findGovernancePolicy = (data: GovernanceFixtureData, scope: string, id: string) => unique(data, scope, id, data.policies);
export const findGovernanceSetting = (data: GovernanceFixtureData, scope: string, id: string) => unique(data, scope, id, data.settings);
export const findGovernanceCase = (data: GovernanceFixtureData, scope: string, id: string) => unique(data, scope, id, data.cases);
export const findGovernanceRule = (data: GovernanceFixtureData, scope: string, id: string) => unique(data, scope, id, data.rules);
export function findGovernanceEvent(data: GovernanceFixtureData, scope: string, id: string, caseId?: string): GovernanceEvent | undefined {
  const event = unique(data, scope, id, data.events);
  if (!event || !findGovernanceCase(data, scope, event.caseId) || (caseId !== undefined && (caseId !== event.caseId || !findGovernanceCase(data, scope, caseId)))) return undefined;
  return event;
}
