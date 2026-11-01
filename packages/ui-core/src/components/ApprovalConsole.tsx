import { useEffect, useMemo, useRef, useState } from "react";
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
  const [moreOpen, setMoreOpen] = useState(false);
  const navRef = useRef<HTMLElement>(null);
  const moreButtonRef = useRef<HTMLButtonElement>(null);

  const openRequest = (nextRequestId: string) => setRequestId(nextRequestId);
  const backToInbox = () => {
    setRequestId(null);
    setRefreshToken((current) => current + 1);
  };

  useEffect(() => {
    if (!moreOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setMoreOpen(false);
        moreButtonRef.current?.focus();
      }
    };
    const handleFocusIn = (event: FocusEvent) => {
      if (!navRef.current?.contains(event.target as Node)) setMoreOpen(false);
    };
    const handlePointerDown = (event: PointerEvent) => {
      if (!navRef.current?.contains(event.target as Node)) setMoreOpen(false);
    };
    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("focusin", handleFocusIn);
    document.addEventListener("pointerdown", handlePointerDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("focusin", handleFocusIn);
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [moreOpen]);

  return (
    <div className="kn-approval-console" data-fixture="true">
      <header className="kn-approval-header">
        <div className="kn-approval-brand">
          <img className="kn-approval-logo" src="/logo.svg" alt="Kubernaut" />
          <div>
            <strong>Kubernaut</strong>
            <span>Approval review</span>
          </div>
        </div>
        <div className="kn-approval-identity">
          <span>{reviewer.displayName}</span>
          <small>{reviewer.principal} · reviewer fixture</small>
        </div>
      </header>
      <div className="kn-approval-shell">
        <nav ref={navRef} className="kn-approval-nav" aria-label="Console navigation">
          <div className="kn-approval-nav-priority" aria-label="Priority navigation">
            <button type="button" onClick={backToInbox} aria-current="page">
              Approvals
            </button>
            <span className="kn-approval-nav-deferred" aria-disabled="true">
              Investigations
              <small>Deferred in fixture preview</small>
            </span>
          </div>
          <button
            ref={moreButtonRef}
            type="button"
            className="kn-approval-more-toggle"
            aria-expanded={moreOpen}
            aria-controls="kn-approval-more"
            onClick={() => setMoreOpen((current) => !current)}
          >
            More
          </button>
          <div id="kn-approval-more" className="kn-approval-more" data-open={moreOpen}>
            <section aria-labelledby="kn-approval-explore-heading">
              <h2 id="kn-approval-explore-heading">Explore</h2>
              {["Overview", "Workflows", "Managed resources", "Clusters"].map((label) => (
                <span className="kn-approval-nav-deferred" aria-disabled="true" key={label}>
                  {label}
                  <small>Deferred in fixture preview</small>
                </span>
              ))}
            </section>
            <section aria-labelledby="kn-approval-manage-heading">
              <h2 id="kn-approval-manage-heading">Manage</h2>
              {["Policies & audit", "Administration"].map((label) => (
                <span className="kn-approval-nav-deferred" aria-disabled="true" key={label}>
                  {label}
                  <small>Deferred in fixture preview</small>
                </span>
              ))}
            </section>
          </div>
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
