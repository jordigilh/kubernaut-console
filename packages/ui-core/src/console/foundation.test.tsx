import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { ConsoleShell, FixtureApprovalWorkspace, ReadStatePanel } from "./foundation";
import { navigationFor } from "./registry";
import { screenIds } from "./registry";
import inventory from "../../../../docs/design/console/screen-inventory.json";

describe("source-only console foundation", () => {
  it("does not mount the fixture workspace in the standalone app", () => {
    const app = readFileSync("../standalone/src/App.tsx", "utf8");
    expect(app).not.toMatch(/FixtureApprovalWorkspace|ApprovalConsole|ConsoleShell/);
  });
  it("keeps topology unknown distinct from local and fleet", () => {
    expect([...screenIds].sort()).toEqual(inventory.screens.map((item) => item.screenId).sort());
    const access = ["approvals", "clusters"] as const;
    expect(navigationFor(access, "fleet").find((item) => item.id === "clusters")?.availability).toBe("deferred");
    expect(navigationFor(access, "local").some((item) => item.id === "clusters")).toBe(false);
    expect(navigationFor(access, "unknown").find((item) => item.id === "clusters")?.availability).toBe("topology-unknown");
    expect(navigationFor(["approvals"], "fleet").map((item) => item.id)).toEqual(["approvals"]);
  });

  it("exposes only provided destinations, with deferred destinations not links", () => {
    render(<ConsoleShell access={["approvals", "investigations", "overview"]} topology="unknown" current="approvals" hrefs={{ approvals: "/fixture/approvals" }}><h1>Fixture</h1></ConsoleShell>);
    expect(screen.getByRole("link", { name: "Approvals" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByText("Investigations").closest("a")).toBeNull();
    expect(screen.queryByText("Clusters")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "More" }));
    expect(screen.getByText("Overview")).toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole("navigation"), { key: "Escape" });
    expect(screen.getByRole("button", { name: "More" })).toHaveFocus();
  });

  it("does not render protected children on forbidden or missing reads", () => {
    const retry = vi.fn();
    const { rerender } = render(<ReadStatePanel state={{ status: "forbidden" }} label="Records" onRetry={retry}><p>secret</p></ReadStatePanel>);
    expect(screen.queryByText("secret")).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    rerender(<ReadStatePanel state={{ status: "unavailable" }} label="Records" onRetry={retry}><p>secret</p></ReadStatePanel>);
    fireEvent.click(screen.getByRole("button", { name: "Retry Records" }));
    expect(retry).toHaveBeenCalledOnce();
    rerender(<ReadStatePanel state={{ status: "partial", provenance: { source: "Fixture", observedAt: "2026-01-01" } }} label="Records"><p>safe data</p></ReadStatePanel>);
    expect(screen.getByText("safe data")).toBeInTheDocument();
    expect(screen.getByText(/Fixture/)).toBeInTheDocument();
  });

  it.each(["loading", "empty", "unavailable", "forbidden", "missing"] as const)("hides supplied content for %s", (status) => {
    render(<ReadStatePanel state={{ status }} label="Records"><p>protected data</p></ReadStatePanel>);
    expect(screen.queryByText("protected data")).not.toBeInTheDocument();
  });

  it("closes More on an outside pointer without stealing focus", () => {
    render(<><ConsoleShell access={["overview"]} topology="unknown" current="overview" hrefs={{}}><h1>Fixture</h1></ConsoleShell><button>Outside</button></>);
    const more = screen.getByRole("button", { name: "More" });
    fireEvent.click(more);
    const outside = screen.getByRole("button", { name: "Outside" });
    outside.focus();
    fireEvent.pointerDown(outside);
    expect(more).toHaveAttribute("aria-expanded", "false");
    expect(outside).toHaveFocus();
  });

  it("composes the existing approval pages with a fixture-only label", async () => {
    render(<FixtureApprovalWorkspace />);
    expect(screen.getByText(/Fixture preview — no live decision/)).toBeInTheDocument();
    fireEvent.click(await screen.findByRole("button", { name: "Review rar-demo-02" }));
    expect(await screen.findByText("Deployment/demo-operator")).toBeInTheDocument();
  });
});
