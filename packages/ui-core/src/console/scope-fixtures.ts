/** Authored fixture records only; none of these types describe a live API. */
export interface ScopeResourceKey { id: string; cluster: string; namespace: string | null; apiVersion: string; kind: string; name: string }
export interface ScopeResource extends ScopeResourceKey {
  sourceScope: string;
  resourceLabel: string;
  namespaceLabel: string;
  effectiveScope: "managed" | "excluded" | "unknown";
  reason: string;
}
export interface ScopeCluster { id: string; sourceScope: string; classification?: string }
export interface ScopeFixtureData {
  sourceScope: string; source: string; observedAt?: string; completeness: string;
  clusters: readonly ScopeCluster[]; resources: readonly ScopeResource[];
  attention: readonly { sourceScope: string; id: string; description: string }[];
}

export const scopeFixtures: ScopeFixtureData = {
  sourceScope: "fixture-scope-a", source: "Synthetic scope fixture", observedAt: "2026-01-01T00:00:00Z", completeness: "Partial fixture inventory",
  clusters: [{ id: "cluster-fixture-a", sourceScope: "fixture-scope-a", classification: "Registered spoke" }],
  resources: [
    { id: "resource-fixture-1", sourceScope: "fixture-scope-a", cluster: "cluster-fixture-a", namespace: "payments", apiVersion: "apps/v1", kind: "Deployment", name: "checkout", resourceLabel: "Not recorded", namespaceLabel: "true", effectiveScope: "managed", reason: "Fixture records namespace inheritance" },
    { id: "resource-fixture-2", sourceScope: "fixture-scope-a", cluster: "cluster-fixture-a", namespace: "payments", apiVersion: "v1", kind: "Pod", name: "excluded-example", resourceLabel: "false", namespaceLabel: "true", effectiveScope: "excluded", reason: "Fixture records explicit resource exclusion" },
    { id: "resource-fixture-3", sourceScope: "fixture-scope-a", cluster: "cluster-fixture-a", namespace: null, apiVersion: "v1", kind: "Node", name: "node-example", resourceLabel: "true", namespaceLabel: "Not applicable — cluster-scoped", effectiveScope: "managed", reason: "Fixture records resource-level scope" },
  ],
  attention: [{ id: "attention-fixture-1", sourceScope: "fixture-scope-a", description: "Recorded fixture work requires review" }],
};

const valid = (s: string) => Boolean(s && s.trim());
const scoped = (data: ScopeFixtureData, scope: string) => valid(scope) && scope === data.sourceScope;
const identity = (a: ScopeResourceKey, b: ScopeResourceKey) => a.cluster === b.cluster && a.namespace === b.namespace && a.apiVersion === b.apiVersion && a.kind === b.kind && a.name === b.name;
export function findScopeCluster(data: ScopeFixtureData, scope: string, id: string): ScopeCluster | undefined {
  if (!scoped(data, scope) || !valid(id)) return undefined;
  const matches = data.clusters.filter((item) => item.id === id);
  return matches.length === 1 && matches[0].sourceScope === scope ? matches[0] : undefined;
}
export function findScopeResource(data: ScopeFixtureData, scope: string, key: ScopeResourceKey): ScopeResource | undefined {
  if (!scoped(data, scope) || !valid(key.id) || !valid(key.cluster) || !valid(key.apiVersion) || !valid(key.kind) || !valid(key.name) || (key.namespace !== null && !valid(key.namespace))) return undefined;
  const ids = data.resources.filter((item) => item.id === key.id);
  const identities = data.resources.filter((item) => identity(item, key));
  const item = ids.length === 1 ? ids[0] : undefined;
  return item && item.sourceScope === scope && identity(item, key) && identities.length === 1 && findScopeCluster(data, scope, item.cluster) ? item : undefined;
}
export function validAttention(data: ScopeFixtureData, scope: string) {
  if (!scoped(data, scope)) return [];
  return data.attention.filter((item) => valid(item.id) && valid(item.description) && item.sourceScope === scope && data.attention.filter((other) => other.id === item.id).length === 1);
}
