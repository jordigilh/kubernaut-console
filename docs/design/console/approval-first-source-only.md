# Approval-first source-only slice

This note maps the review correction to tests in the fixture-backed UI slice. It
does not replace the approval contracts in [acceptance-and-delivery.md](acceptance-and-delivery.md)
or establish live/runtime readiness.

## Requirement-to-test map

| Requirement boundary | Test coverage |
| --- | --- |
| Separate accepted/rejected and unknown/stale/forbidden/expired/conflict outcomes; require a current read before retry | `src/pages/ApprovalReviewPage.test.tsx` — `ApprovalReviewPage decision boundaries` outcome table and reconciled-current-state case |
| Block blank reviewer identity, blank workflow ID/version, missing reviewed version and deadlines not later than the observed read | `src/pages/ApprovalReviewPage.test.tsx` — eligibility cases |
| Fence initial reads, decision receipts, evidence retries and drafts across request/adapter/reviewer/review scopes | `src/pages/ApprovalReviewPage.test.tsx` — `ApprovalReviewPage scope fencing` |
| Keep decision reason and confirmation immutable for the active review scope; prevent duplicate sends | `src/pages/ApprovalReviewPage.test.tsx`; `src/components/ApprovalConsole.test.tsx` — Approved and Rejected journeys |
| Focus the confirmation, contain Tab/Shift+Tab, handle Escape/cancel and restore the trigger | `src/components/ApprovalDecisionConfirmation.test.tsx` |
| Start the inbox on pending, expose an explicit all-loaded filter and display status | `src/components/ApprovalConsole.test.tsx` — pending/status inbox case |
| Keep the accepted logo and priority navigation; keep deferred More destinations non-actionable | `src/components/ApprovalConsole.test.tsx` — priority/deferred navigation case |
| Render supplied workflow parameters read-only and preserve paired dark-field tokens plus the 699px breakpoint | `src/pages/ApprovalReviewPage.test.tsx`; `src/styles/approval-console.css.test.ts` |

## Fixture-only limitations

- `createApprovalFixtureAdapter()` is an in-memory fixture adapter. It does not
  call MCP/A2A, a backend, a cluster, an auth provider or a live decision
  endpoint. Fixture receipts are not authoritative outcomes.
- Client-side eligibility and scope fencing are safety UI behavior only. They do
  not prove server-side authorization, reviewer identity, expiry, conditional
  writes, concurrency, attribution, logout invalidation or admission behavior.
- `ApprovalConsole` remains unmounted by `packages/standalone/src/App.tsx`.
  The shell is available for component development and tests, not as a live
  route or deployment claim.
- The reviewer is supplied as a fixture prop; no trusted identity, ownership,
  RBAC or cross-operator access contract is invented here. Deferred navigation
  destinations remain explicitly unavailable in the preview.
- Workflow parameters are displayed only when supplied by the read projection;
  there is no parameter editor, workflow override, execution or live action.
- Vitest/jsdom tests establish controlled component behavior only. They do not
  establish supported-browser, real-device, assistive-technology, deployed,
  cross-user or upstream integration acceptance. Upstream decision/read gates
  remain open, including `#2564` and `#2565`.
