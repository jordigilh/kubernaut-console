import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { FixtureConsole } from "./fixture-console";

function route(hash: string) {
  act(() => { window.history.pushState(null, "", hash || window.location.pathname); window.dispatchEvent(new HashChangeEvent("hashchange")); });
}

describe("fixture-only console routing", () => {
  afterEach(() => window.history.replaceState(null, "", window.location.pathname));

  it.each([
    ["approvals", /approvals/i], ["investigations", /recorded investigations/i],
    ["overview", /^overview$/i], ["workflows", /workflow catalog/i],
    ["resources", /managed resources/i], ["clusters", /^clusters$/i],
    ["policies", /policies & audit/i], ["administration", /^administration$/i],
  ])("renders the %s synthetic section under one shell", (section, heading) => {
    window.history.replaceState(null, "", `#fixture/${section}`);
    render(<FixtureConsole />);
    expect(screen.getAllByRole("navigation", { name: "Console navigation" })).toHaveLength(1);
    expect(within(screen.getByRole("main")).getByRole("heading", { name: heading, level: 1 })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: section === "resources" ? "Managed resources" : section === "policies" ? "Policies & audit" : new RegExp(`^${section}$`, "i") })).toHaveAttribute("aria-current", "page");
  });

  it("responds to hash navigation and never falls back for unknown addresses", () => {
    render(<FixtureConsole />);
    route("#fixture/workflows");
    expect(screen.getByRole("heading", { name: "Workflow catalog" })).toBeInTheDocument();
    route("#fixture/not-real");
    expect(screen.getByRole("heading", { name: "Fixture route not found" })).toBeInTheDocument();
    expect(screen.queryByText("Workflow catalog")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { current: "page" })).not.toBeInTheDocument();
  });

  it.each(["local", "unknown"] as const)("denies the cluster fixture for %s topology", (topology) => {
    window.history.replaceState(null, "", "#fixture/clusters");
    render(<FixtureConsole topology={topology} />);
    expect(screen.getByRole("heading", { name: "Clusters unavailable" })).toBeInTheDocument();
    expect(screen.queryByText(/Registry ID:/)).not.toBeInTheDocument();
  });

  it("keeps internal fixture detail navigation without adding another shell", () => {
    window.history.replaceState(null, "", "#fixture/investigations");
    render(<FixtureConsole />);
    fireEvent.click(screen.getAllByRole("button", { name: /Open case/ })[0]);
    expect(screen.getByRole("heading", { name: "Recorded case" })).toBeInTheDocument();
    expect(screen.getAllByRole("navigation", { name: "Console navigation" })).toHaveLength(1);
  });

  it("does not mount the fixture console in standalone", () => {
    expect(readFileSync("../standalone/src/App.tsx", "utf8")).not.toMatch(/FixtureConsole/);
  });
});
