import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useConsoleRoute } from "./use-console-route";

function Harness() {
  const { route, navigate } = useConsoleRoute();
  return (
    <div>
      <output data-testid="screen">{route ? route.screenId : "null"}</output>
      <output data-testid="pathname">{window.location.pathname}</output>
      <button type="button" onClick={() => navigate("/approvals")}>go</button>
      <button type="button" onClick={() => navigate("/approvals")}>go-again</button>
    </div>
  );
}

function currentPath(): string {
  return window.location.pathname + window.location.search;
}

async function renderHarness() {
  render(<Harness />);
  return {
    screen: () => screen.getByTestId("screen").textContent,
    go: () => act(async () => { screen.getByRole("button", { name: "go" }).click(); }),
    goAgain: () => act(async () => { screen.getByRole("button", { name: "go-again" }).click(); }),
  };
}

describe("UT-CONSOLE-169-010: history routing hook", () => {
  afterEach(() => {
    window.history.replaceState(null, "", "/");
    vi.restoreAllMocks();
  });

  it("resolves the initial route from the current location", async () => {
    window.history.replaceState(null, "", "/");
    const h = await renderHarness();
    expect(h.screen()).toBe("chat");
  });

  it("navigates via pushState and resolves the new route", async () => {
    const h = await renderHarness();
    await h.go();
    expect(h.screen()).toBe("approvals.inbox");
    expect(currentPath()).toBe("/approvals");
  });

  it("does not push a duplicate history entry for the same path", async () => {
    const pushSpy = vi.spyOn(window.history, "pushState");
    const h = await renderHarness();
    await h.go();
    await h.goAgain();
    expect(h.screen()).toBe("approvals.inbox");
    expect(pushSpy).toHaveBeenCalledTimes(1);
    pushSpy.mockRestore();
  });

  it("follows browser Back/Forward through popstate", async () => {
    const h = await renderHarness();
    await h.go();
    await act(async () => {
      window.history.back();
    });
    await waitFor(() => expect(h.screen()).toBe("chat"));
    await act(async () => {
      window.history.forward();
    });
    await waitFor(() => expect(h.screen()).toBe("approvals.inbox"));
  });

  it("resolves query filters on the current route", async () => {
    window.history.replaceState(null, "", "/executions?workflow=wf-demo-01");
    const h = await renderHarness();
    expect(h.screen()).toBe("workflows.executions");
  });

  it("reports unknown routes as null", async () => {
    window.history.replaceState(null, "", "/not-a-route");
    const h = await renderHarness();
    expect(h.screen()).toBe("null");
  });
});
