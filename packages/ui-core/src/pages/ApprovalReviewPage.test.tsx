import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ApprovalReviewPage } from "./ApprovalReviewPage";
import {
  FIXTURE_REVIEWER,
  createApprovalFixtureAdapter,
  type ApprovalActor,
  type ApprovalDecisionResult,
  type ApprovalReadState,
  type ApprovalReview,
  type ApprovalReviewAdapter,
} from "../lib/approval-review";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, resolve, reject };
}

async function readFixtureReview(requestId: string): Promise<ApprovalReview> {
  const result = await createApprovalFixtureAdapter().read(requestId);
  if (result.status !== "ready") throw new Error(`Fixture ${requestId} was not ready.`);
  return result.data;
}

function adapterWithReview(review: ApprovalReview): ApprovalReviewAdapter {
  return createApprovalFixtureAdapter({
    reviewStates: {
      [review.id]: {
        status: "ready",
        data: review,
        observedAt: "2026-10-31T14:00:00Z",
      },
    },
  });
}

function renderReview(
  adapter: ApprovalReviewAdapter,
  requestId = "rar-demo-02",
  reviewer: ApprovalActor = FIXTURE_REVIEWER,
) {
  return render(
    <ApprovalReviewPage
      adapter={adapter}
      requestId={requestId}
      reviewer={reviewer}
      onBack={vi.fn()}
    />,
  );
}

