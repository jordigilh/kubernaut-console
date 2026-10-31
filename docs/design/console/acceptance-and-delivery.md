# Acceptance contract and implementation sequence

This is a handoff-local acceptance checklist, **not canonical BR registration, new runtime authorization or executed-test evidence**. Map these labels to the repository's actual business requirements/test conventions before implementation. Preserve existing public consumers and regressions; do not count prototype captures or source test files as production passes.

## First implementation slice — requires authorization

1. Revalidate source/read/least-privilege/conditional-decision contracts and the user's current holds. Record backend gaps rather than hiding them behind mock UI guards.
2. Finalize the approved requirement mapping, typed read/action model, error/version semantics, component ownership and tests. Reuse existing MCP/A2A/auth/fetch boundaries; no second chat transport or fabricated data projection.
3. Build the minimal shared shell plus independent Approvals inbox/review/confirmation flow, then prove operator B can review/decide operator A's existing RAR from a fresh authorized browser without chat/investigation access.

The [design authority decision](../../adr/010-prototype-led-console-design.md) records the approval-first delivery boundary. The broad full-console design does not authorize implementing all menus at once or make dashboards/inventory/admin prerequisites.

Once a user authorizes source-only frontend work, components/tests can be developed against clearly separated typed fixtures while upstream gates remain open; they must not be represented or wired as live-authoritative decisions until those gates are closed. No installation, backend repair, credential/RBAC/CR change, scenario, workflow run or commit/push is implied by that distinction.

## Cross-screen and navigation cases

| Local label | Required observable outcome |
| --- | --- |
| NAV-01 | At320/360/390/620/699, both themes: permitted Approvals/Investigations +More, one closed row, correct current indication and no whole-page overflow. >699: grouped sidebar and no duplicate nav control/anchors. |
| NAV-02 | More opens via native click/Enter/Space; ordinary Tab/Shift+Tab; Escape closes and returns focus only to More. Link/outside/focus exit closes without hidden focus or focus theft. Modified links/new tabs remain native. |
| NAV-03 | Secondary navigation, same-route selection, Back/Forward, heading visibility and breakpoint transitions retain correct scope/focus. Full focused links remain visible above fixed composer/below sticky header, including96px draft at320. Manual scrolling is not continuously anchored. |
| NAV-04 | Approval-only direct route works without operational/catalog/general-audit access; denied direct reads reveal no protected data/counts. Fleet with one visible cluster retains Clusters; local omits it; unknown does not assume local. Invalid filters never widen. |
| NAV-05 | Navigating/opening an existing record does not invoke investigation, reconnect, selection, approval, cancellation or execution. Historical cases without supplied workspace relationships do not acquire one. |

## Independent RAR cases

| Local label | Required observable outcome |
| --- | --- |
| RAR-01 | Fresh operator B session can list/open a permitted existing RAR directly, without operator A's browser/chat or investigative privileges. Missing/forbidden/out-of-scope IDs are bounded and never substitute another record. |
| RAR-02 | Single ledger and central decision form expose authoritative request/target/namespace/source/deadline/submitter/reviewer; rationale/evidence/related context retains provenance and explicit unknowns. Exact workflow ID+version, no mutable latest/default substitution. |
| RAR-03 | Related evidence loading/partial/stale/empty/unavailable/forbidden does not gate either decision for a readable authorized valid pending RAR. Targeted retry preserves reason/context/position and retries only the failed read. |
| RAR-04 | Neutral required reason, immutable confirmation and explicit submit. Wire values are Approved/Rejected; no parameter/workflow override. Submit state prevents accidental duplicate UI sends but is not the authoritative concurrency mechanism. |
| RAR-05 | Expired/non-pending/stale-reviewed-version/unauthorized/conflicting decisions are rejected authoritatively; accepted decision/actor/reason/time cannot be overwritten by an opposite/later request. Prove through actual AF→status-write→admission integration tests. |
| RAR-06 | Unknown write outcome is reconciled by read before retry; server resolution controls success. Optional read failure does not appear as accepted decision. Scope/identity/logout changes fence pending callbacks and drafts. |
| RAR-07 | Exact-version workflow detour has visible top-left contextual Back, retains reason/focus/position and no competing investigation CTA. Missing detail remains unknown; approval-only does not gain catalog entitlement. |
| RAR-08 | Authoritative attribution identifies reviewer B separately from originating actor A and intermediary/service identity. UI labels do not prove audit persistence. No LLM request or new workflow selection is required for approve/reject. |

## Investigation and ownership cases — later gated integration

