import { useEffect, useState } from "react";
import {
  ApprovalReadStatePanel,
} from "../components/ApprovalReadState";
import {
  formatApprovalTimestamp,
  formatTarget,
  type ApprovalDataState,
  type ApprovalListItem,
  type ApprovalReadState,
  type ApprovalReviewAdapter,
} from "../lib/approval-review";

interface Props {
  adapter: ApprovalReviewAdapter;
  onOpenRequest: (requestId: string) => void;
  refreshToken?: number;
}

function isDataState(state: ApprovalReadState<readonly ApprovalListItem[]>): state is ApprovalDataState<readonly ApprovalListItem[]> {
  return state.status === "ready" || state.status === "partial" || state.status === "stale";
}

function renderSubmitter(item: ApprovalListItem): string {
  return item.submitter?.displayName ?? "Unknown";
}

function renderStatus(status: ApprovalListItem["status"]): string {
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

export function ApprovalsPage({ adapter, onOpenRequest, refreshToken = 0 }: Props) {
  const [readState, setReadState] = useState<ApprovalReadState<readonly ApprovalListItem[]>>({ status: "loading" });
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"pending" | "all">("pending");
  const [retryToken, setRetryToken] = useState(0);

  useEffect(() => {
    let active = true;
    setReadState({ status: "loading" });
    adapter.list().then((next) => {
      if (active) setReadState(next);
    });
    return () => {
      active = false;
    };
  }, [adapter, refreshToken, retryToken]);

  const retry = () => setRetryToken((current) => current + 1);

  if (!isDataState(readState)) {
    return (
      <section aria-labelledby="approvals-heading">
        <PageHeading />
        <ApprovalReadStatePanel state={readState} label="approval requests" onRetry={retry} />
      </section>
    );
  }

  const normalizedQuery = query.trim().toLocaleLowerCase();
  const rows = readState.data.filter((item) => {
    if (statusFilter === "pending" && item.status !== "pending") return false;
    if (!normalizedQuery) return true;
    return [
      item.id,
      item.parentRequestId,
      formatTarget(item.target),
      item.target.namespace,
      item.source.clusterId,
      renderSubmitter(item),
    ]
      .filter(Boolean)
      .join(" ")
      .toLocaleLowerCase()
      .includes(normalizedQuery);
  });
  const pendingCount = readState.data.filter((item) => item.status === "pending").length;

  return (
    <section aria-labelledby="approvals-heading">
      <PageHeading />
      <ApprovalReadStatePanel state={readState} label="approval requests">
        <div className="kn-approval-metrics" aria-label="Approval fixture metrics">
          <div>
            <span>Awaiting decision</span>
            <strong>{pendingCount}</strong>
            <small>Available in this fixture scope</small>
          </div>
          <div>
            <span>Review mode</span>
            <strong>Independent</strong>
            <small>No originating chat or investigation is required</small>
          </div>
        </div>

        <div className="kn-approval-panel">
          <div className="kn-approval-toolbar">
            <label>
              Filter loaded fixture requests
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Request, target, source or submitter"
              />
            </label>
            <label>
              Approval status
              <select
                aria-label="Approval status filter"
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value as "pending" | "all")}
              >
                <option value="pending">Pending</option>
                <option value="all">All loaded</option>
              </select>
            </label>
            <button type="button" onClick={retry}>Refresh fixture list</button>
          </div>
          {rows.length === 0 ? (
            <div className="kn-approval-read-state" role="status">
              <strong>No matching fixture requests</strong>
              <p>The filter did not match any loaded rows. It does not broaden the fixture scope.</p>
            </div>
          ) : (
            <div className="kn-approval-table-wrap">
              <table className="kn-approval-table">
                <caption>Approval requests in the fixture scope</caption>
                <thead>
                  <tr>
                    <th>Request</th>
                    <th>Target</th>
                    <th>Source cluster</th>
                    <th>Initiated by</th>
                    <th>Deadline</th>
                    <th>Status</th>
                    <th><span className="kn-approval-visually-hidden">Action</span></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((item) => (
                    <tr key={item.id}>
                      <td>
                        <strong>{item.id}</strong>
                        <small>{item.parentRequestId ?? "Parent request unknown"}</small>
                      </td>
                      <td>
                        {formatTarget(item.target)}
                        <small>Namespace: {item.target.namespace ?? "Unknown"}</small>
                      </td>
                      <td>{item.source.clusterId ?? "Unknown"}</td>
                      <td>{renderSubmitter(item)}</td>
                      <td>{formatApprovalTimestamp(item.deadline)}</td>
                      <td><span className="kn-approval-status" data-status={item.status}>{renderStatus(item.status)}</span></td>
                      <td>
                        <button type="button" onClick={() => onOpenRequest(item.id)} aria-label={`Review ${item.id}`}>
                          Review
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="kn-approval-muted">Fixture data only. List filtering is local to the loaded rows.</p>
        </div>
      </ApprovalReadStatePanel>
    </section>
  );
}

function PageHeading() {
  return (
    <div className="kn-approval-page-heading">
      <div>
        <h1 id="approvals-heading">Approvals</h1>
        <p>Review recorded proposals and decide independently. No originating investigation session is required.</p>
      </div>
      <span className="kn-approval-badge">Fixture data</span>
    </div>
  );
}
