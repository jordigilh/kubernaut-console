import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ApprovalDecisionConfirmation } from "../components/ApprovalDecisionConfirmation";
import { ApprovalReadStatePanel } from "../components/ApprovalReadState";
import {
  formatApprovalTimestamp,
  formatTarget,
  formatUnknown,
  type ApprovalActor,
  type ApprovalDataState,
  type ApprovalDecision,
  type ApprovalDecisionResult,
  type ApprovalDecisionSnapshot,
  type ApprovalReadState,
  type ApprovalReview,
  type ApprovalReviewAdapter,
} from "../lib/approval-review";

interface Props {
  adapter: ApprovalReviewAdapter;
  requestId: string;
  reviewer: ApprovalActor;
  onBack: () => void;
}

type SubmissionState = "idle" | "submitting" | "reconciling" | "accepted" | "error";

type DecisionFailureStatus = Exclude<ApprovalDecisionResult["status"], "accepted">;

interface DecisionOutcome {
  status: DecisionFailureStatus;
  message: string;
}

interface ScopeToken {
  adapter: ApprovalReviewAdapter;
  requestId: string;
  reviewerKey: string;
}

interface ReviewScopeToken extends ScopeToken {
  reviewFingerprint: string;
}

interface PendingConfirmation {
  decision: ApprovalDecision;
  snapshot: ApprovalDecisionSnapshot;
  scope: ReviewScopeToken;
}

function isDataState(state: ApprovalReadState<ApprovalReview>): state is ApprovalDataState<ApprovalReview> {
  return state.status === "ready" || state.status === "partial" || state.status === "stale";
}

function decisionLabel(status: ApprovalReview["decision"]["status"]): string {
  switch (status) {
    case "approved":
      return "Approved";
    case "rejected":
      return "Rejected";
    case "expired":
      return "Expired";
    case "decided-elsewhere":
      return "Decided elsewhere";
    default:
      return "Pending";
  }
}

function reviewerScopeKey(reviewer: ApprovalActor): string {
  return [reviewer.principal, reviewer.displayName, reviewer.role].join("\u0000");
}

function sameScope(left: ScopeToken, right: ScopeToken): boolean {
  return left.adapter === right.adapter && left.requestId === right.requestId && left.reviewerKey === right.reviewerKey;
}

function reviewFingerprint(review: ApprovalReview): string {
  return [
    review.id,
    review.uid ?? "",
    review.source.clusterId ?? "",
    review.source.environment ?? "",
    review.target.kind ?? "",
    review.target.name ?? "",
    review.target.namespace ?? "",
    review.reviewedContentVersion,
  ].join("\u0000");
}

function hasReviewerIdentity(reviewer: ApprovalActor): boolean {
  return Boolean(reviewer.displayName.trim() && reviewer.principal.trim());
}

function hasExactWorkflow(review: ApprovalReview): boolean {
  return Boolean(review.workflow?.id.trim() && review.workflow.version.trim());
}

function hasOpenDeadline(deadline: string | null, observedAt: string): boolean {
  if (!deadline) return false;
  const deadlineTime = Date.parse(deadline);
  const observedTime = Date.parse(observedAt);
  return Number.isFinite(deadlineTime) && Number.isFinite(observedTime) && deadlineTime > observedTime;
}

function isDecisionEligible(
  state: ApprovalReadState<ApprovalReview>,
  requestId: string,
  reviewer: ApprovalActor,
): boolean {
  if (state.status !== "ready") return false;
  return (
    state.data.id === requestId &&
    state.data.decision.status === "pending" &&
    Boolean(state.data.reviewedContentVersion.trim()) &&
    hasReviewerIdentity(reviewer) &&
    hasExactWorkflow(state.data) &&
    hasOpenDeadline(state.data.deadline, state.observedAt)
  );
}

function decisionOutcomeLabel(status: DecisionFailureStatus): string {
  switch (status) {
    case "unknown":
      return "Decision outcome unknown";
    case "stale":
      return "Decision rejected as stale";
    case "forbidden":
      return "Decision not authorized";
    case "expired":
      return "Decision expired";
    case "conflict":
      return "Decision conflict";
  }
}

