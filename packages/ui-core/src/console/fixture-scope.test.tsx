import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FixtureScope, type FixtureScopeScreen } from "./fixture-scope";
import { findScopeCluster, findScopeResource, scopeFixtures, validAttention } from "./scope-fixtures";

const scope = "fixture-scope-a";
const resource = scopeFixtures.resources[0];

describe("fixture scope identity", () => {
  it("requires exact unique resource and cluster identities across scopes", () => {
    expect(findScopeResource(scopeFixtures, scope, resource)).toBe(resource);
    for (const key of [{ ...resource, id: "" }, { ...resource, namespace: "other" }, { ...resource, apiVersion: "v1" }, { ...resource, cluster: "missing" }]) expect(findScopeResource(scopeFixtures, scope, key)).toBeUndefined();
    expect(findScopeResource(scopeFixtures, "other", resource)).toBeUndefined();
    expect(findScopeResource({ ...scopeFixtures, resources: [resource, { ...resource, sourceScope: "other" }] }, scope, resource)).toBeUndefined();
    expect(findScopeResource({ ...scopeFixtures, resources: [resource, { ...resource, id: "another" }] }, scope, resource)).toBeUndefined();
    expect(findScopeCluster({ ...scopeFixtures, clusters: [...scopeFixtures.clusters, { ...scopeFixtures.clusters[0], sourceScope: "other" }] }, scope, resource.cluster)).toBeUndefined();
    expect(findScopeResource({ ...scopeFixtures, clusters: [] }, scope, resource)).toBeUndefined();
    expect(validAttention({ ...scopeFixtures, attention: [scopeFixtures.attention[0], scopeFixtures.attention[0]] }, scope)).toEqual([]);
  });
});

describe("scope fixture presentation", () => {
  it.each(["fleet", "local", "unknown"] as const)("retains %s topology", (topology) => {
    render(<FixtureScope topology={topology} />);
    expect(screen.getByText(`Fixture topology: ${topology}`)).toBeInTheDocument();
    expect(screen.getByText(/Completeness: Partial fixture inventory/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Open clusters" })).toBe(topology === "fleet" ? screen.getByRole("button", { name: "Open clusters" }) : null);
  });
  it.each([["loading", "Loading"], ["empty", "No results"], ["unavailable", "Unavailable"], ["forbidden", "Access denied"], ["missing", "Missing or out of scope"]] as const)("withholds records and provenance for %s", (status, text) => {
    render(<FixtureScope status={status} initialScreen={{ screen: "resources.detail", resource }} />);
    expect(screen.getByText(new RegExp(text))).toBeInTheDocument();
    expect(screen.queryByText(/checkout|Synthetic scope fixture|Completeness:/)).not.toBeInTheDocument();
  });
  it.each(["ready", "partial", "stale"] as const)("shows supplied provenance for %s", (status) => {
    render(<FixtureScope status={status} initialScreen={{ screen: "resources.detail", resource }} />);
    expect(screen.getByText(/Source: Synthetic scope fixture/)).toHaveTextContent("2026-01-01T00:00:00Z");
    expect(screen.getByText("Effective scope: managed")).toBeInTheDocument();
  });
  it("shows inheritance, exclusion and cluster-scoped boundaries without actions", () => {
    const fetch = vi.spyOn(globalThis, "fetch");
    render(<FixtureScope topology="fleet" initialScreen={{ screen: "resources.list" }} />);
    expect(screen.getByText(/Fixture records namespace inheritance/)).toBeInTheDocument();
    expect(screen.getByText(/Fixture records explicit resource exclusion/)).toBeInTheDocument();
    expect(screen.getByText("Namespace: Not applicable — cluster-scoped")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^(run|select|retry|edit|delete|manage|exclude)\b/i })).not.toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled(); fetch.mockRestore();
  });
  it("rejects invalid direct filters and access without revealing records", () => {
    const invalid: FixtureScopeScreen = { screen: "resources.list", cluster: "missing" };
    const { rerender } = render(<FixtureScope topology="fleet" initialScreen={invalid} />);
    expect(screen.getByText(/Missing or out of scope/)).toBeInTheDocument();
    expect(screen.queryByText(/checkout|Synthetic scope fixture/)).not.toBeInTheDocument();
    rerender(<FixtureScope topology="fleet" access={["overview"]} initialScreen={{ screen: "resources.detail", resource }} />);
    expect(screen.getByText(/Access denied/)).toBeInTheDocument();
    expect(screen.queryByText(/checkout|Synthetic scope fixture/)).not.toBeInTheDocument();
  });
  it.each(["local", "unknown"] as const)("keeps cluster direct links unavailable in %s", (topology) => {
    render(<FixtureScope topology={topology} initialScreen={{ screen: "clusters.detail", cluster: "cluster-fixture-a" }} />);
    expect(screen.getByText(/Unavailable/)).toBeInTheDocument();
    expect(screen.queryByText(/Registry ID:|Synthetic scope fixture/)).not.toBeInTheDocument();
  });
  it("opens the exact filtered inventory and preserves its filter on return", () => {
    render(<FixtureScope topology="fleet" initialScreen={{ screen: "clusters.list" }} />);
    fireEvent.click(screen.getByRole("button", { name: "Open cluster cluster-fixture-a" }));
    fireEvent.click(screen.getByRole("button", { name: "Open resources for cluster-fixture-a" }));
    fireEvent.click(screen.getByRole("button", { name: "Open resource checkout" }));
    fireEvent.click(screen.getByRole("button", { name: "Back to managed resources" }));
    expect(screen.getByText("Cluster filter: cluster-fixture-a")).toBeInTheDocument();
  });
});
