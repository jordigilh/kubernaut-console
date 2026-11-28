import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { useEffect } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { ConsoleApp } from "./ConsoleApp";

const CHAT_LABEL = "chat-stub";

let chatMounts = 0;

function ChatStub() {
  useEffect(() => { chatMounts += 1; }, []);
  return <div data-testid={CHAT_LABEL}>Chat workspace</div>;
}

function renderApp(props: Partial<Parameters<typeof ConsoleApp>[0]> = {}) {
  render(<ConsoleApp chat={<ChatStub />} {...props} />);
}

async function clickNav(name: string) {
  await act(async () => {
    screen.getByRole("link", { name }).click();
  });
}

describe("UT-CONSOLE-169-050: shared shell renders the accepted navigation", () => {
  afterEach(() => {
    cleanup();
    window.history.replaceState(null, "", "/");
  });

  it("shows Operate, Explore and Manage groups with production routes", () => {
    renderApp();
    const nav = screen.getByRole("navigation", { name: "Console navigation" });
    expect(nav).toBeVisible();
    expect(screen.getByRole("link", { name: "Approvals" })).toHaveAttribute("href", "/approvals");
    expect(screen.getByRole("link", { name: "Workflows" })).toHaveAttribute("href", "/workflows");
    expect(screen.getByRole("link", { name: "Administration" })).toHaveAttribute("href", "/administration");
  });

  it("marks the current section link", async () => {
    renderApp();
    await clickNav("Workflows");
    expect(screen.getByRole("link", { name: "Workflows" })).toHaveAttribute("aria-current", "page");
  });

  it("omits the Clusters link when topology is unknown (never local fallback)", () => {
    renderApp({ topology: "unknown" });
    expect(screen.queryByRole("link", { name: "Clusters" })).toBeNull();
    expect(screen.getByText("Clusters")).toBeVisible();
    expect(screen.getByText("Topology unavailable")).toBeVisible();
  });

  it("keeps Clusters for an authoritative fleet", () => {
    renderApp({ topology: "fleet" });
    expect(screen.getByRole("link", { name: "Clusters" })).toHaveAttribute("href", "/clusters");
  });

  it("fails closed when no section is granted", () => {
    renderApp({ access: [] });
    expect(screen.queryByRole("link")).toBeNull();
  });
});

describe("UT-CONSOLE-169-051: production routing behavior", () => {
  afterEach(() => {
    cleanup();
    window.history.replaceState(null, "", "/");
  });

  it("renders the chat at the root route", () => {
    renderApp();
    expect(screen.getByTestId(CHAT_LABEL)).toBeVisible();
    expect(screen.getByLabelText("Console chat")).toBeVisible();
  });

  it("navigates to a section screen with heading and focus on the new route", async () => {
    renderApp();
    await clickNav("Workflows");
    expect(screen.getByRole("heading", { name: "Workflows", level: 1 })).toBeVisible();
    expect(screen.getByText(/Not live-ready/i)).toBeVisible();
    expect(document.activeElement).toHaveAttribute("aria-label", "Workflows");
  });

  it("keeps the chat mounted but hidden on other routes (view change is not cancellation)", async () => {
    renderApp();
    await clickNav("Approvals");
    expect(screen.getByTestId(CHAT_LABEL)).toBeInTheDocument();
    expect(screen.getByTestId(CHAT_LABEL).closest(".kn-console-chat")).toHaveAttribute("hidden");
  });

  it("does not remount the chat when navigating away and back (O01)", async () => {
    chatMounts = 0;
    renderApp();
    expect(chatMounts).toBe(1);
    await clickNav("Investigations");
    await act(async () => {
      window.history.back();
    });
    await waitFor(() => expect(screen.getByTestId(CHAT_LABEL)).toBeVisible());
    expect(chatMounts).toBe(1);
  });

  it("restores the chat on browser Back", async () => {
    renderApp();
    await clickNav("Investigations");
    expect(screen.getByRole("heading", { name: "Recorded remediation cases" })).toBeVisible();
    await act(async () => {
      window.history.back();
    });
    await waitFor(() => expect(screen.getByTestId(CHAT_LABEL)).toBeVisible());
  });

  it("renders an unknown route as an alert", () => {
    window.history.replaceState(null, "", "/not-a-console-route");
    renderApp();
    expect(screen.getByRole("alert")).toHaveTextContent(/Console route not found/i);
  });

  it("direct detail links show only the requested reference, never another record", () => {
    window.history.replaceState(null, "", "/approvals/review/rar-9");
    renderApp();
    expect(screen.getByRole("heading", { name: "Review remediation" })).toBeVisible();
    expect(screen.getByText(/requestId: rar-9/)).toBeVisible();
    expect(screen.getByText(/kubernaut#2564/)).toBeVisible();
  });

  it("renders exact query filters without widening", () => {
    window.history.replaceState(null, "", "/executions?workflow=wf-demo-01");
    renderApp();
    expect(screen.getByRole("heading", { name: "Execution history" })).toBeVisible();
    expect(screen.getByText(/workflow: wf-demo-01/)).toBeVisible();
  });
});

describe("UT-CONSOLE-169-052: in-memory theme preview", () => {
  afterEach(() => {
    cleanup();
    window.history.replaceState(null, "", "/");
  });

  it("toggles the paired themes without persistence", async () => {
    renderApp();
    const shell = screen.getByRole("navigation", { name: "Console navigation" }).closest(".kn-foundation")!;
    expect(shell).toHaveAttribute("data-theme", "light");
    await act(async () => {
      screen.getByRole("button", { name: "Switch to dark theme" }).click();
    });
    expect(shell).toHaveAttribute("data-theme", "dark");
    expect(screen.getByRole("button", { name: "Switch to light theme" })).toBeVisible();
  });
});
