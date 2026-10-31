import type { ReactNode } from "react";
import type { ApprovalReadState } from "../lib/approval-review";

interface Props<T> {
  state: ApprovalReadState<T>;
  label: string;
  onRetry?: () => void;
  children?: ReactNode;
}

export function ApprovalReadStatePanel<T>({ state, label, onRetry, children }: Props<T>) {
  if (state.status === "loading") {
    return (
      <div className="kn-approval-read-state" data-read-state="loading" role="status" aria-label={`Loading ${label}`}>
        Loading {label}…
      </div>
    );
  }

  if (state.status === "empty") {
    return (
      <div className="kn-approval-read-state" data-read-state="empty" role="status">
        <strong>No {label} returned</strong>
        <p>This is a confirmed empty read for the current fixture scope.</p>
      </div>
    );
  }

  if (state.status === "unavailable" || state.status === "forbidden" || state.status === "missing") {
    return (
      <div className="kn-approval-read-state" data-read-state={state.status} role="alert">
        <strong>{state.status === "forbidden" ? `${label} access is not authorized` : state.status === "missing" ? `${label} was not found` : `${label} is unavailable`}</strong>
        <p>{state.message}</p>
        {onRetry && (
          <button type="button" onClick={onRetry}>
            Retry {label}
          </button>
        )}
      </div>
    );
  }

  if (state.status === "partial" || state.status === "stale") {
    return (
      <>
        <div className="kn-approval-read-state kn-approval-read-state--notice" data-read-state={state.status} role="status">
          <strong>{state.status === "partial" ? `${label} is partial` : `${label} is stale`}</strong>
          <p>
            {state.status === "partial"
              ? `Missing fields: ${state.missingFields.join(", ")}.`
              : `Observed at ${state.observedAt}; stale since ${state.staleSince}.`}
          </p>
        </div>
        {children}
      </>
    );
  }

  return <>{children}</>;
}
