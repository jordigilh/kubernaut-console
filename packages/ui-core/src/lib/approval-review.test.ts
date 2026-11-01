import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  FIXTURE_REVIEWER,
  createApprovalFixtureAdapter,
  type ApprovalDecisionInput,
  type ApprovalReadState,
  type ApprovalReview,
} from "./approval-review";

describe("approval review fixture model", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-31T14:05:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("keeps every read state explicit instead of collapsing failures into empty data", () => {
    const states: Array<ApprovalReadState<readonly string[]>> = [
      { status: "loading" },
      { status: "ready", data: ["rar-demo-01"], observedAt: "2026-10-31T14:00:00Z" },
      { status: "empty", observedAt: "2026-10-31T14:00:00Z" },
      { status: "partial", data: ["rar-demo-01"], missingFields: ["source.clusterId"], observedAt: "2026-10-31T14:00:00Z" },
      { status: "stale", data: ["rar-demo-01"], observedAt: "2026-10-31T12:00:00Z", staleSince: "2026-10-31T13:00:00Z" },
      { status: "unavailable", message: "The fixture read is unavailable." },
      { status: "forbidden", message: "The fixture reviewer is not authorized." },
      { status: "missing", message: "The requested fixture record was not found." },
    ];

    expect(states.map((state) => state.status)).toEqual([
      "loading",
      "ready",
      "empty",
      "partial",
      "stale",
      "unavailable",
      "forbidden",
      "missing",
    ]);
  });

  it("keeps the proposed workflow ID and version as one exact reference", async () => {
    const adapter = createApprovalFixtureAdapter();
    const result = await adapter.read("rar-demo-02");

    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;

    const workflow = result.data.workflow;
    expect(workflow).not.toBeNull();
    if (!workflow) return;

    expect(workflow).toMatchObject({
      id: "wf-demo-01",
      version: "1.0.7",
    });
    expect(workflow.parameters).toBeNull();
  });

  it("models an operator B decision as Approved or Rejected without using live transport", async () => {
    const adapter = createApprovalFixtureAdapter();
    const input: ApprovalDecisionInput = {
      requestId: "rar-demo-02",
      requestUid: "rar-demo-02-uid",
      decision: "Rejected",
      reason: "The recorded evidence is insufficient for this change.",
      reviewedContentVersion: "rar-demo-02/review-v1",
      reviewer: FIXTURE_REVIEWER,
    };

    const result = await adapter.decide(input);

    expect(result.status).toBe("accepted");
    if (result.status !== "accepted") return;
    expect(result.receipt).toMatchObject({
      requestId: "rar-demo-02",
      requestUid: "rar-demo-02-uid",
      decision: "Rejected",
      actor: FIXTURE_REVIEWER,
      reason: input.reason,
      source: "fixture",
    });

    const review = await adapter.read(input.requestId);
    expect(review.status).toBe("ready");
    if (review.status !== "ready") return;
    expect(review.data.decision).toMatchObject({
      status: "rejected",
      decision: "Rejected",
      reason: input.reason,
    });
  });

  it("does not accept a decision after the fixture record is already resolved", async () => {
    const adapter = createApprovalFixtureAdapter();
    const input: ApprovalDecisionInput = {
      requestId: "rar-demo-01",
      requestUid: "rar-demo-01-uid",
      decision: "Approved",
      reason: "Approved after reviewing the recorded proposal.",
      reviewedContentVersion: "rar-demo-01/review-v1",
      reviewer: FIXTURE_REVIEWER,
    };

    await adapter.decide(input);
    const second = await adapter.decide({ ...input, decision: "Rejected" });

    expect(second.status).toBe("conflict");
  });

  it("rejects a decision bound to a different server-issued RAR UID", async () => {
    const adapter = createApprovalFixtureAdapter();
    const result = await adapter.decide({
      requestId: "rar-demo-02",
      requestUid: "rar-demo-02-other-uid",
      decision: "Approved",
      reason: "The reviewed proposal is acceptable.",
      reviewedContentVersion: "rar-demo-02/review-v1",
      reviewer: FIXTURE_REVIEWER,
    });

    expect(result).toEqual({
      status: "stale",
      message: "The RAR identity is stale. Re-read before deciding.",
    });
  });

  it("returns expired when a finite deadline is at or before the decision time", async () => {
    const base = createApprovalFixtureAdapter();
    const current = await base.read("rar-demo-02");
    if (current.status !== "ready") throw new Error("Fixture read was not ready.");

    const adapter = createApprovalFixtureAdapter({
      reviewStates: {
        "rar-demo-02": {
          ...current,
          data: { ...current.data, deadline: "2026-10-31T14:05:00Z" },
        },
      },
    });
    const result = await adapter.decide({
      requestId: "rar-demo-02",
      requestUid: "rar-demo-02-uid",
      decision: "Approved",
      reason: "The recorded proposal is acceptable.",
      reviewedContentVersion: "rar-demo-02/review-v1",
      reviewer: FIXTURE_REVIEWER,
    });

    expect(result).toEqual({
      status: "expired",
      message: "This fixture approval has expired.",
    });
    const reread = await adapter.read("rar-demo-02");
    expect(reread.status).toBe("ready");
    if (reread.status !== "ready") return;
    expect(reread.data.decision.status).toBe("pending");
  });

  it.each([
    ["missing", null],
    ["invalid", "not-a-date"],
  ] as const)("preserves fixture decision behavior for a %s deadline", async (_label, deadline) => {
    const base = createApprovalFixtureAdapter();
    const current = await base.read("rar-demo-02");
    if (current.status !== "ready") throw new Error("Fixture read was not ready.");

    const adapter = createApprovalFixtureAdapter({
      reviewStates: {
        "rar-demo-02": {
          ...current,
          data: { ...current.data, deadline },
        },
      },
    });
    const result = await adapter.decide({
      requestId: "rar-demo-02",
      requestUid: "rar-demo-02-uid",
      decision: "Approved",
      reason: "The recorded proposal is acceptable.",
      reviewedContentVersion: "rar-demo-02/review-v1",
      reviewer: FIXTURE_REVIEWER,
    });

    expect(result.status).toBe("accepted");
  });

  it("keeps the review model independent from chat approval types", async () => {
    const adapter = createApprovalFixtureAdapter();
    const result = await adapter.read("rar-demo-02");

    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;
    const review: ApprovalReview = result.data;
    expect(review.parentRequestId).toBe("rr-demo-02");
    const submitter = review.submitter;
    expect(submitter).not.toBeNull();
    if (!submitter) return;
    expect(submitter.principal).toBe("operator-a");
    expect(review.reviewer).toBeNull();
  });
});
