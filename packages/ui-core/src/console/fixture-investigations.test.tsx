import { fireEvent, render, screen, within } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { FixtureInvestigations } from "./fixture-investigations";
import { findFixtureCase, findFixtureWorkspace, investigationFixtures, type FixtureInvestigationData } from "./investigation-fixtures";

const scope = "fixture-scope-a";
const caseId = "rr-fixture-01";
const workspaceId = "workspace-fixture-01";

describe("fixture investigation identity boundaries", () => {
  it("resolves only an exact unique case in the supplied scope", () => {
    expect(findFixtureCase(investigationFixtures, scope, caseId)?.id).toBe(caseId);
    for (const [source, id] of [[scope, "missing"], ["other", caseId], [scope, ""], ["", caseId]]) {
      expect(findFixtureCase(investigationFixtures, source, id)).toBeUndefined();
    }
    const duplicate = { ...investigationFixtures, cases: [investigationFixtures.cases[0], investigationFixtures.cases[0]] };
    expect(findFixtureCase(duplicate, scope, caseId)).toBeUndefined();
  });

  it("requires one exact verified relationship within the same source scope", () => {
    const link = investigationFixtures.relationships[0];
    const variants: FixtureInvestigationData[] = [
      { ...investigationFixtures, relationships: [] },
      { ...investigationFixtures, relationships: [link, link] },
      { ...investigationFixtures, relationships: [{ ...link, verification: "denied" }] },
      { ...investigationFixtures, relationships: [{ ...link, verification: "unverified" }] },
      { ...investigationFixtures, relationships: [{ ...link, sourceScope: "other" }] },
      { ...investigationFixtures, relationships: [{ ...link, caseId: "other" }] },
      { ...investigationFixtures, relationships: [{ ...link, workspaceId: " " }] },
    ];
    expect(findFixtureWorkspace(investigationFixtures, scope, caseId)?.workspaceId).toBe(workspaceId);
    expect(findFixtureWorkspace(investigationFixtures, scope, "rr-fixture-02")).toBeUndefined();
    for (const data of variants) expect(findFixtureWorkspace(data, scope, caseId)).toBeUndefined();
    expect(findFixtureWorkspace(investigationFixtures, "other", caseId)).toBeUndefined();
  });
});

