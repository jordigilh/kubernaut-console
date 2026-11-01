import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ApprovalConsole } from "./ApprovalConsole";
import { FIXTURE_REVIEWER, createApprovalFixtureAdapter } from "../lib/approval-review";

async function createOpenDecisionAdapter() {
  const base = createApprovalFixtureAdapter();
  const current = await base.read("rar-demo-02");
  if (current.status !== "ready") throw new Error("Fixture read was not ready.");

  return createApprovalFixtureAdapter({
    reviewStates: {
      "rar-demo-02": {
        ...current,
        data: {
          ...current.data,
          deadline: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        },
      },
    },
  });
}

describe("ApprovalConsole fixture journey", () => {
  it("takes operator B from the inbox to an immutable confirmation and an Approved result", async () => {
    const adapter = await createOpenDecisionAdapter();
    render(
      <ApprovalConsole
        adapter={adapter}
        reviewer={FIXTURE_REVIEWER}
      />,
    );

    expect(await screen.findByRole("heading", { name: "Approvals" })).toBeInTheDocument();
    expect(screen.getByText(/No originating investigation session is required/)).toBeInTheDocument();
    expect(screen.getByText("Fixture preview — no live decision is submitted")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Review rar-demo-02" }));

    expect(screen.getByRole("heading", { name: "Review remediation" })).toBeInTheDocument();
    expect(await screen.findByText("Deployment/demo-operator")).toBeInTheDocument();
    expect(screen.getByText("Deployment/demo-operator")).toBeInTheDocument();
    expect(screen.getByText("increase-memory-limits-gitops-v1")).toBeInTheDocument();
    expect(screen.getByText("Workflow version")).toBeInTheDocument();
    expect(screen.getByText("1.0.7")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Related evidence is unavailable");
    expect(screen.getByRole("button", { name: "Approve" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Reject" })).toBeEnabled();

    fireEvent.change(screen.getByLabelText("Decision reason"), {
      target: { value: "Approved after reviewing the recorded proposal." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Approve" }));

    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("Confirm Approved");
    expect(dialog).toHaveTextContent("Deployment/demo-operator");
    expect(dialog).toHaveTextContent("spoke-a");
    expect(dialog).toHaveTextContent("Morgan Lee");
    expect(dialog).toHaveTextContent("Approved after reviewing the recorded proposal.");

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Confirm Approved" }));
    });

    expect(screen.getByText("Approved", { selector: "strong" })).toBeInTheDocument();
    expect(screen.getByText(/Approved by Morgan Lee/)).toBeInTheDocument();
    expect(screen.getByText("Approved after reviewing the recorded proposal.")).toBeInTheDocument();
  });

  it("keeps actions enabled when optional related evidence is unavailable and retries only that read", async () => {
    render(
      <ApprovalConsole
        adapter={createApprovalFixtureAdapter()}
        reviewer={FIXTURE_REVIEWER}
        initialRequestId="rar-demo-02"
      />,
    );

    expect(await screen.findByText("Deployment/demo-operator")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Related evidence is unavailable");
    const reason = screen.getByLabelText("Decision reason");
    fireEvent.change(reason, { target: { value: "Reviewing the available request context." } });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Retry related evidence" }));
    });

    expect(screen.getByTestId("approval-evidence-evt-demo-02")).toHaveTextContent("OOMKilled restarts were reported.");
    expect(screen.getByLabelText("Decision reason")).toHaveValue("Reviewing the available request context.");
    expect(screen.getByRole("button", { name: "Approve" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Reject" })).toBeEnabled();
  });

  it("renders a forbidden inbox without exposing fixture request rows", async () => {
    render(
      <ApprovalConsole
        adapter={createApprovalFixtureAdapter({
          listState: { status: "forbidden", message: "Approval inbox access is not authorized." },
        })}
        reviewer={FIXTURE_REVIEWER}
      />,
    );

    expect(await screen.findByRole("alert")).toHaveTextContent("Approval inbox access is not authorized.");
    expect(screen.queryByText("rar-demo-02")).not.toBeInTheDocument();
  });

  it("keeps a failed decision visible and does not claim acceptance", async () => {
    const adapter = createApprovalFixtureAdapter({
      decide: async () => ({ status: "unknown", message: "The fixture write outcome is unknown." }),
    });

    render(
      <ApprovalConsole
        adapter={adapter}
        reviewer={FIXTURE_REVIEWER}
        initialRequestId="rar-demo-02"
      />,
    );

    expect(screen.getByRole("heading", { name: "Review remediation" })).toBeInTheDocument();
    expect(await screen.findByText("Deployment/demo-operator")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Decision reason"), { target: { value: "Needs another review." } });
    fireEvent.click(screen.getByRole("button", { name: "Reject" }));
    fireEvent.click(await screen.findByRole("button", { name: "Confirm Rejected" }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("write outcome is unknown");
    });
    expect(screen.queryByText(/Rejected by Morgan Lee/)).not.toBeInTheDocument();
  });

  it("records a Rejected result through the same confirmation boundary", async () => {
    const adapter = await createOpenDecisionAdapter();
    render(
      <ApprovalConsole
        adapter={adapter}
        reviewer={FIXTURE_REVIEWER}
        initialRequestId="rar-demo-02"
      />,
    );

    expect(await screen.findByText("Deployment/demo-operator")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Decision reason"), { target: { value: "Rejecting the recorded proposal." } });
    fireEvent.click(screen.getByRole("button", { name: "Reject" }));
    expect(await screen.findByRole("dialog")).toHaveTextContent("Confirm Rejected");
    fireEvent.click(screen.getByRole("button", { name: "Confirm Rejected" }));

    expect(await screen.findByText("Rejected by Morgan Lee")).toBeInTheDocument();
  });

  it("starts on pending requests, shows status, and keeps resolved rows behind an explicit filter", async () => {
    render(
      <ApprovalConsole
        adapter={createApprovalFixtureAdapter({
          listState: {
            status: "ready",
            observedAt: "2026-10-31T14:00:00Z",
            data: [
              {
                id: "rar-pending",
                parentRequestId: "rr-pending",
                target: { kind: "Deployment", name: "pending-api", namespace: "payments" },
                source: { clusterId: "spoke-a", environment: "Production" },
                submitter: null,
                createdAt: "2026-10-31T13:00:00Z",
                deadline: "2026-10-31T15:00:00Z",
                status: "pending",
              },
              {
                id: "rar-approved",
                parentRequestId: "rr-approved",
                target: { kind: "Deployment", name: "approved-api", namespace: "payments" },
                source: { clusterId: "spoke-a", environment: "Production" },
                submitter: null,
                createdAt: "2026-10-31T12:00:00Z",
                deadline: "2026-10-31T13:00:00Z",
                status: "approved",
              },
            ],
          },
        })}
      />,
    );

    expect(await screen.findByRole("combobox", { name: "Approval status filter" })).toHaveValue("pending");
    expect(screen.getByText("rar-pending")).toBeInTheDocument();
    expect(screen.getByText("Pending", { selector: "span" })).toBeInTheDocument();
    expect(screen.queryByText("rar-approved")).not.toBeInTheDocument();

    fireEvent.change(screen.getByRole("combobox", { name: "Approval status filter" }), { target: { value: "all" } });
    expect(screen.getByText("rar-approved")).toBeInTheDocument();
    expect(screen.getByText("Approved", { selector: "span" })).toBeInTheDocument();
  });

  it("keeps the accepted priority navigation and deferred More destinations explicit", async () => {
    render(<ApprovalConsole adapter={createApprovalFixtureAdapter()} />);

    expect(screen.getByRole("img", { name: "Kubernaut" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Approvals" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByText("Investigations")).toHaveAttribute("aria-disabled", "true");

    const more = screen.getByRole("button", { name: "More" });
    expect(more).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(more);
    expect(more).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("heading", { name: "Explore" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Manage" })).toBeInTheDocument();
    expect(screen.getAllByText("Deferred in fixture preview").length).toBeGreaterThan(0);

    fireEvent.keyDown(document, { key: "Escape" });
    expect(more).toHaveAttribute("aria-expanded", "false");
    expect(more).toHaveFocus();
  });
});
