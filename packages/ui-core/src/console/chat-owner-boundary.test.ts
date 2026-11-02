import { describe, expect, it, vi } from "vitest";
import { createChatOwnerBoundary, type ChatOwnerScope } from "./chat-owner-boundary";

const scope: ChatOwnerScope = { source: "source-a", issuer: "issuer-a", subject: "subject-a", authSession: "session-a", conversation: "conversation-a" };

describe("source-only chat owner boundary", () => {
  it("fails closed for missing or malformed verified scope", () => {
    const boundary = createChatOwnerBoundary();
    expect(boundary.activate(null)).toBeNull();
    expect(boundary.activate({ ...scope, subject: "" })).toBeNull();
    expect(boundary.activate({ ...scope, source: " source-a" })).toBeNull();
  });

  it("retains one generation for the same complete scope and does not retain caller mutations", () => {
    const boundary = createChatOwnerBoundary();
    const supplied = { ...scope };
    const first = boundary.activate(supplied)!;
    supplied.subject = "different";
    expect(boundary.activate(scope)).toBe(first);
    expect(first.signal.aborted).toBe(false);
    expect(boundary.activate(supplied)).not.toBe(first);
    expect(first.signal.aborted).toBe(true);
  });

  it.each(["source", "issuer", "subject", "authSession", "conversation"] as const)("fences the old owner when %s changes", (field) => {
    const boundary = createChatOwnerBoundary();
    const old = boundary.activate(scope)!;
    expect(boundary.resumeAuthenticated({ ...scope, authSession: "unexpected" })).toBeNull();
    const current = boundary.activate({ ...scope, [field]: "different" })!;
    const effect = vi.fn();
    expect(old.signal.aborted).toBe(true);
    expect(old.runIfCurrent(effect)).toBe(false);
    expect(old.invalidate()).toBe(false);
    expect(current.runIfCurrent(effect)).toBe(true);
    expect(effect).toHaveBeenCalledOnce();
    expect(current.isCurrent()).toBe(true);
  });

  it("fences before abort listeners and delayed callbacks can write after invalidation", async () => {
    const boundary = createChatOwnerBoundary();
    const old = boundary.activate(scope)!;
    const write = vi.fn();
    old.signal.addEventListener("abort", () => old.runIfCurrent(write));
    const delayed = Promise.resolve().then(() => old.runIfCurrent(write));
    boundary.invalidate();
    expect(await delayed).toBe(false);
    expect(write).not.toHaveBeenCalled();
    expect(old.signal.aborted).toBe(true);
  });

  it("does not permit abort listeners to activate a successor during invalid-scope teardown", () => {
    const boundary = createChatOwnerBoundary();
    const old = boundary.activate(scope)!;
    let reentrant: ReturnType<typeof boundary.activate> | undefined;
    old.signal.addEventListener("abort", () => { reentrant = boundary.activate({ ...scope, authSession: "session-b" }); });
    expect(boundary.activate(null)).toBeNull();
    expect(reentrant).toBeNull();
    expect(old.isCurrent()).toBe(false);
    expect(boundary.activate({ ...scope, authSession: "session-b" })?.isCurrent()).toBe(true);
  });

  it("prevents old cleanup from invalidating the next login", () => {
    const boundary = createChatOwnerBoundary();
    const old = boundary.activate(scope)!;
    boundary.invalidate();
    const next = boundary.activate({ ...scope, authSession: "session-b" })!;
    expect(old.invalidate()).toBe(false);
    expect(next.isCurrent()).toBe(true);
    expect(next.signal.aborted).toBe(false);
  });

  it("allows the current lease to invalidate itself exactly once", () => {
    const boundary = createChatOwnerBoundary();
    const lease = boundary.activate(scope)!;
    expect(lease.invalidate()).toBe(true);
    expect(lease.signal.aborted).toBe(true);
    expect(lease.invalidate()).toBe(false);
    expect(lease.isCurrent()).toBe(false);
  });

  it("does not overwrite a newer login created synchronously by an abort listener", () => {
    const boundary = createChatOwnerBoundary();
    const old = boundary.activate(scope)!;
    let newer: ReturnType<typeof boundary.activate> = null;
    old.signal.addEventListener("abort", () => { newer = boundary.activate({ ...scope, authSession: "newer" }); });
    const superseded = boundary.activate({ ...scope, authSession: "intermediate" });
    expect(superseded).toBeNull();
    expect(newer!.isCurrent()).toBe(true);
    expect(old.isCurrent()).toBe(false);
  });

  it("requires explicit invalidation even when a subsequent login has the same scope values", () => {
    const boundary = createChatOwnerBoundary();
    const old = boundary.activate(scope)!;
    boundary.invalidate();
    const next = boundary.activate(scope)!;
    expect(next).not.toBe(old);
    expect(old.isCurrent()).toBe(false);
    expect(next.isCurrent()).toBe(true);
  });

  it("locks logout against abort-listener reactivation until a separate authenticated transition", () => {
    const boundary = createChatOwnerBoundary();
    const old = boundary.activate(scope)!;
    let duringAbort: ReturnType<typeof boundary.activate> | undefined;
    let attemptedResume: ReturnType<typeof boundary.activate> | undefined;
    old.signal.addEventListener("abort", () => {
      duringAbort = boundary.activate(scope);
      boundary.logout();
      attemptedResume = boundary.resumeAuthenticated({ ...scope, authSession: "session-b" });
    });
    boundary.logout();
    expect(duringAbort).toBeNull();
    expect(attemptedResume).toBeNull();
    expect(boundary.activate(scope)).toBeNull();
    expect(boundary.resumeAuthenticated(null)).toBeNull();
    expect(boundary.resumeAuthenticated(scope)).toBeNull();
    expect(boundary.activate(scope)).toBeNull();
    const next = boundary.resumeAuthenticated({ ...scope, authSession: "session-b" })!;
    expect(next.isCurrent()).toBe(true);
    expect(old.isCurrent()).toBe(false);
  });

  it("keeps an ownerless logout locked until a verified fresh authentication transition", () => {
    const boundary = createChatOwnerBoundary();
    boundary.logout();
    expect(boundary.activate(scope)).toBeNull();
    expect(boundary.resumeAuthenticated(null)).toBeNull();
    expect(boundary.activate(scope)).toBeNull();
    const lease = boundary.resumeAuthenticated(scope);
    expect(lease?.isCurrent()).toBe(true);
  });

  it("rejects delayed lease-guarded callbacks after logout and a new login", async () => {
    const boundary = createChatOwnerBoundary();
    const old = boundary.activate(scope)!;
    const writes: string[] = [];
    let release!: () => void;
    const pending = new Promise<void>((resolve) => { release = resolve; }).then(() => old.runIfCurrent(() => writes.push("old")));
    boundary.logout();
    const next = boundary.resumeAuthenticated({ ...scope, authSession: "session-b" })!;
    expect(next.runIfCurrent(() => writes.push("new"))).toBe(true);
    release();
    expect(await pending).toBe(false);
    expect(old.invalidate()).toBe(false);
    expect(next.isCurrent()).toBe(true);
    expect(writes).toEqual(["new"]);
  });
});