function getDecisionGuardMessages(
  state: ApprovalReadState<ApprovalReview>,
  requestId: string,
  reviewer: ApprovalActor,
): string[] {
  if (!isDataState(state)) return [];
  const messages: string[] = [];
  if (state.status !== "ready") messages.push("The current review read is not fresh enough for a decision.");
  if (state.data.id !== requestId) messages.push("The current read does not match this request.");
  if (!hasReviewerIdentity(reviewer)) messages.push("A non-blank reviewer identity is required before deciding.");
  if (!hasExactWorkflow(state.data)) messages.push("Exact workflow ID and version are unknown.");
  if (!state.data.deadline) {
    messages.push("Approval deadline is unknown.");
  } else if (!Number.isFinite(Date.parse(state.data.deadline))) {
    messages.push("Approval deadline is invalid.");
  } else if (!hasOpenDeadline(state.data.deadline, state.observedAt)) {
    messages.push("Approval deadline has passed.");
  }
  if (!state.data.reviewedContentVersion.trim()) messages.push("The reviewed content version is unknown.");
  return messages;
}

export function ApprovalReviewPage({ adapter, requestId, reviewer, onBack }: Props) {
  const reviewerKey = reviewerScopeKey(reviewer);
  const scope = useMemo<ScopeToken>(() => ({ adapter, requestId, reviewerKey }), [adapter, requestId, reviewerKey]);
  const scopeRef = useRef<ScopeToken>(scope);
  useLayoutEffect(() => {
    scopeRef.current = scope;
  }, [scope]);

  const [readState, setReadState] = useState<ApprovalReadState<ApprovalReview>>({ status: "loading" });
  const readStateRef = useRef(readState);
  useLayoutEffect(() => {
    readStateRef.current = readState;
  }, [readState]);
  const [loadedScope, setLoadedScope] = useState<ScopeToken | null>(null);
  const [reason, setReason] = useState("");
  const [reasonScope, setReasonScope] = useState<ScopeToken | null>(null);
  const [reasonError, setReasonError] = useState<string | null>(null);
  const [pendingConfirmation, setPendingConfirmation] = useState<PendingConfirmation | null>(null);
  const [submissionState, setSubmissionState] = useState<SubmissionState>("idle");
  const [decisionGate, setDecisionGate] = useState<"blocked" | "ready">("blocked");
  const [decisionOutcome, setDecisionOutcome] = useState<DecisionOutcome | null>(null);
  const [evidenceRetrying, setEvidenceRetrying] = useState(false);

  const scopedReadState: ApprovalReadState<ApprovalReview> =
    loadedScope && sameScope(loadedScope, scope) ? readState : { status: "loading" };
  const currentReason = reasonScope && sameScope(reasonScope, scope) ? reason : "";
  const currentReviewFingerprint = isDataState(scopedReadState) ? reviewFingerprint(scopedReadState.data) : null;
  const visiblePendingConfirmation = pendingConfirmation &&
    sameScope(pendingConfirmation.scope, scope) &&
    pendingConfirmation.scope.reviewFingerprint === currentReviewFingerprint
    ? pendingConfirmation
    : null;

  const isCurrentExternalScope = (candidate: ScopeToken): boolean =>
    sameScope(scopeRef.current, candidate);

  const isCurrentReviewScope = (candidate: ReviewScopeToken): boolean =>
    isCurrentExternalScope(candidate) &&
    isDataState(readStateRef.current) &&
    reviewFingerprint(readStateRef.current.data) === candidate.reviewFingerprint;

  useEffect(() => {
    const readScope = scope;
    let active = true;
    const loading: ApprovalReadState<ApprovalReview> = { status: "loading" };
    readStateRef.current = loading;
    setReason("");
    setReasonScope(null);
    setReasonError(null);
    setPendingConfirmation(null);
    setSubmissionState("idle");
    setDecisionGate("blocked");
    setDecisionOutcome(null);
    setEvidenceRetrying(false);
    readScope.adapter.read(readScope.requestId).then((next) => {
      if (!active || !isCurrentExternalScope(readScope)) return;
      readStateRef.current = next;
      setReadState(next);
      setLoadedScope(readScope);
      setDecisionGate(isDecisionEligible(next, readScope.requestId, reviewer) ? "ready" : "blocked");
    });
    return () => {
      active = false;
    };
  }, [scope, reviewer]);

  const rereadCurrentReview = async () => {
    if (submissionState === "reconciling") return;
    const readScope = scope;
    setSubmissionState("reconciling");
    setDecisionGate("blocked");
    const loading: ApprovalReadState<ApprovalReview> = { status: "loading" };
    readStateRef.current = loading;
    setReadState(loading);
    setLoadedScope(readScope);

    try {
      const next = await readScope.adapter.read(readScope.requestId);
      if (!isCurrentExternalScope(readScope)) return;
      readStateRef.current = next;
      setReadState(next);
      setLoadedScope(readScope);
      setDecisionGate(isDecisionEligible(next, readScope.requestId, reviewer) ? "ready" : "blocked");
      setSubmissionState("error");
    } catch {
      const next: ApprovalReadState<ApprovalReview> = {
        status: "unavailable",
        message: "The current fixture review could not be re-read.",
      };
      if (!isCurrentExternalScope(readScope)) return;
      readStateRef.current = next;
      setReadState(next);
      setLoadedScope(readScope);
      setSubmissionState("error");
    }
  };

  const reconcileDecision = async (
    outcome: DecisionOutcome,
    decisionScope: ReviewScopeToken,
  ) => {
    setDecisionOutcome(outcome);
    setPendingConfirmation(null);
    setDecisionGate("blocked");
    setSubmissionState("reconciling");

    try {
      const next = await decisionScope.adapter.read(decisionScope.requestId);
      if (!isCurrentExternalScope(decisionScope)) return;
      readStateRef.current = next;
      setReadState(next);
      setLoadedScope(decisionScope);
      setDecisionGate("blocked");
      setSubmissionState("error");
    } catch {
      const next: ApprovalReadState<ApprovalReview> = {
        status: "unavailable",
        message: "The current fixture review could not be re-read after the decision outcome.",
      };
      if (!isCurrentExternalScope(decisionScope)) return;
      readStateRef.current = next;
      setReadState(next);
      setLoadedScope(decisionScope);
      setSubmissionState("error");
    }
  };

  const currentReviewState = scopedReadState;
  const review = isDataState(currentReviewState) ? currentReviewState.data : null;
  const isPending = review?.decision.status === "pending";
  const guardMessages = isPending ? getDecisionGuardMessages(currentReviewState, requestId, reviewer) : [];
  const canDecide = Boolean(
    review &&
      isDecisionEligible(currentReviewState, requestId, reviewer) &&
      decisionGate === "ready" &&
      submissionState !== "submitting" &&
      submissionState !== "reconciling",
  );

  const selectDecision = (decision: ApprovalDecision) => {
    if (!canDecide || !review) return;
    if (!currentReason.trim()) {
      setReasonError("Enter a neutral reason before choosing Approve or Reject.");
      return;
    }
    setReasonError(null);
    setDecisionOutcome(null);
    const decisionScope: ReviewScopeToken = {
      ...scope,
      reviewFingerprint: reviewFingerprint(review),
    };
    setPendingConfirmation({
      decision,
      scope: decisionScope,
      snapshot: Object.freeze({
        requestId: review.id,
        target: Object.freeze({ ...review.target }),
        source: Object.freeze({ ...review.source }),
        deadline: review.deadline,
        reviewer,
        reason: currentReason.trim(),
        reviewedContentVersion: review.reviewedContentVersion,
      }),
    });
  };

  const confirmDecision = async () => {
    if (!visiblePendingConfirmation || submissionState === "submitting" || submissionState === "reconciling") return;
    const { decision, snapshot, scope: decisionScope } = visiblePendingConfirmation;
    if (!isCurrentReviewScope(decisionScope)) {
      setPendingConfirmation(null);
      return;
    }
    setSubmissionState("submitting");
    let result: ApprovalDecisionResult;
    try {
      result = await decisionScope.adapter.decide({
        requestId: snapshot.requestId,
        decision,
        reason: snapshot.reason,
        reviewedContentVersion: snapshot.reviewedContentVersion,
        reviewer: snapshot.reviewer,
      });
    } catch {
      result = { status: "unknown", message: "The fixture decision outcome is unknown." };
    }
    if (!isCurrentReviewScope(decisionScope)) return;
    if (result.status !== "accepted") {
      await reconcileDecision({ status: result.status, message: result.message }, decisionScope);
      return;
    }

    const current = readStateRef.current;
    if (!isDataState(current) || reviewFingerprint(current.data) !== decisionScope.reviewFingerprint) return;
    const next: ApprovalReadState<ApprovalReview> = {
      ...current,
      data: {
        ...current.data,
        reviewer: result.receipt.actor,
        decision: {
          status: result.receipt.decision === "Approved" ? "approved" : "rejected",
          decision: result.receipt.decision,
          actor: result.receipt.actor,
          reason: result.receipt.reason,
          decidedAt: result.receipt.decidedAt,
        },
      },
    };
    readStateRef.current = next;
    setReadState(next);
    setLoadedScope(decisionScope);
    setDecisionGate("blocked");
    setDecisionOutcome(null);
    setPendingConfirmation(null);
    setSubmissionState("accepted");
  };

  const retryEvidence = async () => {
    if (evidenceRetrying || !review) return;
    const evidenceScope: ReviewScopeToken = { ...scope, reviewFingerprint: reviewFingerprint(review) };
    if (!isCurrentReviewScope(evidenceScope)) return;
    setEvidenceRetrying(true);
    setReadState((current) => {
      if (!isDataState(current) || reviewFingerprint(current.data) !== evidenceScope.reviewFingerprint) return current;
      const next = { ...current, data: { ...current.data, relatedEvidence: { status: "loading" } as const } };
      readStateRef.current = next;
      return next;
    });
    try {
      const nextEvidence = await evidenceScope.adapter.retryEvidence(evidenceScope.requestId);
      if (!isCurrentReviewScope(evidenceScope)) return;
      const current = readStateRef.current;
      if (!isDataState(current) || reviewFingerprint(current.data) !== evidenceScope.reviewFingerprint) return;
      const next: ApprovalReadState<ApprovalReview> = {
        ...current,
        data: { ...current.data, relatedEvidence: nextEvidence },
      };
      readStateRef.current = next;
      setReadState(next);
    } finally {
      if (isCurrentExternalScope(evidenceScope)) setEvidenceRetrying(false);
    }
  };

  if (!isDataState(currentReviewState)) {
    return (
      <section aria-labelledby="approval-review-heading">
        <button type="button" onClick={onBack}>← Back to Approvals</button>
        <h1 id="approval-review-heading">Review remediation</h1>
        {decisionOutcome && (
          <DecisionOutcomePanel outcome={decisionOutcome} onReread={rereadCurrentReview} reading={submissionState === "reconciling"} />
        )}
        <ApprovalReadStatePanel state={currentReviewState} label={`approval request ${requestId}`} />
      </section>
    );
  }

  if (!review) return null;

  return (
    <section aria-labelledby="approval-review-heading">
      <button type="button" onClick={onBack}>← Back to Approvals</button>
      <div className="kn-approval-page-heading">
        <div>
          <h1 id="approval-review-heading">Review remediation</h1>
          <p>{review.id} · Submitted by {review.submitter?.displayName ?? "Unknown"}</p>
        </div>
        <span className="kn-approval-badge">{decisionLabel(review.decision.status)}</span>
      </div>

      <ApprovalReadStatePanel state={currentReviewState} label="RAR review">
        <dl className="kn-approval-ledger" aria-label="Recorded request ledger">
          <div><dt>Request</dt><dd>{review.id}</dd></div>
          <div><dt>Parent request</dt><dd>{formatUnknown(review.parentRequestId)}</dd></div>
          <div><dt>Recorded target</dt><dd>{formatTarget(review.target)}</dd></div>
          <div><dt>Namespace</dt><dd>{formatUnknown(review.target.namespace)}</dd></div>
          <div><dt>Source cluster</dt><dd>{formatUnknown(review.source.clusterId)}</dd></div>
          <div><dt>Environment</dt><dd>{formatUnknown(review.source.environment)}</dd></div>
          <div><dt>Approval deadline</dt><dd>{formatApprovalTimestamp(review.deadline)}</dd></div>
          <div><dt>Submitted by</dt><dd>{review.submitter?.displayName ?? "Unknown"}</dd></div>
          <div><dt>Current reviewer</dt><dd>{review.reviewer?.displayName ?? reviewer.displayName}</dd></div>
        </dl>

        {decisionOutcome && (
          <DecisionOutcomePanel outcome={decisionOutcome} onReread={rereadCurrentReview} reading={submissionState === "reconciling"} />
        )}

        <div className="kn-approval-review-grid">
          <div>
            <section className="kn-approval-panel" aria-labelledby="review-decide-heading">
              <h2 id="review-decide-heading">Review and decide</h2>
              <p>{review.approvalRationale ?? "Approval rationale: Unknown"}</p>
              <p>{review.investigationSummary ?? "Investigation summary: Unknown"}</p>

              <section aria-labelledby="workflow-heading">
                <h3 id="workflow-heading">Proposed workflow · read only</h3>
                {review.workflow ? (
                  <>
                    <dl className="kn-approval-ledger">
                      <div><dt>Workflow ID</dt><dd>{review.workflow.id}</dd></div>
                      <div><dt>Workflow version</dt><dd>{review.workflow.version}</dd></div>
                      <div><dt>Name</dt><dd>{review.workflow.displayName}</dd></div>
                    </dl>
                    {review.workflow.parameters !== null ? (
                      <dl className="kn-approval-ledger kn-approval-parameter-ledger" aria-label="Recorded workflow parameters">
                        {Object.entries(review.workflow.parameters).length > 0 ? Object.entries(review.workflow.parameters).map(([name, value]) => (
                          <div key={name}><dt>{name}</dt><dd>{value}</dd></div>
                        )) : <div><dt>Values</dt><dd>None recorded</dd></div>}
                      </dl>
                    ) : (
                      <p className="kn-approval-muted">Exact parameter values are not supplied by this fixture read.</p>
                    )}
                  </>
                ) : (
                  <p>Exact workflow ID and version are unknown. No latest or by-name substitute is used.</p>
                )}
                {review.workflow?.rationale && <p>{review.workflow.rationale}</p>}
              </section>

              {isPending ? (
                <div className="kn-approval-decision-form">
                  <label>
                    Decision reason
                    <textarea
                      aria-label="Decision reason"
                      value={currentReason}
                      onChange={(event) => {
                        setReason(event.target.value);
                        setReasonScope(scope);
                        if (reasonError) setReasonError(null);
                      }}
                      required
                      rows={4}
                      placeholder="Explain the decision without assuming Approve or Reject."
                      disabled={submissionState === "submitting" || submissionState === "reconciling"}
                    />
                  </label>
                  {reasonError && <p className="kn-approval-error" role="alert">{reasonError}</p>}
                  {guardMessages.length > 0 && (
                    <ul className="kn-approval-error kn-approval-guard-list" role="alert">
                      {guardMessages.map((message) => <li key={message}>{message}</li>)}
                    </ul>
                  )}
                  <div className="kn-approval-actions">
                    <button type="button" onClick={() => selectDecision("Approved")} disabled={!canDecide}>Approve</button>
                    <button type="button" onClick={() => selectDecision("Rejected")} disabled={!canDecide}>Reject</button>
                  </div>
                  {submissionState === "submitting" && <p role="status">Recording fixture decision…</p>}
                  {submissionState === "reconciling" && <p role="status">Re-reading the current fixture review…</p>}
                </div>
              ) : (
                <div className="kn-approval-decision-result" role="status">
                  <strong>{decisionLabel(review.decision.status)}</strong>
                  <p>{decisionLabel(review.decision.status)} by {review.decision.actor?.displayName ?? "Unknown"}</p>
                  <p>{review.decision.reason ?? "Reason unknown"}</p>
                  <p className="kn-approval-muted">Resolved at {formatApprovalTimestamp(review.decision.decidedAt)}</p>
                </div>
              )}
            </section>
          </div>

          <aside className="kn-approval-panel" aria-labelledby="related-evidence-heading">
            <h2 id="related-evidence-heading">Related recorded evidence</h2>
            <EvidenceState state={review.relatedEvidence} onRetry={retryEvidence} retrying={evidenceRetrying} />
          </aside>
        </div>
      </ApprovalReadStatePanel>

      {visiblePendingConfirmation && (
        <ApprovalDecisionConfirmation
          decision={visiblePendingConfirmation.decision}
          snapshot={visiblePendingConfirmation.snapshot}
          isSubmitting={submissionState === "submitting" || submissionState === "reconciling"}
          onCancel={() => setPendingConfirmation(null)}
          onConfirm={confirmDecision}
        />
      )}
    </section>
  );
}

