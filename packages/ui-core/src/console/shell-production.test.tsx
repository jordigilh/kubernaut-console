import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ConsoleShell } from "./foundation";
import { navigationFor } from "./registry";
import type { NavigationId } from "./registry";

const ALL: NavigationId[] = ["approvals", "investigations", "overview", "workflows", "resources", "clusters", "policies", "administration"];

const HREFS: Partial<Record<NavigationId, string>> = {
  approvals: "/approvals",
  investigations: "/investigations",
  overview: "/overview",
  workflows: "/workflows",
  resources: "/resources",
  clusters: "/clusters",
  policies: "/policies",
  administration: "/administration",
};

describe("UT-CONSOLE-169-030: production link availability", () => {
  it("links every in-scope section when productionLinks is set", () => {
    const items = navigationFor(ALL, "fleet", { productionLinks: true });
    expect(items.every((item) => item.availability === "available")).toBe(true);
  });

  it("keeps clusters topology-unknown even with productionLinks", () => {
    const items = navigationFor(ALL, "unknown", { productionLinks: true });
    expect(items.find((item) => item.id === "clusters")?.availability).toBe("topology-unknown");
  });

  it("keeps local topology without clusters", () => {
    const items = navigationFor(ALL, "local", { productionLinks: true });
    expect(items.find((item) => item.id === "clusters")).toBeUndefined();
  });

  it("preserves the fixture study behavior when productionLinks is absent", () => {
    const items = navigationFor(ALL, "fleet");
    expect(items.find((item) => item.id === "approvals")?.availability).toBe("available");
    expect(items.find((item) => item.id === "workflows")?.availability).toBe("deferred");
  });
});

describe("UT-CONSOLE-169-031: shell SPA navigation", () => {
  it("routes ordinary link clicks through the host navigator", () => {
    const onNavigate = vi.fn();
    render(
      <ConsoleShell access={ALL} topology="fleet" hrefs={HREFS} productionLinks onNavigate={onNavigate}>
        <p>content</p>
      </ConsoleShell>,
    );
    fireEvent.click(screen.getByRole("link", { name: "Workflows" }));
    expect(onNavigate).toHaveBeenCalledWith("/workflows");
  });

  it("keeps native behavior for modified clicks and new tabs", () => {
    const onNavigate = vi.fn();
    render(
      <ConsoleShell access={ALL} topology="fleet" hrefs={HREFS} productionLinks onNavigate={onNavigate}>
        <p>content</p>
      </ConsoleShell>,
    );
    fireEvent.click(screen.getByRole("link", { name: "Workflows" }), { ctrlKey: true });
    fireEvent.click(screen.getByRole("link", { name: "Workflows" }), { metaKey: true });
    fireEvent.click(screen.getByRole("link", { name: "Workflows" }), { shiftKey: true });
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it("renders header actions in the shell header", () => {
    render(
      <ConsoleShell access={ALL} topology="fleet" hrefs={HREFS} headerActions={<button type="button">toggle</button>}>
        <p>content</p>
      </ConsoleShell>,
    );
    expect(screen.getByRole("button", { name: "toggle" })).toBeVisible();
  });
});
