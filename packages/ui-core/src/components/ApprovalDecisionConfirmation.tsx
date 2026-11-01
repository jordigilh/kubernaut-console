import { useEffect, useRef } from "react";
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
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const onCancelRef = useRef(onCancel);
  const isSubmittingRef = useRef(isSubmitting);

  useEffect(() => {
    onCancelRef.current = onCancel;
    isSubmittingRef.current = isSubmitting;
  }, [isSubmitting, onCancel]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    previousFocusRef.current = previouslyFocused;
    const getFocusable = () => Array.from(dialog.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ));
    getFocusable()[0]?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (!isSubmittingRef.current) {
          event.preventDefault();
          onCancelRef.current();
        }
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = getFocusable();
      if (focusable.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }
      const currentIndex = focusable.indexOf(document.activeElement as HTMLElement);
      const nextIndex = currentIndex < 0
        ? (event.shiftKey ? focusable.length - 1 : 0)
        : (currentIndex + (event.shiftKey ? -1 : 1) + focusable.length) % focusable.length;
      event.preventDefault();
      focusable[nextIndex].focus();
    };

    const handleFocusIn = (event: FocusEvent) => {
      if (!dialog.contains(event.target as Node)) getFocusable()[0]?.focus();
    };

    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("focusin", handleFocusIn);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("focusin", handleFocusIn);
      if (previouslyFocused && previouslyFocused !== document.body && previouslyFocused.isConnected) previouslyFocused.focus();
    };
  }, []);

  return (
    <div
      className="kn-approval-confirmation"
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="approval-confirmation-title"
      aria-describedby="approval-confirmation-description"
      tabIndex={-1}
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
            <dt>RAR UID</dt>
            <dd>{formatUnknown(snapshot.requestUid)}</dd>
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
