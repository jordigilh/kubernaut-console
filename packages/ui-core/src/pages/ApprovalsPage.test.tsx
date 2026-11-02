import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ApprovalsPage } from "./ApprovalsPage";
import {
  createApprovalFixtureAdapter,
  type ApprovalListItem,
  type ApprovalReadState,
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

function renderApprovals(adapter: ApprovalReviewAdapter, refreshToken = 0) {
  return render(<ApprovalsPage adapter={adapter} onOpenRequest={vi.fn()} refreshToken={refreshToken} />);
}

describe("ApprovalsPage read failure boundaries", () => {
  it("qualifies the visible count as loaded fixture rows when filtered", async () => {
    renderApprovals(createApprovalFixtureAdapter());
    expect(await screen.findByRole("heading", { name: "Approval requests" })).toBeInTheDocument();
    fireEvent.change(screen.getByRole("searchbox", { name: "Filter loaded fixture requests" }), { target: { value: "rar-demo-01" } });
    expect(screen.getByText(/Showing 1 of \d+ loaded fixture requests/)).toBeInTheDocument();
    expect(screen.queryByText("rar-demo-02")).not.toBeInTheDocument();
  });

  it("shows unavailable when the approval list read rejects", async () => {
    const base = createApprovalFixtureAdapter();
    const adapter: ApprovalReviewAdapter = {
      ...base,
      list: vi.fn().mockRejectedValue(new Error("list read failed")),
    };

    renderApprovals(adapter);

    expect(await screen.findByRole("alert")).toHaveTextContent("approval requests is unavailable");
  });

  it("ignores a late rejected list read after a refresh starts a newer read", async () => {
    const base = createApprovalFixtureAdapter();
    const first = deferred<ApprovalReadState<readonly ApprovalListItem[]>>();
    const second = deferred<ApprovalReadState<readonly ApprovalListItem[]>>();
    const adapter: ApprovalReviewAdapter = {
      ...base,
      list: vi.fn()
        .mockReturnValueOnce(first.promise)
        .mockReturnValueOnce(second.promise),
    };
    const view = renderApprovals(adapter);

    view.rerender(<ApprovalsPage adapter={adapter} onOpenRequest={vi.fn()} refreshToken={1} />);
    await act(async () => second.resolve(await base.list()));
    expect(await screen.findByText("rar-demo-01")).toBeInTheDocument();
    await act(async () => first.reject(new Error("stale list failed")));

    expect(screen.queryByText(/stale list failed/i)).not.toBeInTheDocument();
    expect(screen.queryByText("approval requests is unavailable")).not.toBeInTheDocument();
  });
});