function DecisionOutcomePanel({
  outcome,
  onReread,
  reading,
}: {
  outcome: DecisionOutcome;
  onReread: () => void;
  reading: boolean;
}) {
  return (
    <div className="kn-approval-error kn-approval-decision-outcome" data-testid="approval-decision-outcome" data-outcome={outcome.status} role="alert">
      <strong>{decisionOutcomeLabel(outcome.status)}</strong>
      <p>{outcome.message}</p>
      <p>The current fixture review was re-read. No decision retry was sent automatically; the fixture result is not an authoritative backend outcome.</p>
      <button type="button" onClick={onReread} disabled={reading}>
        {reading ? "Re-reading current review…" : "Re-read current review"}
      </button>
    </div>
  );
}

interface EvidenceProps {
  state: ApprovalReview["relatedEvidence"];
  onRetry: () => void;
  retrying: boolean;
}

function EvidenceState({ state, onRetry, retrying }: EvidenceProps) {
  if (state.status === "loading") return <p role="status">Loading related evidence…</p>;
  if (state.status === "unavailable" || state.status === "forbidden" || state.status === "missing") {
    return (
      <div className="kn-approval-evidence-warning" role="status">
        <strong>{state.status === "forbidden" ? "Related evidence is not authorized" : state.status === "missing" ? "Related evidence is missing" : "Related evidence is unavailable"}</strong>
        <p>{state.message}</p>
        <p>Approve and Reject remain available when the RAR is readable, authorized and pending.</p>
        <button type="button" onClick={onRetry} disabled={retrying}>
          {retrying ? "Retrying related evidence…" : "Retry related evidence"}
        </button>
      </div>
    );
  }
  if (state.status === "empty") return <p role="status">No related evidence was returned. This does not disable either decision.</p>;
  return (
    <>
      {state.status === "partial" && <p role="status">Evidence is partial. Missing fields: {state.missingFields.join(", ")}.</p>}
      {state.status === "stale" && <p role="status">Evidence is stale. It was observed at {state.observedAt}.</p>}
      <ul>
        {state.data.map((item, index) => (
          <li key={item.id ?? `evidence-${index}`} data-testid={`approval-evidence-${item.id ?? index}`}>
            <strong>{item.category}</strong>: {item.summary}
            <small> · {formatApprovalTimestamp(item.occurredAt)} · {item.actor?.displayName ?? "Actor unknown"}{item.redacted ? " · Redacted" : ""}</small>
          </li>
        ))}
      </ul>
    </>
  );
}
