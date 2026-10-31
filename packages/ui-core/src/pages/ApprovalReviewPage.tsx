import { useEffect, useState } from "react";
import { ApprovalDecisionConfirmation } from "../components/ApprovalDecisionConfirmation";
import { ApprovalReadStatePanel } from "../components/ApprovalReadState";
import {
  formatApprovalTimestamp,
  formatTarget,
  formatUnknown,
  type ApprovalActor,
  type ApprovalDataState,
  type ApprovalDecision,
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

type SubmissionState = "idle" | "submitting" | "accepted" | "error";

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

export function ApprovalReviewPage({ adapter, requestId, reviewer, onBack }: Props) {
  const [readState, setReadState] = useState<ApprovalReadState<ApprovalReview>>({ status: "loading" });
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState<string | null>(null);
  const [pendingConfirmation, setPendingConfirmation] = useState<{ decision: ApprovalDecision; snapshot: ApprovalDecisionSnapshot } | null>(null);
  const [submissionState, setSubmissionState] = useState<SubmissionState>("idle");
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const [evidenceRetrying, setEvidenceRetrying] = useState(false);

  useEffect(() => {
    let active = true;
    setReadState({ status: "loading" });
    setReason("");
    setReasonError(null);
    setPendingConfirmation(null);
    setSubmissionState("idle");
    setSubmissionError(null);
    adapter.read(requestId).then((next) => {
      if (active) setReadState(next);
    });
    return () => {
      active = false;
    };
  }, [adapter, requestId]);

  if (!isDataState(readState)) {
    return (
      <section aria-labelledby="approval-review-heading">
        <button type="button" onClick={onBack}>← Back to Approvals</button>
        <h1 id="approval-review-heading">Review remediation</h1>
        <ApprovalReadStatePanel state={readState} label={`approval request ${requestId}`} />
      </section>
    );
  }

  const review = readState.data;
  const isPending = review.decision.status === "pending";
  const workflowIsExact = Boolean(review.workflow?.id && review.workflow.version);
  const canDecide = isPending && workflowIsExact && submissionState !== "submitting";

  const selectDecision = (decision: ApprovalDecision) => {
    if (!canDecide) return;
    if (!reason.trim()) {
      setReasonError("Enter a neutral reason before choosing Approve or Reject.");
      return;
    }
    setReasonError(null);
    setSubmissionError(null);
    setPendingConfirmation({
      decision,
      snapshot: Object.freeze({
        requestId: review.id,
        target: { ...review.target },
        source: { ...review.source },
        deadline: review.deadline,
        reviewer,
        reason: reason.trim(),
        reviewedContentVersion: review.reviewedContentVersion,
      }),
    });
  };

  const confirmDecision = async () => {
    if (!pendingConfirmation) return;
    const { decision, snapshot } = pendingConfirmation;
    setSubmissionState("submitting");
    setSubmissionError(null);
    const result = await adapter.decide({
      requestId: snapshot.requestId,
      decision,
      reason: snapshot.reason,
      reviewedContentVersion: snapshot.reviewedContentVersion,
      reviewer: snapshot.reviewer,
    });
    if (result.status !== "accepted") {
      setPendingConfirmation(null);
      setSubmissionState("error");
      setSubmissionError(result.message);
      return;
    }

    setReadState((current) => {
      if (!isDataState(current)) return current;
      return {
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
    });
    setPendingConfirmation(null);
    setSubmissionState("accepted");
  };

  const retryEvidence = async () => {
    if (evidenceRetrying) return;
    setEvidenceRetrying(true);
    setReadState((current) => {
      if (!isDataState(current)) return current;
      return { ...current, data: { ...current.data, relatedEvidence: { status: "loading" } } };
    });
    const nextEvidence = await adapter.retryEvidence(requestId);
    setReadState((current) => {
      if (!isDataState(current)) return current;
      return { ...current, data: { ...current.data, relatedEvidence: nextEvidence } };
    });
    setEvidenceRetrying(false);
  };

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

      <ApprovalReadStatePanel state={readState} label="RAR review">
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

        {submissionError && <div className="kn-approval-error" role="alert">{submissionError}</div>}

        <div className="kn-approval-review-grid">
          <div>
            <section className="kn-approval-panel" aria-labelledby="review-decide-heading">
              <h2 id="review-decide-heading">Review and decide</h2>
              <p>{review.approvalRationale ?? "Approval rationale: Unknown"}</p>
              <p>{review.investigationSummary ?? "Investigation summary: Unknown"}</p>

              <section aria-labelledby="workflow-heading">
                <h3 id="workflow-heading">Proposed workflow · read only</h3>
                {review.workflow ? (
                  <dl className="kn-approval-ledger">
                    <div><dt>Workflow ID</dt><dd>{review.workflow.id}</dd></div>
                    <div><dt>Workflow version</dt><dd>{review.workflow.version}</dd></div>
                    <div><dt>Name</dt><dd>{review.workflow.displayName}</dd></div>
                  </dl>
                ) : (
                  <p>Exact workflow ID and version are unknown. No latest or by-name substitute is used.</p>
                )}
                <p className="kn-approval-muted">
                  {review.workflow?.parameters ? "Recorded parameters are read only." : "Exact parameter values are not supplied by this fixture read."}
                </p>
                {review.workflow?.rationale && <p>{review.workflow.rationale}</p>}
              </section>

              {isPending ? (
                <div className="kn-approval-decision-form">
                  <label>
                    Decision reason
                    <textarea
                      aria-label="Decision reason"
                      value={reason}
                      onChange={(event) => {
                        setReason(event.target.value);
                        if (reasonError) setReasonError(null);
                      }}
                      required
                      rows={4}
                      placeholder="Explain the decision without assuming Approve or Reject."
                      disabled={submissionState === "submitting"}
                    />
                  </label>
                  {reasonError && <p className="kn-approval-error" role="alert">{reasonError}</p>}
                  {!workflowIsExact && <p className="kn-approval-error" role="alert">An exact workflow ID and version are required before deciding.</p>}
                  <div className="kn-approval-actions">
                    <button type="button" onClick={() => selectDecision("Approved")} disabled={!canDecide}>Approve</button>
                    <button type="button" onClick={() => selectDecision("Rejected")} disabled={!canDecide}>Reject</button>
                  </div>
                  {submissionState === "submitting" && <p role="status">Recording fixture decision…</p>}
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

      {pendingConfirmation && (
        <ApprovalDecisionConfirmation
          decision={pendingConfirmation.decision}
          snapshot={pendingConfirmation.snapshot}
          isSubmitting={submissionState === "submitting"}
          onCancel={() => setPendingConfirmation(null)}
          onConfirm={confirmDecision}
        />
      )}
    </section>
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
