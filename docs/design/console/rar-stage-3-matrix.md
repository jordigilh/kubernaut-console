# Stage 3 — independent RAR live-readiness matrix

**Status: source-only planning; not a live adapter, API specification, security
approval, or acceptance pass.** The rollout plan's third step remains open.
This matrix is the implementation handoff for `approvals.inbox` and
`approvals.review`, not authorization to wire them. [RAR seam](rar-live-contract-seam.md)
contains the underlying source analysis; [acceptance](acceptance-and-delivery.md#independent-rar-cases)
defines the local acceptance labels. Local labels are not canonical BR or test IDs.

## Baseline and evidence limits

| Evidence | What was checked | Limit |
| --- | --- | --- |
| Console | PR [#162](https://github.com/jordigilh/kubernaut-console/pull/162), open at `5dcb415f9367a8c781f2cbc51a4ebadc8c54037f`; its description and changed-file list were reviewed. | Fixture foundation/review and isolated browser tests; standalone still mounts `KubernautChat`. PR-reported test results are not new runs here. |
| Upstream | On 2026-10-31 GitHub `main` resolved to [`d411d67931ac56607c67631f38d58e5baa49c309`](https://github.com/jordigilh/kubernaut/tree/d411d67931ac56607c67631f38d58e5baa49c309), the revision cited by the seam. Engram main-source inspection corroborates the cited AF handlers; the earlier seam records its commit/blob cross-check. | Source inspection is not deployed behavior or a fresh integration test. Revalidate revision and sources before implementation. |
| Upstream issues | [#2564](https://github.com/jordigilh/kubernaut/issues/2564) and [#2565](https://github.com/jordigilh/kubernaut/issues/2565) were both OPEN, last updated 2026-10-27, no comments, acceptance boxes unchecked when queried 2026-10-31. | Closure alone would not prove the accepted contract, source revision, deployment, migration or tests qualify. |
| Private gates | Decision safety, auth/logout and ownership require relevant maintainer-held evidence per [readiness](implementation-readiness.md#private-implementation-risk-companion). | Not inspected or reproduced in this work; request it privately before implementing or qualifying affected boundaries. Do not publish private findings. |

The fixture reviewer, fixture UID/version and mock receipts are synthetic, not
authenticated identity, a server token, or an authoritative result. Existing
prototype routes are examples, not required production URLs. Approval-only
access is independent of originating chat, LLM, investigation, general audit and
catalog access; no workflow/parameter override is part of this slice.

## Current sources → required contract

Upstream paths in this table are under the pinned revision above. Console paths
are at `5dcb415`. **Required** describes an owner decision or future behavior,
not an existing endpoint, field name, client capability, or approved schema.

| Boundary / owner | Confirmed source | Required seam, gap and negative proof |
| --- | --- | --- |
| List · AF + console · RAR-01/02 | `pkg/apifrontend/tools/crd_tools.go`: `ApprovalRequestSummary` / `HandleListApprovalRequests` expose name, controller namespace, parent RR name, decision, confidence, deadline and time remaining; empty decision displays Pending; `count` counts returned records. | Confirm supported scope/filter/limits and least-privilege dispatch; current DTO does not supply target, source, submitter, creation or paging. No fabricated target namespace, fleet total or server search. Denied/missing/filter-invalid reads cannot widen or substitute a record. |
| Detail and binding · AF/admission · RAR-02/05 | `GetApprovalRequestResult` exposes recorded brief, parent, deadline and decision/decider/time but not RAR UID, reviewed-content version, target/source or decision message. `GetApprovalRequest` normalizes nil evidence to an empty array. | #2564/#2565 owners must establish server-issued UID and an opaque, server-defined binding to decision-relevant reviewed content. Specify coverage, stale/delete-recreate behavior, unrelated status updates and compatibility for existing callers. No client hash, name-only identity or assumption that object resourceVersion is the agreed token. Preserve unknown versus empty in the new projection. |
| Workflow · AF/RO · RAR-02/07 | `crd_tools.go` maps RAR `RecommendedWorkflow.WorkflowID` to DTO `recommended_workflow.name`; version is optional in that DTO. Upstream `api/remediation/v1alpha1/remediationapprovalrequest_types.go` and `pkg/remediationorchestrator/creator/approval.go` record ID/version and other proposal context. `pkg/apifrontend/tools/ds_tools.go` provides catalog summaries, not the qualified exact-version browser detail. | Display recorded ID **and** version, with unknown/unavailable explicit. Never select by display name, latest or first match. A catalog detour requires separate authorization and exact ID/version; otherwise retain review and show unavailable. Recorded parameters/provenance need a reviewed read contract, not catalog defaults; editing is on hold. |
| Related evidence · AF/security · RAR-03 | `pkg/apifrontend/ds/ogen_client.go` requests at most 200 events and maps timestamp/type/actor/action; `pkg/apifrontend/tools/ds_tools.go` groups audit summaries by phase. #2565 describes the existing approver tool role and its lack of general audit/investigation access. | #2565 must define server-resolved RAR→parent relationship, narrowly authorized typed/redacted evidence, permitted provenance and actor/intermediary distinctions, bounded page size/continuation, freshness, completeness/truncation and missing/denied/unavailable states. Reject forged parent/scope and unsupported cursors without expanding access. Evidence failure does not gate an otherwise readable, authorized, valid pending decision; retry only the failed evidence read and retain draft/context/position. |
| Decision · AF/admission · RAR-04/05/08 | `ApproveArgs` requires RAR name and exactly `Approved`/`Rejected`, allows optional reason and workflow-name override; `NewApproveTool` injects controller namespace and obtains username from context. `HandleApprove` patches status and returns status/message; current input carries no UID/content precondition. | #2564 must review canonical BR/security mapping, trusted actor attribution, server-side authorization, pending/deadline and conditional-write/admission semantics, typed outcomes and compatible migration. UI requires neutral reason, explicit immutable confirmation and no override; its requirements are not proof that current server enforces them. Concurrent opposite decisions accept at most one; repeat cannot rewrite accepted actor/reason/time/meaning. |
| Unknown write · AF + console · RAR-06 | `ApprovalDecisionResult` has a fixture `unknown`; a fixture receipt is labelled `source: "fixture"`. Current AF success is status/message, not qualified authoritative readback. `packages/ui-core/src/lib/mcp-client.ts` retries `tools/call` after specific initialization/404 errors. | Define typed outcomes and dispatch/commit uncertainty with upstream. Block further submit, re-read under the captured trusted scope and **same UID**; resolve from authoritative accepted decision/actor/reason/time only, or remain unknown if unreadable, identity changed or UID differs. Do not automatically replay, declare success from HTTP/local receipt, or blindly retry after reinitialization. Explicit later retry requires a fresh eligible read and reviewed contract. |
| Auth, fetch and ownership · host/security + console · RAR-01/06/08 | `providers/auth.ts` offers `getToken`/`getUser`, with name/email/initials only; `lib/access-check.ts` is a coarse advisory preflight; MCP uses `fetch`, optional token and module-global session initialization/ID. `lib/session-state.ts` has browser cleanup; `e2e/live/logout.spec.ts` is test source, not a current pass. | Establish trusted non-display source/principal/session scope, authoritative per-tool checks, request/draft ownership and lifecycle. Invalidate generations before cleanup on logout, identity or source change; fence delayed reads/writes, session initialization and callbacks from old owners. Token acquisition failure and session reinitialization need reviewed safe behavior. Never use displayed user text as authorization; an aborted request alone cannot establish non-commit. |

Current `ApprovalReviewAdapter` and `ApprovalReviewPage` are fixture-specific:
the UID is nullable on reads, the reviewed-content version and reviewer are
fixture data, evidence has no bounded paging/provenance, and component guards
do not provide authoritative expiry, identity or concurrency. Do not inject a
live adapter into them without a separately reviewed migration. Reuse the
existing MCP/auth/fetch boundary only after qualifying write retry and ownership;
do not add a second transport or turn chat's local display update into readback.

## Proposed decision state transitions (not wire semantics)

1. **Read → review:** capture a server-resolved RAR UID, decision-relevant
   binding, eligible state, deadline and trusted scope. Missing required binding
   prevents submission, while optional evidence failure does not.
2. **Confirm → submit:** snapshot exact RAR, target/source where known, deadline,
   reason and reviewed binding. Submit explicitly once; the server reauthorizes
   and checks pending/deadline/binding atomically under the reviewed contract.
3. **Known outcome:** accepted is shown only after authoritative resolution;
   denied, expired, stale, resolved elsewhere and conflict remain distinct as
   defined upstream. Preserve the original accepted attribution and decision.
4. **Unknown outcome:** freeze a second write, re-read same UID in the same
   trusted scope; display authoritative resolution or remain unknown. A changed
   UID, denied/unavailable read or scope transition is not a successful retry.
5. **Ownership changes:** invalidate the old generation before clearing data;
   late completion cannot resurrect protected data or clear a newer user's
   state. No automatic decision replay across logout or session change.

## RAR acceptance evidence matrix

All rows are **OPEN**. Fixture/component assertions are useful early feedback,
but the last column names the additional evidence required for the rollout gate.
Each eventual test record must identify source revision, environment, actor and
permissions, inputs, observable result, and test/log artifact; protect sensitive
evidence rather than including it in public reports.

| Case | Fixture / component contract to retain or add | Required integration and fresh-browser evidence |
| --- | --- | --- |
| RAR-01 | Inbox/detail loading, empty, partial, stale, forbidden, missing, unavailable; no fallback or scope broadening. | Minimally privileged B lists/opens A's existing RAR directly via real AF authorization/dispatch; denied, absent, forged and out-of-scope references expose no protected data/counts. No A session, chat, LLM or investigation. NAV-04 remains separately gated. |
| RAR-02 | One ledger; exact ID/version; explicit missing fields and provenance, no inferred target namespace or catalog defaults. | Compare each displayed field and unknown against the accepted server projection, UID, parent, recorded target/source/deadline and submitter; verify binding covers the reviewed decision-relevant proposal. |
| RAR-03 | All evidence read states; reason and position survive targeted retry; both decisions remain usable when evidence alone fails. | Real AF proves server-side RAR join, redaction/provenance, page bounds/continuation/completeness, forbidden/empty/partial/unavailable and forged-reference denial without general audit grant. |
| RAR-04 | Reason required; immutable snapshot; explicit submit; exact Approved/Rejected; duplicate click guard; no override. | Verify accepted AF payload/dispatch contains only reviewed contract inputs, no workflow selection/edit, investigation or LLM operation; authoritative service validates eligibility. |
| RAR-05 | Distinguish expired, stale, conflict, denied and resolved elsewhere; never treat local clock/disabled button as authority. | Real AF→status write→admission tests: pending approve/reject, deadline boundary, concurrent opposing submissions, safe repeats, unchanged accepted actor/reason/time, unrelated status bookkeeping, stale content and delete/recreate. Existing callers/orchestration regression included. |
| RAR-06 | Unknown state blocks submit; read-before-retry; preserve draft where scope remains valid; fence delayed callback on logout/source/identity change. | Fault-inject timeout before dispatch, after dispatch and after commit; verify same-UID/same-scope authoritative read, denied/unavailable read, replacement UID and B→different-user transition; no blind replay or false success. Qualify MCP reinitialization and in-flight ownership. |
| RAR-07 | Exact ID/version detour or explicit unavailable; contextual Back retains reason/focus/position, no competing investigation CTA. | Confirm separate catalog authorization and exact-version projection if shipped; approval-only B without catalog rights can still review/decide. Missing/version mismatch never resolves by latest/name. |
| RAR-08 | Show active reviewer separately from recorded submitter and accepted actor; no fixture identity as wire authority. | Trace authenticated B through AF, status/admission and audit; distinguish A, B and intermediary/service where recorded, prove accepted reason/time persist, with no chat/LLM/selection. |

## Handoff once upstream qualifies

1. Owners supply reviewed #2564/#2565 BR/API/security decisions, exact source
   revisions and production wiring/migration manifests, including per-tool
   authorization and the accepted binding, result and evidence-page semantics.
2. Obtain the applicable maintainer-held decision/auth/logout/ownership
   evidence privately; resolve its gates and document only approved public
   dispositions. If unavailable, stop the affected implementation.
3. Map the accepted contracts to current MCP/auth/fetch and fixture presentation;
   add scoped ownership, write-safe reconciliation and compatibility tests before
   any live wiring. No new endpoint or additional permission is implied here.
4. Run the real AF→status/admission and authorization suites, then a separately
   authorized fresh operator-A/B browser journey with RAR-01–08 negative paths.
   Record evidence tiers separately; fixture/browser emulation is not live or AT
   qualification. Only then assess the Stage 3 exit gate.