describe("fixture-only investigation presentation", () => {
  it.each([
    ["loading", "Loading"], ["empty", "No results"], ["unavailable", "Unavailable"],
    ["forbidden", "Access denied"], ["missing", "Missing or out of scope"],
  ] as const)("withholds records, counts and provenance for %s", (status, label) => {
    render(<FixtureInvestigations status={status} initialScreen={{ screen: "investigations.case", caseId }} />);
    expect(screen.getByText(new RegExp(label))).toBeInTheDocument();
    expect(screen.queryByText(/rr-fixture-01|target-namespace|Loaded cases|Synthetic investigation fixture/)).not.toBeInTheDocument();
  });

  it.each(["ready", "partial", "stale"] as const)("shows exact fixture provenance for %s", (status) => {
    render(<FixtureInvestigations status={status} />);
    expect(screen.getByText(/Source: Synthetic investigation fixture/)).toHaveTextContent("2026-01-01T00:00:00Z");
    expect(screen.getByText("Loaded cases: 2")).toBeInTheDocument();
    if (status !== "ready") expect(screen.getByText(new RegExp(status, "i"))).toBeInTheDocument();
  });

  it("never exposes protected content on wrong scope, missing case or mismatched workspace direct views", () => {
    const { rerender } = render(<FixtureInvestigations scope="other" />);
    expect(screen.getByText(/Missing or out of scope/)).toBeInTheDocument();
    expect(screen.queryByText(/Loaded cases|rr-fixture|Synthetic investigation fixture/)).not.toBeInTheDocument();
    rerender(<FixtureInvestigations initialScreen={{ screen: "investigations.case", caseId: "no-such-case" }} />);
    expect(screen.getByText(/Missing or out of scope/)).toBeInTheDocument();
    expect(screen.queryByText(/rr-fixture-01|target-namespace/)).not.toBeInTheDocument();
    rerender(<FixtureInvestigations initialScreen={{ screen: "investigations.workspace", caseId, workspaceId: "other" }} />);
    expect(screen.getByText(/Missing or out of scope/)).toBeInTheDocument();
    expect(screen.queryByText(/target-namespace|Recorded lifecycle/)).not.toBeInTheDocument();
    rerender(<FixtureInvestigations initialScreen={{ screen: "investigations.workspace", caseId: "rr-fixture-02", workspaceId }} />);
    expect(screen.getByText(/Missing or out of scope/)).toBeInTheDocument();
    expect(screen.queryByText(/historical-alert|Recorded lifecycle/)).not.toBeInTheDocument();
  });

  it("keeps Alert and RCA scope distinct and never invents a historical workspace", () => {
    render(<FixtureInvestigations initialScreen={{ screen: "investigations.case", caseId }} />);
    const alert = screen.getByRole("heading", { name: "Original Alert scope" }).parentElement!;
    const target = screen.getByRole("heading", { name: "RCA target scope" }).parentElement!;
    expect(within(alert).getByText("alert-namespace")).toBeInTheDocument();
    expect(within(alert).queryByText("target-namespace")).not.toBeInTheDocument();
    expect(within(target).getByText("target-namespace")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Back to investigations" }));
    expect(screen.queryByRole("button", { name: "Open existing workspace rr-fixture-02" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Open case rr-fixture-02" }));
    expect(screen.queryByRole("button", { name: /Open existing workspace/ })).not.toBeInTheDocument();
    expect(within(screen.getByRole("heading", { name: "RCA target scope" }).parentElement!).getAllByText("Not captured")).toHaveLength(3);
  });

  it("navigates only recorded fixture views, without transport, storage or operational actions", () => {
    const fetch = vi.spyOn(globalThis, "fetch");
    const storage = vi.spyOn(Storage.prototype, "setItem");
    const { container, unmount } = render(<FixtureInvestigations />);
    expect(container.querySelector('[data-screen="investigations.list"]')).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: `Open existing workspace ${caseId}` }));
    expect(container.querySelector('[data-screen="investigations.workspace"]')).toBeInTheDocument();
    expect(screen.getByText(/Conversation, live status and driver are not available/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Back to case" }));
    expect(screen.getByText(`RR ID: ${caseId}`)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /start|claim|reconnect|approve|cancel|execute/i })).not.toBeInTheDocument();
    unmount();
    expect(fetch).not.toHaveBeenCalled();
    expect(storage).not.toHaveBeenCalled();
    fetch.mockRestore();
    storage.mockRestore();
    expect(readFileSync("../standalone/src/App.tsx", "utf8")).not.toContain("FixtureInvestigations");
    expect(readFileSync("src/index.ts", "utf8")).toContain('export { FixtureInvestigations } from "./console/fixture-investigations"');
  });

  it("drops the previously visible case immediately when scope changes", () => {
    const { rerender } = render(<FixtureInvestigations initialScreen={{ screen: "investigations.case", caseId }} />);
    expect(screen.getByText("target-namespace")).toBeInTheDocument();
    rerender(<FixtureInvestigations scope="other" initialScreen={{ screen: "investigations.case", caseId }} />);
    expect(screen.queryByText("target-namespace")).not.toBeInTheDocument();
    expect(screen.getByText(/Missing or out of scope/)).toBeInTheDocument();
  });

  it("withholds a previously loaded list and its count when access is denied", () => {
    const { rerender } = render(<FixtureInvestigations />);
    expect(screen.getByText("Loaded cases: 2")).toBeInTheDocument();
    rerender(<FixtureInvestigations status="forbidden" />);
    expect(screen.getByText(/Access denied/)).toBeInTheDocument();
    expect(screen.queryByText(/Loaded cases|rr-fixture|Synthetic investigation fixture/)).not.toBeInTheDocument();
  });
});
