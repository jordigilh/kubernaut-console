// Fixture-only approval workspace composition (#169: moved out of
// foundation.tsx so the production shell graph carries no fixture data).
//
// Explicit fixture composition; no live adapter can be supplied. Synthetic
// records stay in the fixture waves / test-only browser entry and are never
// presented as live.

import { useMemo, useState } from "react";
import { ApprovalsPage } from "../pages/ApprovalsPage";
import { ApprovalReviewPage } from "../pages/ApprovalReviewPage";
import { createApprovalFixtureAdapter, FIXTURE_REVIEWER } from "../lib/approval-review";
import { FixtureShell } from "./foundation";

export function FixtureApprovalWorkspace({ initialRequestId, embedded = false }: { initialRequestId?: string; embedded?: boolean }) {
  const adapter = useMemo(() => createApprovalFixtureAdapter(), []);
  const [requestId, setRequestId] = useState<string | null>(initialRequestId ?? null);
  const [refresh, setRefresh] = useState(0);
  const back = () => { setRequestId(null); setRefresh((value) => value + 1); };
  return <FixtureShell embedded={embedded} access={["approvals", "investigations", "overview", "workflows", "resources", "clusters", "policies", "administration"]} topology="unknown" current="approvals" hrefs={{}}>
    <div className="kn-approval-console" data-fixture="true"><div role="note" className="kn-approval-fixture-banner">Fixture preview — no live decision is submitted</div>{requestId ? <ApprovalReviewPage adapter={adapter} reviewer={FIXTURE_REVIEWER} requestId={requestId} onBack={back} /> : <ApprovalsPage adapter={adapter} onOpenRequest={setRequestId} refreshToken={refresh} />}</div>
  </FixtureShell>;
}
