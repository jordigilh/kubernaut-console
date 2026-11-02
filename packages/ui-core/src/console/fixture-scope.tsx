import { useState } from "react";
import { ConsoleShell, ReadStatePanel, type ReadStatus } from "./foundation";
import { findScopeCluster, findScopeResource, scopeFixtures, validAttention, type ScopeResource, type ScopeResourceKey } from "./scope-fixtures";
import type { NavigationId, Topology } from "./registry";

export type FixtureScopeScreen = { screen: "overview" } | { screen: "resources.list"; cluster?: string } | { screen: "resources.detail"; resource: ScopeResourceKey; cluster?: string } | { screen: "clusters.list" } | { screen: "clusters.detail"; cluster: string };
export interface FixtureScopeProps { scope?: string; topology?: Topology; initialScreen?: FixtureScopeScreen; status?: ReadStatus; access?: readonly ("overview" | "resources" | "clusters")[] }

function ResourceFields({ item }: { item: ScopeResource }) {
  return <><p>Kind: {item.kind}</p><p>API version: {item.apiVersion}</p><p>Name: {item.name}</p><p>Namespace: {item.namespace ?? "Not applicable — cluster-scoped"}</p><p>Cluster: {item.cluster}</p><p>Resource managed label: {item.resourceLabel || "Unknown"}</p><p>Namespace managed label: {item.namespace === null ? "Not applicable — cluster-scoped" : item.namespaceLabel || "Unknown"}</p><p>Effective scope: {item.effectiveScope}</p><p>Scope provenance: {item.reason || "Unknown"}</p></>;
}

function FixtureView({ scope, topology, initialScreen, status, access }: Required<FixtureScopeProps>) {
  const [view, setView] = useState(initialScreen);
  const data = scopeFixtures;
  const area: NavigationId = view.screen === "overview" ? "overview" : view.screen.startsWith("resources") ? "resources" : "clusters";
  const clusterPage = area === "clusters";
  const filter = "cluster" in view && view.screen !== "clusters.detail" ? view.cluster : undefined;
  const cluster = view.screen === "clusters.detail" ? findScopeCluster(data, scope, view.cluster) : undefined;
  const resource = view.screen === "resources.detail" ? findScopeResource(data, scope, view.resource) : undefined;
  const invalidFilter = filter !== undefined && (topology !== "fleet" || !findScopeCluster(data, scope, filter));
  const invalidRecord = view.screen === "clusters.detail" ? !cluster : view.screen === "resources.detail" ? !resource || (filter !== undefined && resource.cluster !== filter) : false;
  const hasData = status === "ready" || status === "partial" || status === "stale";
  const resources = data.resources.filter((item) => findScopeResource(data, scope, item) === item && (filter === undefined || item.cluster === filter));
  const clusters = data.clusters.filter((item) => findScopeCluster(data, scope, item.id) === item);
  const attention = validAttention(data, scope);
  const empty = view.screen === "overview" ? !attention.length : view.screen === "resources.list" ? !resources.length : view.screen === "clusters.list" ? !clusters.length : false;
  const readStatus: ReadStatus = status === "forbidden" || !access.includes(area as "overview" | "resources" | "clusters") ? "forbidden" : !scope.trim() || scope !== data.sourceScope ? "missing" : clusterPage && topology !== "fleet" ? "unavailable" : !hasData ? status : invalidFilter || invalidRecord ? "missing" : status === "ready" && empty ? "empty" : status;
  const titles = { overview: "Overview", "resources.list": "Managed resources", "resources.detail": "Resource detail", "clusters.list": "Clusters", "clusters.detail": "Cluster context" };
  return <ConsoleShell access={access} topology={topology} current={area} hrefs={{}}><div className="kn-investigation-fixture" data-fixture="true" data-screen={view.screen}>
    <p role="note">Synthetic fixture — read-only; topology and access are not live evidence.</p><h1>{titles[view.screen]}</h1>
    <ReadStatePanel label="Fixture read" state={{ status: readStatus, provenance: { source: data.source, observedAt: data.observedAt }, message: clusterPage && topology !== "fleet" ? topology === "local" ? "Clusters is fleet-only." : "Topology unknown; fleet registry unavailable." : undefined }}>
      <p>Fixture topology: {topology}</p><p>Completeness: {data.completeness || "Unknown"}</p>
      {view.screen === "overview" && <><h2>Scoped recorded attention</h2><ul>{attention.map((item) => <li key={item.id}>{item.description}</li>)}</ul>{access.includes("resources") && <button type="button" onClick={() => setView({ screen: "resources.list" })}>Open managed resources</button>}{topology === "fleet" && access.includes("clusters") && <button type="button" onClick={() => setView({ screen: "clusters.list" })}>Open clusters</button>}{topology === "unknown" && <p>Fleet registry availability: unknown</p>}</>}
      {view.screen === "resources.list" && <><p>Inventory includes fixture-managed scope and recorded exclusions; it is not all Kubernetes objects.</p>{filter !== undefined && <p>Cluster filter: {filter}</p>}<ul>{resources.map((item) => <li key={item.id}><ResourceFields item={item} /><button type="button" onClick={() => setView({ screen: "resources.detail", resource: item, cluster: filter })}>Open resource {item.name}</button></li>)}</ul></>}
      {view.screen === "resources.detail" && resource && <><button type="button" onClick={() => setView({ screen: "resources.list", cluster: filter })}>Back to managed resources</button><ResourceFields item={resource} /><p>Related cases and requests: no validated fixture relationships supplied.</p></>}
      {view.screen === "clusters.list" && <ul>{clusters.map((item) => <li key={item.id}><p>Registry ID: {item.id}</p><p>Classification: {item.classification || "Unknown"}</p><button type="button" onClick={() => setView({ screen: "clusters.detail", cluster: item.id })}>Open cluster {item.id}</button></li>)}</ul>}
      {view.screen === "clusters.detail" && cluster && <><button type="button" onClick={() => setView({ screen: "clusters.list" })}>Back to clusters</button><p>Registry ID: {cluster.id}</p><p>Classification: {cluster.classification || "Unknown"}</p><p>Operational health, version, provider, node count and last seen: not assessed or recorded.</p>{access.includes("resources") && <button type="button" onClick={() => setView({ screen: "resources.list", cluster: cluster.id })}>Open resources for {cluster.id}</button>}</>}
    </ReadStatePanel>
  </div></ConsoleShell>;
}
/** In-memory presentation only; no adapter, action handler or production route. */
export function FixtureScope({ scope = "fixture-scope-a", topology = "unknown", initialScreen = { screen: "overview" }, status = "ready", access = ["overview", "resources", "clusters"] }: FixtureScopeProps) {
  return <FixtureView key={JSON.stringify([scope, topology, initialScreen, status, access])} scope={scope} topology={topology} initialScreen={initialScreen} status={status} access={access} />;
}
