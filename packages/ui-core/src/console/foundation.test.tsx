import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { ConsoleShell, FixtureApprovalWorkspace, ReadStatePanel } from "./foundation";
import { navigationFor } from "./registry";
import { screenIds } from "./registry";
import inventory from "../../../../docs/design/console/screen-inventory.json";

describe("source-only console foundation", () => {
  afterEach(() => vi.unstubAllGlobals());

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
    const more = screen.getByRole("button", { name: /More/ });
    fireEvent.click(more);
    const outside = screen.getByRole("button", { name: "Outside" });
    outside.focus();
    fireEvent.pointerDown(outside);
    expect(more).toHaveAttribute("aria-expanded", "false");
    expect(outside).toHaveFocus();
  });

  it("identifies a current secondary section without marking More as a page", () => {
    render(<ConsoleShell access={["overview"]} topology="unknown" current="overview" hrefs={{}}><h1>Overview</h1></ConsoleShell>);
    const more = screen.getByRole("button", { name: "More, current section: Overview" });
    expect(more).toHaveAttribute("title", "Current section: Overview");
    expect(more).not.toHaveAttribute("aria-current");
    expect(more).toHaveAttribute("data-current", "true");
  });

  it("moves focus from disappearing More to the current visible link on desktop", () => {
    let change: ((event: MediaQueryListEvent) => void) | undefined;
    const media = { matches: true, addEventListener: vi.fn((_type, listener) => { change = listener; }), removeEventListener: vi.fn() };
    vi.stubGlobal("matchMedia", vi.fn(() => media));
    render(<ConsoleShell access={["approvals", "overview"]} topology="unknown" current="approvals" hrefs={{ approvals: "/approvals" }}><h1>Approvals</h1></ConsoleShell>);
    const more = screen.getByRole("button", { name: "More" });
    fireEvent.click(more);
    more.focus();
    act(() => change?.({ matches: false } as MediaQueryListEvent));
    expect(screen.getByRole("link", { name: "Approvals" })).toHaveFocus();
    expect(more).toHaveAttribute("aria-expanded", "false");
  });

  it("moves focus to the main region when no navigation link exists on desktop", () => {
    let change: ((event: MediaQueryListEvent) => void) | undefined;
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: true, addEventListener: (_: string, listener: typeof change) => { change = listener; }, removeEventListener: vi.fn() })));
    render(<ConsoleShell access={["overview"]} topology="unknown" current="overview" hrefs={{}}><h1>Overview</h1></ConsoleShell>);
    screen.getByRole("button", { name: /More/ }).focus();
    act(() => change?.({ matches: false } as MediaQueryListEvent));
    expect(screen.getByRole("main")).toHaveFocus();
  });

  it("repairs focus if hiding More has already moved focus to the body", () => {
    let change: ((event: MediaQueryListEvent) => void) | undefined;
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: true, addEventListener: (_: string, listener: typeof change) => { change = listener; }, removeEventListener: vi.fn() })));
    render(<ConsoleShell access={["approvals", "overview"]} topology="unknown" current="approvals" hrefs={{ approvals: "/approvals" }}><h1>Approvals</h1></ConsoleShell>);
    const more = screen.getByRole("button", { name: "More" });
    more.focus();
    more.blur();
    act(() => change?.({ matches: false } as MediaQueryListEvent));
    expect(screen.getByRole("link", { name: "Approvals" })).toHaveFocus();
  });

  it("keeps a focused secondary link exposed when moving to phone width", () => {
    let change: ((event: MediaQueryListEvent) => void) | undefined;
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false, addEventListener: (_: string, listener: typeof change) => { change = listener; }, removeEventListener: vi.fn() })));
    const { container } = render(<ConsoleShell access={["overview"]} topology="unknown" current="overview" hrefs={{}}><h1>Overview</h1></ConsoleShell>);
    // Exercise the shared breakpoint boundary without making a deferred destination actionable.
    const link = document.createElement("a");
    link.href = "#test";
    container.querySelector(".kn-foundation-secondary")!.append(link);
    link.focus();
    act(() => change?.({ matches: true } as MediaQueryListEvent));
    expect(screen.getByRole("button", { name: /More/ })).toHaveAttribute("aria-expanded", "true");
    expect(link).toHaveFocus();
  });

  it("composes the existing approval pages with a fixture-only label", async () => {
    render(<FixtureApprovalWorkspace />);
    expect(screen.getByText(/Fixture preview — no live decision/)).toBeInTheDocument();
    fireEvent.click(await screen.findByRole("button", { name: "Review rar-demo-02" }));
    expect(await screen.findByText("Deployment/demo-operator")).toBeInTheDocument();
  });
});
