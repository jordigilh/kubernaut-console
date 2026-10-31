import { useMemo, useState } from "react";
import { ApprovalReviewPage } from "../pages/ApprovalReviewPage";
import { ApprovalsPage } from "../pages/ApprovalsPage";
import {
  createApprovalFixtureAdapter,
  FIXTURE_REVIEWER,
  type ApprovalActor,
  type ApprovalReviewAdapter,
} from "../lib/approval-review";

export interface ApprovalConsoleProps {
  adapter?: ApprovalReviewAdapter;
  reviewer?: ApprovalActor;
  initialRequestId?: string;
}

/**
 * Source-only shared shell for the approval-first slice.
 *
 * It is deliberately fixture-labelled and is not mounted by the standalone
 * application yet. Live auth, MCP reads and decisions wait for #2564/#2565.
 */
export function ApprovalConsole({
  adapter: suppliedAdapter,
  reviewer = FIXTURE_REVIEWER,
  initialRequestId,
}: ApprovalConsoleProps) {
  const fixtureAdapter = useMemo(() => createApprovalFixtureAdapter(), []);
  const adapter = suppliedAdapter ?? fixtureAdapter;
  const [requestId, setRequestId] = useState<string | null>(initialRequestId ?? null);
  const [refreshToken, setRefreshToken] = useState(0);

  const openRequest = (nextRequestId: string) => setRequestId(nextRequestId);
  const backToInbox = () => {
    setRequestId(null);
    setRefreshToken((current) => current + 1);
  };

  return (
    <div className="kn-approval-console" data-fixture="true">
      <header className="kn-approval-header">
        <div>
          <strong>Kubernaut</strong>
          <span>Approval review</span>
        </div>
        <div className="kn-approval-identity">
          <span>{reviewer.displayName}</span>
          <small>{reviewer.principal} · reviewer fixture</small>
        </div>
      </header>
      <div className="kn-approval-shell">
        <nav className="kn-approval-nav" aria-label="Console navigation">
          <button type="button" onClick={backToInbox} aria-current={requestId ? undefined : "page"}>
            Approvals
          </button>
          <span aria-disabled="true">Investigations · separate access</span>
        </nav>
        <main className="kn-approval-main">
          <div className="kn-approval-fixture-banner" role="note">
            Fixture preview — no live decision is submitted
          </div>
          {requestId ? (
            <ApprovalReviewPage
              adapter={adapter}
              requestId={requestId}
              reviewer={reviewer}
              onBack={backToInbox}
            />
          ) : (
            <ApprovalsPage adapter={adapter} onOpenRequest={openRequest} refreshToken={refreshToken} />
          )}
        </main>
      </div>
    </div>
  );
}
