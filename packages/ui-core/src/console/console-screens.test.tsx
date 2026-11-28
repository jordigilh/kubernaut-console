import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ConsoleRouteNotFound, NotLiveReadyScreen } from "./console-screens";
import { screenHeadings, screenReadinessReasons } from "./screen-content";
import { screenIds } from "./registry";
import type { ConsoleRoute } from "./routes";

function route(screenId: ConsoleRoute["screenId"], params: Record<string, string> = {}, query: Record<string, string> = {}): ConsoleRoute {
  return { screenId, params, query };
}

describe("UT-CONSOLE-169-020: not-live-ready screens are honest about readiness", () => {
  it("covers every screen purpose with a heading and a readiness reason", () => {
    for (const screenId of screenIds) {
      expect(screenHeadings[screenId], screenId).toBeDefined();
      expect(screenReadinessReasons[screenId], screenId).toBeDefined();
    }
  });

  it("renders the review heading, unavailable state and pending contract", () => {
    render(<NotLiveReadyScreen route={route("approvals.review", { requestId: "rar-demo-02" })} />);
    expect(screen.getByRole("heading", { name: "Review remediation", level: 1 })).toBeVisible();
    expect(screen.getByText(/kubernaut#2564/)).toBeVisible();
    expect(screen.getByText("Review remediation: Unavailable")).toBeVisible();
  });

  it("marks the screen as not-live and never claims live readiness", () => {
    const { container } = render(<NotLiveReadyScreen route={route("workflows.catalog")} />);
    expect(container.querySelector("[data-not-live='true']")).not.toBeNull();
    expect(screen.getByRole("note")).toHaveTextContent(/never presented as live data/i);
  });

  it("echoes only the requested reference from the URL", () => {
    render(<NotLiveReadyScreen route={route("clusters.detail", { clusterId: "spoke-a" })} />);
    expect(screen.getByText(/clusterId: spoke-a/)).toBeVisible();
  });

  it("echoes exact query filters without widening them", () => {
    render(<NotLiveReadyScreen route={route("workflows.executions", {}, { workflow: "wf-demo-01" })} />);
    expect(screen.getByText(/workflow: wf-demo-01/)).toBeVisible();
  });
});

describe("UT-CONSOLE-169-021: unknown production routes fail closed", () => {
  it("announces an unknown route without offering a nearest match", () => {
    render(<ConsoleRouteNotFound />);
    expect(screen.getByRole("alert")).toHaveTextContent(/Console route not found/i);
    expect(screen.getByRole("heading", { name: /Console route not found/i, level: 1 })).toBeVisible();
  });
});