describe("ApprovalReviewPage decision boundaries", () => {
  it.each(["unknown", "stale", "forbidden", "expired", "conflict"] as const)(
    "requires an explicit current reread before another send after a %s outcome",
    async (status) => {
      const base = createApprovalFixtureAdapter();
      const read = vi.fn(base.read.bind(base));
      const decide = vi.fn(async (): Promise<ApprovalDecisionResult> => ({
        status,
        message: `Fixture ${status} outcome.`,
      }));
      const adapter: ApprovalReviewAdapter = { ...base, read, decide };

      renderReview(adapter);
      expect(await screen.findByText("Deployment/demo-operator")).toBeInTheDocument();
      fireEvent.change(screen.getByLabelText("Decision reason"), { target: { value: "Needs another review." } });
      fireEvent.click(screen.getByRole("button", { name: "Reject" }));
      fireEvent.click(await screen.findByRole("button", { name: "Confirm Rejected" }));

      await waitFor(() => expect(screen.getByTestId("approval-decision-outcome")).toHaveAttribute("data-outcome", status));
      expect(read).toHaveBeenCalledTimes(2);
      expect(screen.getByRole("button", { name: "Approve" })).toBeDisabled();
      fireEvent.click(screen.getByRole("button", { name: "Approve" }));
      expect(decide).toHaveBeenCalledTimes(1);

      fireEvent.click(screen.getByRole("button", { name: "Re-read current review" }));
      await waitFor(() => expect(read).toHaveBeenCalledTimes(3));
      expect(screen.getByRole("button", { name: "Approve" })).toBeEnabled();
    },
  );

  it("uses the reconciled current state when a failed decision is found resolved", async () => {
    const base = createApprovalFixtureAdapter();
    const pending = await base.read("rar-demo-02");
    const resolved = structuredClone(await base.read("rar-demo-02"));
    if (pending.status !== "ready" || resolved.status !== "ready") throw new Error("Fixture read was not ready.");
    resolved.data.decision = {
      status: "approved",
      decision: "Approved",
      actor: FIXTURE_REVIEWER,
      reason: "Resolved outside this preview.",
      decidedAt: "2026-10-31T14:05:00Z",
    };
    const read = vi.fn()
      .mockResolvedValueOnce(pending)
      .mockResolvedValueOnce(resolved);
    const adapter: ApprovalReviewAdapter = {
      ...base,
      read,
      decide: vi.fn(async (): Promise<ApprovalDecisionResult> => ({ status: "unknown", message: "Write outcome is unknown." })),
    };

    renderReview(adapter);
    expect(await screen.findByText("Deployment/demo-operator")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Decision reason"), { target: { value: "Reviewing the current state." } });
    fireEvent.click(screen.getByRole("button", { name: "Approve" }));
    fireEvent.click(await screen.findByRole("button", { name: "Confirm Approved" }));

    expect(await screen.findByText("Approved by Morgan Lee")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Approve" })).not.toBeInTheDocument();
    expect(screen.getByTestId("approval-decision-outcome")).toHaveAttribute("data-outcome", "unknown");
  });

  it.each([
    ["request ID", { requestId: "rar-demo-03", requestUid: "rar-demo-02-uid" }],
    ["request UID", { requestId: "rar-demo-02", requestUid: "different-uid" }],
  ] as const)("does not apply an accepted receipt with a mismatched %s", async (_field, receiptIdentity) => {
    const base = createApprovalFixtureAdapter();
    const read = vi.fn(base.read.bind(base));
    const adapter: ApprovalReviewAdapter = {
      ...base,
      read,
      decide: vi.fn(async (): Promise<ApprovalDecisionResult> => ({
        status: "accepted",
        receipt: {
          ...receiptIdentity,
          decision: "Approved",
          actor: FIXTURE_REVIEWER,
          reason: "Keep this receipt scoped.",
          decidedAt: "2026-10-31T14:05:00Z",
          source: "fixture",
        },
      })),
    };

    renderReview(adapter);
    expect(await screen.findByText("Deployment/demo-operator")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Decision reason"), { target: { value: "Keep this receipt scoped." } });
    fireEvent.click(screen.getByRole("button", { name: "Approve" }));
    fireEvent.click(await screen.findByRole("button", { name: "Confirm Approved" }));

    await waitFor(() => expect(screen.getByTestId("approval-decision-outcome")).toHaveAttribute("data-outcome", "unknown"));
    expect(read).toHaveBeenCalledTimes(2);
    expect(screen.queryByText("Approved by Morgan Lee")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Approve" })).toBeDisabled();
  });

  it("shows unavailable when the initial review read rejects", async () => {
    const base = createApprovalFixtureAdapter();
    const adapter: ApprovalReviewAdapter = {
      ...base,
      read: vi.fn().mockRejectedValue(new Error("read failed")),
    };

    renderReview(adapter);

    expect(await screen.findByRole("alert")).toHaveTextContent("approval request rar-demo-02 is unavailable");
  });

  it("gates blank reviewer identity, whitespace workflow references, and past deadlines", async () => {
    const blankReviewer: ApprovalActor = { displayName: "  ", principal: "  ", role: "reviewer" };
    const blankReviewerAdapter = createApprovalFixtureAdapter();
    renderReview(blankReviewerAdapter, "rar-demo-02", blankReviewer);
    expect(await screen.findByText("Deployment/demo-operator")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Approve" })).toBeDisabled();
    expect(screen.getByText(/reviewer identity is required/i)).toBeInTheDocument();
  });

  it("does not enable decisions for whitespace workflow references", async () => {
    const review = await readFixtureReview("rar-demo-02");
    review.workflow = { ...review.workflow!, id: "  ", version: "1.0.7" };
    const adapter = adapterWithReview(review);

    renderReview(adapter, review.id);
    expect(await screen.findByText(/Exact workflow ID and version are unknown/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Approve" })).toBeDisabled();
  });

  it("does not enable decisions when the server-issued RAR UID is unknown", async () => {
    const review = await readFixtureReview("rar-demo-02");
    review.uid = "  ";
    const adapter = adapterWithReview(review);

    renderReview(adapter, review.id);
    expect(await screen.findByText(/server-issued RAR UID is unknown/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Approve" })).toBeDisabled();
  });

  it("does not enable decisions when the deadline was already past at read observation", async () => {
    const review = await readFixtureReview("rar-demo-02");
    review.deadline = "2026-10-31T13:59:00Z";
    const adapter = adapterWithReview(review);

    renderReview(adapter, review.id);
    expect(await screen.findByText(/deadline has passed/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reject" })).toBeDisabled();
  });

  it("renders supplied workflow parameters as read-only values", async () => {
    const review = await readFixtureReview("rar-demo-02");
    review.workflow = {
      ...review.workflow!,
      parameters: { memoryLimit: "768Mi", rolloutMode: "gitops" },
    };
    const adapter = adapterWithReview(review);

    renderReview(adapter, review.id);
    expect(await screen.findByText("memoryLimit")).toBeInTheDocument();
    expect(screen.getByText("768Mi")).toBeInTheDocument();
    expect(screen.getByText("rolloutMode")).toBeInTheDocument();
    expect(screen.getByText("gitops")).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "memoryLimit" })).not.toBeInTheDocument();
  });
});

describe("ApprovalReviewPage scope fencing", () => {
  it("ignores a late initial read after the request scope changes", async () => {
    const base = createApprovalFixtureAdapter();
    const read02 = deferred<ApprovalReadState<ApprovalReview>>();
    const read03 = deferred<ApprovalReadState<ApprovalReview>>();
    const adapter: ApprovalReviewAdapter = {
      ...base,
      read: vi.fn((requestId) => requestId === "rar-demo-02" ? read02.promise : read03.promise),
    };
    const view = renderReview(adapter, "rar-demo-02");

    view.rerender(
      <ApprovalReviewPage
        adapter={adapter}
        requestId="rar-demo-03"
        reviewer={FIXTURE_REVIEWER}
        onBack={vi.fn()}
      />,
    );
    await act(async () => read03.resolve(await base.read("rar-demo-03")));
    expect(await screen.findByText("StatefulSet/orders-db")).toBeInTheDocument();
    await act(async () => read02.resolve(await base.read("rar-demo-02")));
    expect(screen.queryByText("Deployment/demo-operator")).not.toBeInTheDocument();
  });

  it("ignores a late rejected initial read after the request scope changes", async () => {
    const base = createApprovalFixtureAdapter();
    const read02 = deferred<ApprovalReadState<ApprovalReview>>();
    const read03 = deferred<ApprovalReadState<ApprovalReview>>();
    const adapter: ApprovalReviewAdapter = {
      ...base,
      read: vi.fn((requestId) => requestId === "rar-demo-02" ? read02.promise : read03.promise),
    };
    const view = renderReview(adapter, "rar-demo-02");

    view.rerender(
      <ApprovalReviewPage
        adapter={adapter}
        requestId="rar-demo-03"
        reviewer={FIXTURE_REVIEWER}
        onBack={vi.fn()}
      />,
    );
    await act(async () => read03.resolve(await base.read("rar-demo-03")));
    expect(await screen.findByText("StatefulSet/orders-db")).toBeInTheDocument();
    await act(async () => read02.reject(new Error("stale read failed")));
    expect(screen.queryByText(/stale read failed/i)).not.toBeInTheDocument();
    expect(screen.queryByText("approval request rar-demo-03 is unavailable")).not.toBeInTheDocument();
  });

  it("ignores a late decision receipt after request scope changes", async () => {
    const base = createApprovalFixtureAdapter();
    const decision = deferred<ApprovalDecisionResult>();
    const adapter: ApprovalReviewAdapter = { ...base, decide: vi.fn(() => decision.promise) };
    const view = renderReview(adapter, "rar-demo-02");

    expect(await screen.findByText("Deployment/demo-operator")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Decision reason"), { target: { value: "Keep this draft scoped." } });
    fireEvent.click(screen.getByRole("button", { name: "Approve" }));
    fireEvent.click(await screen.findByRole("button", { name: "Confirm Approved" }));

    view.rerender(
      <ApprovalReviewPage
        adapter={adapter}
        requestId="rar-demo-03"
        reviewer={FIXTURE_REVIEWER}
        onBack={vi.fn()}
      />,
    );
    expect(await screen.findByText("StatefulSet/orders-db")).toBeInTheDocument();
    await act(async () => decision.resolve({
      status: "accepted",
      receipt: {
        requestId: "rar-demo-02",
        requestUid: "rar-demo-02-uid",
        decision: "Approved",
        actor: FIXTURE_REVIEWER,
        reason: "Keep this draft scoped.",
        decidedAt: "2026-10-31T14:05:00Z",
        source: "fixture",
      },
    }));
    expect(screen.queryByText("Approved by Morgan Lee")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Approve" })).toBeEnabled();
  });

  it("ignores late evidence after request scope changes", async () => {
    const base = createApprovalFixtureAdapter();
    const evidence = deferred<ApprovalReadState<readonly []>>();
    const adapter: ApprovalReviewAdapter = {
      ...base,
      retryEvidence: vi.fn(() => evidence.promise as Promise<ApprovalReadState<readonly import("../lib/approval-review").ApprovalEvidenceItem[]>>),
    };
    const view = renderReview(adapter, "rar-demo-02");

    expect(await screen.findByText("Deployment/demo-operator")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry related evidence" }));
    view.rerender(
      <ApprovalReviewPage
        adapter={adapter}
        requestId="rar-demo-03"
        reviewer={FIXTURE_REVIEWER}
        onBack={vi.fn()}
      />,
    );
    expect(await screen.findByText("StatefulSet/orders-db")).toBeInTheDocument();
    await act(async () => evidence.resolve({ status: "ready", data: [], observedAt: "2026-10-31T14:00:00Z" }));
    expect(screen.queryByTestId("approval-evidence-evt-demo-02")).not.toBeInTheDocument();
    expect(screen.getByText(/event identifier is not supplied/i)).toBeInTheDocument();
  });

  it("clears draft and confirmation when the reviewer scope changes", async () => {
    const adapter = createApprovalFixtureAdapter();
    const view = renderReview(adapter, "rar-demo-02");

    expect(await screen.findByText("Deployment/demo-operator")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Decision reason"), { target: { value: "Reviewer-scoped draft." } });
    fireEvent.click(screen.getByRole("button", { name: "Reject" }));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();

    const replacementReviewer: ApprovalActor = {
      displayName: "Taylor Smith",
      principal: "operator-b-2",
      role: "reviewer",
    };
    view.rerender(
      <ApprovalReviewPage
        adapter={adapter}
        requestId="rar-demo-02"
        reviewer={replacementReviewer}
        onBack={vi.fn()}
      />,
    );

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.getByLabelText("Decision reason")).toHaveValue("");
    expect(screen.queryByText("Reviewer-scoped draft.")).not.toBeInTheDocument();
  });
});
