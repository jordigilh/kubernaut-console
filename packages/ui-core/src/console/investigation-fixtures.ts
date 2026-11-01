/** Synthetic presentation data only; not an API, authorization, or chat state model. */
export interface FixtureScope {
  cluster?: string;
  namespace?: string;
  resource?: string;
}

export interface FixtureCase {
  id: string;
  sourceScope: string;
  lifecycle: string;
  alert: FixtureScope;
  target: FixtureScope;
}

export interface FixtureRelationship {
  sourceScope: string;
  caseId: string;
  workspaceId: string;
  verification: "verified" | "unverified" | "denied";
}

export interface FixtureInvestigationData {
  sourceScope: string;
  source: string;
  observedAt: string;
  cases: readonly FixtureCase[];
  relationships: readonly FixtureRelationship[];
}

export const investigationFixtures: FixtureInvestigationData = {
  sourceScope: "fixture-scope-a",
  source: "Synthetic investigation fixture",
  observedAt: "2026-01-01T00:00:00Z",
  cases: [
    { id: "rr-fixture-01", sourceScope: "fixture-scope-a", lifecycle: "Investigating", alert: { cluster: "alert-cluster", namespace: "alert-namespace", resource: "Pod/alert-source" }, target: { cluster: "target-cluster", namespace: "target-namespace", resource: "Deployment/target" } },
    { id: "rr-fixture-02", sourceScope: "fixture-scope-a", lifecycle: "Completed", alert: { namespace: "historical-alert" }, target: {} },
  ],
  relationships: [{ sourceScope: "fixture-scope-a", caseId: "rr-fixture-01", workspaceId: "workspace-fixture-01", verification: "verified" }],
};

/** Reject duplicates, blank identifiers and scope mismatches rather than choosing a row. */
export function findFixtureCase(data: FixtureInvestigationData, scope: string, id: string): FixtureCase | undefined {
  if (!scope.trim() || scope !== data.sourceScope || !id.trim()) return undefined;
  const matches = data.cases.filter((item) => item.id === id);
  return matches.length === 1 ? matches[0] : undefined;
}

/** A fixture assertion only: no identity, authorization or driver is established. */
export function findFixtureWorkspace(data: FixtureInvestigationData, scope: string, caseId: string): FixtureRelationship | undefined {
  if (!findFixtureCase(data, scope, caseId)) return undefined;
  const matches = data.relationships.filter((item) => item.caseId === caseId);
  if (matches.length !== 1) return undefined;
  const relation = matches[0];
  if (relation.sourceScope !== scope || relation.verification !== "verified" || !relation.workspaceId.trim()) return undefined;
  const workspaceMatches = data.relationships.filter((item) => item.workspaceId === relation.workspaceId);
  return workspaceMatches.length === 1 ? relation : undefined;
}
