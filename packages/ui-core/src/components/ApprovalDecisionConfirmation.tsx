import type { ApprovalDecision, ApprovalDecisionSnapshot } from "../lib/approval-review";
import { formatApprovalTimestamp, formatTarget, formatUnknown } from "../lib/approval-review";

interface Props {
  decision: ApprovalDecision;
  snapshot: ApprovalDecisionSnapshot;
  isSubmitting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export function ApprovalDecisionConfirmation({
  decision,
  snapshot,
  isSubmitting,
  onCancel,
  onConfirm,
}: Props) {
  return (
    <div
      className="kn-approval-confirmation"
      role="dialog"
      aria-modal="true"
      aria-labelledby="approval-confirmation-title"
      aria-describedby="approval-confirmation-description"
    >
      <div className="kn-approval-confirmation__body">
        <h2 id="approval-confirmation-title">Confirm {decision}</h2>
        <p id="approval-confirmation-description">
          Confirm the immutable request context before this fixture preview records the decision.
        </p>
        <dl className="kn-approval-ledger kn-approval-ledger--confirmation">
          <div>
            <dt>Request</dt>
            <dd>{snapshot.requestId}</dd>
          </div>
          <div>
            <dt>Target</dt>
            <dd>{formatTarget(snapshot.target)}</dd>
          </div>
          <div>
            <dt>Namespace / source</dt>
            <dd>{formatUnknown(snapshot.target.namespace)} / {formatUnknown(snapshot.source.clusterId)}</dd>
          </div>
          <div>
            <dt>Deadline</dt>
            <dd>{formatApprovalTimestamp(snapshot.deadline)}</dd>
          </div>
          <div>
            <dt>Reviewer</dt>
            <dd>{snapshot.reviewer.displayName} ({snapshot.reviewer.principal})</dd>
          </div>
          <div>
            <dt>Reason</dt>
            <dd>{snapshot.reason}</dd>
          </div>
        </dl>
        <p className="kn-approval-muted">Fixture preview only. No live decision is submitted.</p>
        <div className="kn-approval-actions">
          <button type="button" onClick={onCancel} disabled={isSubmitting}>
            Cancel
          </button>
          <button type="button" onClick={onConfirm} disabled={isSubmitting}>
            {isSubmitting ? "Confirming…" : `Confirm ${decision}`}
          </button>
        </div>
      </div>
    </div>
  );
}