| Local label | Required observable outcome |
| --- | --- |
| INV-01 | >699 permanent adjustable right summary, independent scroll and usable tablet resize; ≤699 full-width context above conversation, complete fields reachable, anchored details expansion and correct expanded header offset. Escape never hides summary. |
| INV-02 | RR ID-only display; separately qualified immutable original Alert and RCA target scopes; missing scope not borrowed. Open compact RCA, evidence initially collapsed, workflow cards outside, genuine params/mandatory ID-version/no derived target input rows. |
| INV-03 | Human-right/AI-left containers with left text; Alert severity separate from RCA accent/provenance; assistant identity and neutral AI-generated RCA origin distinct. |
| INV-04 | Plain/Markdown/no-RCA/early-RCA/discovery-pending/empty/many/ruled-out/no-recommended/recovery/alignment/divergence and action-error states retain current information and approved safe destinations. Disabled prototype controls do not discharge these tests. |
| INV-05 | Native workflow reference/option focus remains above composer/below sticky frame; typing/caret and manual reading retained with grown draft/long scopes in both themes. |
| INV-06 | Persistent safe phase/task/timing plus Activity return; immediate and settled native returns after wheel movement at320 both themes/tool and reconnecting, actual clicks and repeats. New user/focus/view intent cancels return without snapback, repeated correction or focus theft. |
| INV-07 | Explicit finished lifecycle stays finished when timing is missing/invalid; duration unavailable rather than ongoing elapsed; manual disclosure reopening survives timing-only updates. True zero remains0. All verification step names/status/details/retries and separate clocks are represented; window expiry is not pass. |
| INV-08 | Same-RCA confidence/tool/turn/token snapshots and Root cause mirror agree; early/missing/pending/partial are not zeros. No browser effectiveness calculation, confidence→recovery inference or fabricated costs/ETAs. |
| OWN-01 | Presenter switch/hide produces zero operational sends/starts/claims/reconnects/selections/approvals/cancels and does not dispose live owners. In-flight updates/drafts stay with the originating captured source/auth/session/investigation. |
| OWN-02 | Validated bounded versioned snapshots restore interrupted/disconnected, not streaming or driver-owned; stable message IDs, best-effort storage failure behavior and explicit legacy-cache policy. No backend transcript/replay or persisted live credentials/handles/actions. |
| OWN-03 | Logout/source/identity change invalidates generations before clearing; old async events cannot resurrect prior data or clear a newer subject. Auth-loading differs from logout. MCP session initialization is source/auth scoped, not keyed to visible case. |
| OWN-04 | Response Stop aborts response without pretending to cancel RR; RR Cancel is an explicit separate guarded action. New conversation/history/templates preserve current guards and do not auto-send or reuse the wrong context. |
| SAFE-01 | Safe semantic projection rejects/omits raw/private reasoning, commands/arguments/results and all RAR-derived narration from conversation. Structured type allowlist/text-node rendering is not sufficient. Status announcements are meaningful, bounded and not duplicated. |

## Evidence tiers and release boundary

| Tier | What it can establish | What remains separate |
| --- | --- | --- |
| Source inspection | Existing symbols/schema/wiring opportunities at pinned revision | Test execution, host permissions, deployed behavior or production readiness |
| Unit/component tests | Typed adapter, guards, clocks, snapshot/focus reducer behavior under controlled inputs | Actual backend state, real touch/AT or cross-user write safety |
| Integration tests | Real parsers/auth/fetch/owner components and backend/admission contracts under explicit fixtures | Deployed environment, driver leases/concurrency and human comprehension unless actually exercised |
| Browser prototype checks | Exercised offline layout/interaction and synthetic states; scoped independent findings where reported | Implemented application wiring, live authorization, full renderer parity or whole-UI signoff |
| Authorized live acceptance | Only the particular recorded source/identity/action/observation budget | Unexercised domains/browsers/failure paths; no automatic expansion of operational permission |

Run requirement-driven tests before claiming a behavior implemented, record exact code revision/input hashes and failed attempts, and use fresh output directories. Add supported-browser/real-phone/virtual-keyboard/AT and zoom/font/contrast acceptance explicitly; headless Chromium viewport emulation is insufficient. Do not rerun frozen exporter scripts to generate “new evidence” in place.

## Done means

A slice is ready only when its approved requirements, actual source/data/permission/action wiring, negative/error states, tests and authoritative outcomes agree, and remaining gaps are explicitly accepted/deferred—not hidden. A full-console screenshot match is not delivery. Keep source/tool tests, prototype checks, independent review and user visual acceptance as separate evidence labels.
