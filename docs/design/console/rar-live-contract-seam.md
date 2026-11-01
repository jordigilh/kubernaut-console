# Independent RAR review: source-to-contract seam

**Status: source-only implementation handoff, not an approved API or live readiness.**
Scope is `approvals.inbox` and `approvals.review`, including a fresh operator B
reviewing operator A's existing RAR without chat, a driver, an LLM, general
audit access or catalog access. This document proposes behavioral requirements,
not JSON field names, endpoints or a second transport. Authoritative API,
security, compatibility and test-plan decisions belong to upstream owners.

## Evidence and revision

- Console inspected at `98f5a103e14fc7a04eb559b925d3abc9120b11a9`;
  paths below are relative to this repository unless labeled upstream.
- On 2026-10-31 upstream `main` resolved to
  [`d411d67931ac56607c67631f38d58e5baa49c309`](https://github.com/jordigilh/kubernaut/tree/d411d67931ac56607c67631f38d58e5baa49c309).
  Engram main source was checked against the local Git object at that commit for
  the five upstream files cited below; the remote `crd_tools.go` blob also
  matched. This is source inspection, not execution or deployment evidence.
- GitHub issues [#855](https://github.com/jordigilh/kubernaut/issues/855),
  [#2564](https://github.com/jordigilh/kubernaut/issues/2564),
  [#2565](https://github.com/jordigilh/kubernaut/issues/2565), and
  [#2570](https://github.com/jordigilh/kubernaut/issues/2570) were open;
  #2564 and #2565 had no comments when checked. #2570 remains on hold.
  [#2574](https://github.com/jordigilh/kubernaut/issues/2574) was closed
  completed; that closure alone does not qualify this checkout's identity,
  logout, deployment, or cross-user behavior.
- Required maintainer-held evidence for decision safety, auth/logout and
  ownership is not reproduced here. Obtain it before implementing or
  qualifying those boundaries; absence of a public finding is not a pass.

## Current source versus required projection

Upstream paths below are pinned under the commit above. `namespace` in the
current RAR DTO is the RAR/controller namespace, not automatically the target
namespace. Scope is selected by the server, not supplied by the browser.

| Concern | Confirmed current source | Required seam / owner gap |
| --- | --- | --- |
| List | `pkg/apifrontend/tools/crd_tools.go`: `ApprovalRequestSummary` returns RAR name/namespace, decision, parent RR name, confidence/level, time remaining and required-by. `HandleListApprovalRequests` normalizes an empty decision to Pending and filters by decision. It returns a count, not a paging contract. | Map only supplied fields to `ApprovalListItem`; target, source, submitter and creation time remain unknown without an authorized projection. Loaded-row filtering/counts are not fleet totals or server search. RAR-01/02; #2565. |
| Detail and identity | `GetApprovalRequestResult` provides name/namespace, parent RR name, AIAnalysis name, reason, investigation summary, why-approval, actions, alternatives, string evidence, deadline, decision/decider/time and expiry. It omits RAR UID, object/review version, target, cluster, recorded decision message and complete provenance. | A server-resolved exact RAR reference must distinguish UID from name and delete/recreate; independently project parent, target kind/name/target namespace, source and submitter when recorded and authorized. Unknown is not empty, zero or another record. #2564/#2565. |
| Workflow and parameters | Detail `recommended_workflow.name` is populated from `rar.Spec.RecommendedWorkflow.WorkflowID` (not a display name); `version` is optional in the AF DTO. `api/remediation/v1alpha1/remediationapprovalrequest_types.go` and `pkg/remediationorchestrator/creator/approval.go` show the recorded ID, version, bundle and rationale; AF detail omits bundle/rationale. Neither the RAR summary nor this detail provides the full original parameter snapshot. `pkg/apifrontend/tools/ds_tools.go` exposes workflow summaries, not exact-version detail. | Show the recorded exact ID **and** version; no latest/name fallback or catalog-default substitution. A narrow, redacted recorded parameter snapshot and its provenance/binding require #2565 design; missing optional parameter/evidence detail must not independently disable an otherwise valid decision. A separately authorized exact-version catalog detour remains unqualified. No edits or overrides. |
| Related evidence | `pkg/apifrontend/ds/ogen_client.go` requests at most 200 audit events and maps timestamp/type/actor/action; `pkg/apifrontend/tools/ds_tools.go` groups the audit response by lifecycle phase. Neither is a complete RAR-scoped typed, paged review-evidence contract. | #2565 must resolve the RAR-to-parent relationship server-side and expose an explicitly bounded, typed and redacted projection, event identity/time/source and human/intermediary provenance where available, plus page continuation, completeness/truncation and denied/unavailable states. Do not infer a complete set from one page or grant general audit access. |
| Decision | `ApproveArgs` accepts `rar_name`, `decision`, optional `reason` and optional workflow-name override; accepted decision values are `Approved`/`Rejected`. `ApproveResult` is status/message. The tool injects the controller namespace and derives username from context. Current input has no UID or reviewed-content precondition and the response is not a reviewed typed receipt contract. | #2564 must define server-enforced identity, authorization, pending/deadline checks, UID and decision-relevant reviewed-content binding, typed results, concurrency, safe repeat, admission and immutable accepted actor/reason/time. Preserve existing callers through an explicitly reviewed migration; never silently invent or bypass a precondition. No override in this slice. |

The upstream RAR spec's immutability is useful source evidence, not proof that
an AF read, decision and admission are atomically bound or that unrelated
status updates should invalidate a review. How a version/token is generated,
what it covers, and its relationship to Kubernetes resource version remain
upstream decisions. A local hash of displayed fields is not that contract.

## Fixture interface migration boundary

`packages/ui-core/src/lib/approval-review.ts` defines the exported fixture
`ApprovalReviewAdapter` (`list`, `read`, `retryEvidence`, `decide`) and
`ApprovalReadState`, including ready/empty/partial/stale/forbidden/missing.
`ApprovalConsole`, `ApprovalsPage`, `ApprovalReviewPage` and
`ApprovalDecisionConfirmation` provide reusable presentation, reason,
confirmation and scoped component-state patterns. They are explicitly
fixture-labelled and `packages/standalone/src/App.tsx` mounts `KubernautChat`,
not this shell. `packages/ui-core/src/index.ts` exports both fixture types and
existing chat consumers; preserve that public boundary when evolving it.

The current interface is **not** the live seam as-is:

1. `ApprovalReview.uid` is nullable, `reviewedContentVersion` is a fixture
   string, and `ApprovalDecisionInput` sends no UID. A live decision must carry
   whatever server-issued binding #2564 approves; check both UID and content,
   and retain the scoped immutable confirmation until resolution.
2. `ApprovalDecisionInput.reviewer` and `FIXTURE_REVIEWER` are browser-supplied.
   They are display/test context only, never wire authority. Identity and any
   intermediary are authenticated and recorded by the authoritative service;
   distinguish active reviewer from recorded accepted actor and submitter.
3. `ApprovalEvidenceItem[]` has no page, cursor, completeness, source or
   detailed redaction provenance; `retryEvidence(requestId)` cannot express
   bounded continuation. Design an independent RAR-scoped evidence state with
   those properties after #2565 settles. A retry reloads only the failed
   evidence operation and retains the decision draft/position.
4. `ApprovalDecisionResult` has fixture-only accepted receipts and conflict,
   expired, stale, forbidden and unknown variants. Add the upstream-reviewed
   distinctions for already-resolved, unavailable and other outcomes without
   parsing arbitrary message text; don't assume an HTTP status proves acceptance.
   For ambiguous writes, block another decision, re-read the **same UID** under
   the same trusted scope, and explicitly reconcile authoritative decision,
   actor/reason/time or remain unknown. Never automatically replay.
5. The fixture `ApprovalReviewPage` immediately renders an accepted fixture
   receipt, tests deadlines against `observedAt`, and fences by adapter,
   request, reviewer text and a local fingerprint. These are useful component
   behaviors, not authoritative readback, real-time expiry enforcement, trusted
   identity or logout fencing. A live consumer needs explicit changes and tests
   before use; do not simply inject a live adapter into this component.

`ChatContainer.tsx` already calls `kubernaut_approve` through
`lib/mcp-client.ts`, but its chat-local display update is not authoritative
readback or an independent review path. Reuse the existing MCP/auth/fetch
boundary after qualification, not this handler's local attribution. In
particular `callMcpTool` has session-reinitialization retry behavior; qualify
whether a write was dispatched and prevent any ambiguous decision replay under
the accepted upstream semantics. Its current argument type is
`Record<string, string>` and is not evidence for a future structured input.

## Access, identity and result states

`providers/auth.ts` provides `getToken`/`getUser`; `KubernautUser` carries
display name/email/initials, not an established stable trusted principal/session
scope. `KubernautChat.tsx` runs a coarse access check; that is not per-RAR or
evidence authorization. `ProxyAuthProvider.ts` obtains user information;
`ChatContainer.tsx` exposes sign-out and `lib/session-state.ts` has a browser
cleanup helper. `e2e/live/logout.spec.ts` expresses a fresh-login journey, but
test source is not a current test run or proof of callback/session isolation.
Do not infer cross-user, logout, MCP-session or delayed-callback safety from
these symbols. Qualify trusted source/auth/session generations, invalidation
before cleanup, stale callbacks, and fresh operator B access with maintainer-held
evidence and real integration tests. Never use name/email as authorization.

The planned UI distinguishes loading, ready, successful-empty, partial,
stale, unavailable, forbidden and missing/out-of-scope reads; pending,
submitting, accepted, resolved elsewhere, expired, stale review, unauthorized,
conflict and unknown-write decisions. A denied/missing direct link must not
reveal protected data or fall back to another RAR. Evidence failure is independent
of decision eligibility; expiry and concurrency are authoritative server checks,
not disabled-button guarantees. Preserve no automatic retry on unknown writes.

## Acceptance and handoff

| Acceptance | Focused evidence still required beyond fixture tests |
| --- | --- |
| RAR-01, NAV-04 | AF authorization/dispatch tests and a fresh browser with reviewer B, direct-link missing/denied cases, no investigation/catalog/global audit grant. |
| RAR-02, RAR-07 | Recorded field/source mapping including UID, parent, target/source/deadline, exact workflow ID/version and honest parameters; separately authorized exact-version detour or explicit unavailable state. |
| RAR-03 | RAR-only server join, forged reference denial, bounded paging, redaction/provenance, partial/empty/denied/unavailable and targeted retry; neither decision gated by optional evidence. |
| RAR-04/05/08 | Explicit neutral reason/confirmation; real AF→status/admission concurrent opposing decisions, expiry, stale content, delete/recreate, safe repeat, and accepted human/intermediary attribution. Canonical BR mapping and compatible callers must be reviewed upstream. |
| RAR-06 | Timeout before/after commit, same-UID authoritative re-read, changed identity/logout and stale callback fencing, no blind replay, and no unconfirmed success. |

Next agent: obtain the relevant maintainer-held evidence, coordinate reviewed
#2564/#2565 schemas and migration/tests with their owners, then adapt the
existing MCP boundary and presentation only after those contracts are accepted.
The broader rollout plan remains unchecked; no claim is made that Phase 1 or
any live acceptance gate has closed.
