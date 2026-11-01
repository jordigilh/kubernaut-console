import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FixtureGovernance, type FixtureGovernanceScreen } from "./fixture-governance";
import { findGovernanceCase, findGovernanceEvent, findGovernancePolicy, findGovernanceRule, findGovernanceSetting, governanceFixtures as data } from "./governance-fixtures";

const scope = "fixture-scope-a";
describe("governance fixture relationships", () => {
  it("requires exact, unique identities and scoped relationships", () => {
    expect(findGovernancePolicy(data, scope, "approval-fixture")).toBe(data.policies[0]);
    expect(findGovernancePolicy(data, scope, "missing")).toBeUndefined();
    expect(findGovernancePolicy({ ...data, policies: [...data.policies, data.policies[0]] }, scope, "approval-fixture")).toBeUndefined();
    expect(findGovernanceRule({ ...data, rules: [data.rules[0], data.rules[0]] }, scope, "scope-override")).toBeUndefined();
    expect(findGovernanceSetting(data, "other", "access-fixture")).toBeUndefined();
    expect(findGovernanceCase(data, scope, "")).toBeUndefined();
    expect(findGovernanceEvent(data, scope, "event-fixture-1", "case-fixture-1")).toBe(data.events[0]);
    expect(findGovernanceEvent(data, scope, "event-fixture-1", "other")).toBeUndefined();
    expect(findGovernanceEvent({ ...data, cases: [...data.cases, data.cases[0]] }, scope, "event-fixture-1")).toBeUndefined();
    expect(findGovernanceEvent({ ...data, events: [...data.events, { ...data.events[0], scope: "other" }] }, scope, "event-fixture-1")).toBeUndefined();
  });
});

describe("read-only governance screens", () => {
  it.each(["loading", "empty", "unavailable", "forbidden", "missing"] as const)("withholds content and provenance for %s", (status) => {
    render(<FixtureGovernance status={status} initialScreen={{ screen: "audit.event", eventId: "event-fixture-1" }} />);
    expect(screen.queryByText(/fixture-service|Synthetic governance fixture|Completeness:/)).not.toBeInTheDocument();
  });
  it.each(["ready", "partial", "stale"] as const)("preserves supplied content and provenance for %s", (status) => {
    render(<FixtureGovernance status={status} initialScreen={{ screen: "audit.event", eventId: "event-fixture-1" }} />);
    expect(screen.getByText(/Source: Synthetic governance fixture/)).toHaveTextContent("2026-01-01T00:00:00Z");
    expect(screen.getByText("Actor: fixture-service")).toBeInTheDocument();
  });
  it("keeps historical hash and revision distinct from current values", () => {
    render(<FixtureGovernance initialScreen={{ screen: "policies.approval", policyId: "approval-fixture" }} />);
    expect(screen.getByText("Recorded revision: revision-recorded")).toBeInTheDocument();
    expect(screen.getByText("Recorded hash: Unknown")).toBeInTheDocument();
    expect(screen.getByText("Current revision: revision-current")).toBeInTheDocument();
    expect(screen.getByText("Current threshold: Unknown")).toBeInTheDocument();
  });
  it("shows supplied scope precedence without computing it", () => {
    render(<FixtureGovernance initialScreen={{ screen: "policies.scope" }} />);
    expect(screen.getByText("Resource label: false")).toBeInTheDocument();
    expect(screen.getByText("Provenance: Namespace inheritance")).toBeInTheDocument();
    expect(screen.getByText("Namespace label: Not applicable — no inheritance")).toBeInTheDocument();
  });
  it("keeps actor, initiator and reviewer separate and returns to the exact filter", () => {
    render(<FixtureGovernance initialScreen={{ screen: "governance.audit", caseId: "case-fixture-1" }} />);
    fireEvent.click(screen.getByRole("button", { name: "Open event event-fixture-1" }));
    expect(screen.getByText("Actor kind: service")).toBeInTheDocument();
    expect(screen.getByText("Initiator: fixture-initiator")).toBeInTheDocument();
    expect(screen.getByText("Reviewer: fixture-reviewer")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Back to audit trail" }));
    expect(screen.getByText("Case filter: case-fixture-1")).toBeInTheDocument();
  });
  it("filters only loaded audit records without changing case scope", () => {
    render(<FixtureGovernance initialScreen={{ screen: "governance.audit", caseId: "case-fixture-1" }} />);
    fireEvent.change(screen.getByLabelText("Search loaded events"), { target: { value: "not-present" } });
    expect(screen.getByText("No matching loaded events.")).toBeInTheDocument();
    expect(screen.getByText("Case filter: case-fixture-1")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Search loaded events"), { target: { value: "fixture-service" } });
    fireEvent.change(screen.getByLabelText("Outcome"), { target: { value: "recorded" } });
    expect(screen.getByText("Event ID: event-fixture-1")).toBeInTheDocument();
  });
  it.each<FixtureGovernanceScreen>([{ screen: "governance.audit", caseId: "missing" }, { screen: "audit.event", eventId: "event-fixture-1", caseId: "missing" }, { screen: "policies.approval", policyId: "missing" }, { screen: "settings.platform", settingId: "access-fixture" }])("fails closed on invalid direct screen $screen", (initialScreen) => {
    render(<FixtureGovernance initialScreen={initialScreen} />);
    expect(screen.getByText(/Missing or out of scope/)).toBeInTheDocument();
    expect(screen.queryByText(/fixture-service|Synthetic governance fixture|Completeness:/)).not.toBeInTheDocument();
  });
  it("does not grant audit from policy access", () => {
    const { rerender } = render(<FixtureGovernance access={["policy"]} />);
    expect(screen.queryByRole("button", { name: "Open audit trail" })).not.toBeInTheDocument();
    rerender(<FixtureGovernance access={["policy"]} initialScreen={{ screen: "audit.event", eventId: "event-fixture-1" }} />);
    expect(screen.getByText(/Access denied/)).toBeInTheDocument();
    expect(screen.queryByText(/fixture-service|Synthetic governance fixture/)).not.toBeInTheDocument();
  });
  it("keeps browser, platform and trusted access ownership separate", () => {
    render(<FixtureGovernance initialScreen={{ screen: "administration" }} />);
    fireEvent.click(screen.getByRole("button", { name: "Open console settings" }));
    fireEvent.click(screen.getByRole("button", { name: "Preview dark theme" }));
    expect(screen.getByText("Theme preview: dark")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Back to administration" }));
    fireEvent.click(screen.getByRole("button", { name: "Open platform settings" }));
    expect(screen.getByText("Ownership source: Operator / GitOps")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Back to administration" }));
    fireEvent.click(screen.getByRole("button", { name: "Open access context" }));
    expect(screen.getByText("Trusted principal: Unknown")).toBeInTheDocument();
    expect(screen.getByText(/Display name, avatar and email/)).toBeInTheDocument();
  });
  it("offers no mutation or privileged controls or network requests", () => {
    const fetch = vi.spyOn(globalThis, "fetch");
    render(<FixtureGovernance initialScreen={{ screen: "governance.audit" }} />);
    expect(screen.queryByRole("button", { name: /^(run|select|retry|edit|delete|test|deploy|manage|exclude|save|restart|rollback|assign)\b/i })).not.toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled(); fetch.mockRestore();
  });
});
