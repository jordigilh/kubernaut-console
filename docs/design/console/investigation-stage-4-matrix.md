# Stage 4 — investigation and chat source-only readiness

**Status: source mapping, fixture-only recorded presentation, and a bounded
single-chat owner/presenter extraction.** No live adapter, production route,
multi-investigation owner or acceptance gate is implemented.
The rollout plan's Stage 4 remains open. Live RAR Stage 3 is
parked pending upstream qualification; the Stage 4 work does not resolve its
UID/content-binding contract conflict. Local labels below are handoff labels,
not registered business requirements or passing tests.

The existing `ChatContainer` now composes an internal `ChatOwnerProvider` and
`ChatPresenter`, retaining the existing standalone entry point. In a controlled
component test, keeping the provider mounted while hiding the presenter retains
the draft and accepts a synthetic stream and status update without an additional
send, status subscription, cancellation or MCP call. Disposing the provider
aborts its subscriptions. This is a single-owner structural seam, not scoped
identity, multi-investigation isolation, live concurrency, or recovery evidence.
The new shell does not yet mount this presenter. Existing browser/session and
MCP state behavior is unchanged; all applicable ownership, logout, transport,
semantic-projection and acceptance gates remain open.

At this source-only checkpoint, the full UI-core suite reported 731 tests passed.
A six-test-file coverage run applied thresholds to the **aggregate of two
included files**, not to each file: `ChatContainer.tsx` measured 76.78%
statements, 79.66% functions and 78.36% lines; the boundary measured 100%
statements, functions and lines. This is neither a per-file 80% pass nor
live-lifecycle, identity-isolation or changed-branch coverage.

### Delivery options and current progress

**User decision:** start with the page-lifetime, memory-only owner. The
long-term goal remains browser-owned conversation restoration across reloads
once verified scope, retention and safety contracts are qualified. Neither
approach is complete or approved for live deployment.

| | Page-lifetime, memory-only owner | Verified-scope, reload-capable owner |
| --- | --- | --- |
| Intended behavior | Keep the active conversation and draft while navigating within one authenticated page lifetime. Do not promise recovery after reload or logout. | Restore bounded browser-owned snapshots after the host verifies the applicable source, identity and session. Restored content is disconnected, not a live stream or driver. |
| Completed evidence | Single-owner/presenter extraction and controlled hide/show test; an independent in-memory lease primitive and synthetic tests. Neither is wired to the new shell. | Host requirements proposal and source preflight only. No qualified identity/session source or scoped snapshot implementation exists. |
| Next implementation work | Explicitly disable or isolate the existing tab-global transcript/context/phase/pending/workflow storage for this mode; isolate MCP by source and auth lifetime; fence stream, status, action and storage callbacks. Invalidate and abort before clearing or allowing a successor. | Qualify the host contract below; approve legacy-cache handling, retention and privacy policy; implement bounded, validated scoped snapshots, unique IDs, safe storage-failure handling and async write fencing. |
| Required evidence | Auth/loading/logout/source-change and delayed-callback tests, same-user re-login, MCP initialization/retry isolation and no implicit actions on view changes. Test the integrated owner, not just the lease primitive. | All memory-only evidence, plus cross-user/session/source/conversation isolation, reload and partial-stream restore, legacy-cache rejection/migration, quota/denial, stale writes and separately qualified deployed concurrency. |

The first option still requires a trustworthy way to detect authentication and
source transitions for its page lifetime; a local generation is not proof of
identity or server authorization. Existing global persistence and MCP state
must not silently remain in use under a memory-only label. Both options retain
the existing OAuth2 Proxy/JWT boundary; neither authorizes exposing credentials,
replaying actions, creating a backend transcript store, or treating a snapshot
as a recovered live investigation. Full G1–G5 and release gates stay open.

### Proposed source-only identity/lifecycle boundary

`chat-owner-boundary.ts` defines an in-memory, single-owner fencing primitive;
it is not wired into the existing owner or production host. The host contract
must supply a verified canonical source, issuer, immutable subject, nonsecret
authenticated-session generation and browser-local conversation ID. Display
name/email, an RR, MCP session, A2A task or driver is not a substitute for any
of these fields. Missing or invalid scope does not create an owner. Auth loading
is distinct from explicit logout and must not itself invalidate an active owner.

On explicit logout or scope replacement, the boundary invalidates the old
generation before aborting it. A stale lease cannot perform a guarded synchronous
write or invalidate a newer generation. Async work must re-check after every
await; a guarded function does not protect work it schedules for later. This
primitive has no authority to authenticate its input, clear storage, fence the
existing callbacks, isolate MCP sessions, or revoke server-side work. Those
integrations and their negative tests remain required before live use; the
current provider supplies display fields rather than a qualified scope.

### Host contract proposal — not yet supplied or approved

Source checked at console `82761210e57fcb70fef06a4d2d0fa4fd862e2847`:
`KubernautAuthProvider` returns a token and display-only `KubernautUser`;
the standalone `ProxyAuthProvider` maps `/oauth2/userinfo` to name, email and
initials. It exposes no qualified issuer/subject or authenticated-session
generation to the chat owner. OAuth2 Proxy's
[v7.15.3 UserInfo handler](https://github.com/oauth2-proxy/oauth2-proxy/blob/v7.15.3/oauthproxy.go)
returns user, email, groups, preferred username and optional additional claims;
that source does not establish this deployment's claim mappings, issuer or a
browser-safe session generation. Do not assume `user` or additional claims are
verified `sub`, or that the deployed proxy matches this reference version.

Before wiring the owner, an owning host/security team must qualify an
authenticated, same-origin, non-cacheable scope source with these properties:

1. **Principal and source:** explicit verified issuer and immutable subject,
   plus canonical backend/source identity. The host establishes these from its
   validated authentication boundary; client-supplied display fields, raw
   headers and unverified token decoding are not proof.
2. **Session generation:** an opaque **noncredential** identifier, stable for
   the supported continuity interval and different after logout, replacement or
   a new login. Define refresh, expiry, cross-tab, server restart, replay and
   revocation behavior. It must not be a cookie, bearer token, token hash, MCP
   session, A2A context, RR or driver ID. Do not expose secrets to the SPA.
3. **Authentication states:** distinguish loading, verified, explicit logout,
   unauthenticated and error. Fail closed on absent, ambiguous or malformed
   scope; loading alone does not clear an active owner. Invalidation precedes
   any cleanup; stale completions cannot clear or revive a successor. Logout
   locks owner activation before abort callbacks and only a separately verified
   new authenticated transition may unlock it.
4. **Privacy and storage:** subject and session values are sensitive identifiers,
   not authorization grants. Define storage representation, retention, size,
   deletion, storage-denial behavior and cross-tab isolation before persistence.
   Unowned legacy cache must not be adopted as another user's data; deletion or
   migration requires an explicit policy. Never persist credentials or handles.
5. **Integration evidence:** test host claim provenance and the full auth/load/
   logout/re-login sequence; stale stream, status, action, approval and storage
   callbacks; and scope-specific MCP initialization and retry. Browser guards
   cannot revoke an already-dispatched backend mutation. Verify protected links,
   transport behavior and deployed AF/KA concurrency separately.

This is a requirements proposal, not a claim that a new endpoint, proxy feature,
deployment configuration or provider contract exists. The local boundary test
checks the synchronous lock only; it cannot verify an authenticated transition.
Source of the generation and its lifetime across page reload remain unresolved.

## Evidence boundary

The historical Stage 4 fixture work began at
`97bd5b4e47cbf22795d36be252466602f1bc7ddf` and compared its chat, hook,
transport, session and auth sources with
`caac5a796ad19398e2b37dae03576dd313701b71`. The current work starts from
`82761210e57fcb70fef06a4d2d0fa4fd862e2847` and changes `ChatContainer.tsx`
to extract its single owner and presenter, as described above. The historical
comparison is not a claim that the current chat component is unchanged.
Source inspection is not an executed test or a deployed behavior guarantee. Upstream Engram main
search identified `internal/kubernautagent/mcp/tools/investigate.go`; its
runner/session interfaces are not evidence of deployed concurrency or recovery,
and no exact upstream revision is asserted for that current index.

The earlier source-only spike exercised real hooks with synthetic responses and
browser storage. It found conditional feasibility for stable hook owners and a
separate presenter, **not** live AF/KA concurrency, cross-user isolation or
driver reattachment. Obtain relevant maintainer-held evidence privately before
implementing or qualifying auth/logout, browser ownership or driver recovery;
do not publish private details. Source-only presentation must not bypass this
gate. Auth/further CR changes and #2570/parameter editing/V8 remain held.

## Confirmed source, not a proposed API

| Boundary | Source at Console baseline | Consequence for Stage 4 |
| --- | --- | --- |
| Entry and exports | `packages/standalone/src/App.tsx` mounts `KubernautChat`; `packages/ui-core/src/index.ts` exports `KubernautChat`, `ChatContainer`, `useChat`, providers and types, plus the newer source-only foundation. `useRRStatus` is internal, not an index export. | Preserve existing consumers and standalone mounting. Screen IDs in `console/registry.ts` are purposes, not routes or authorization. |
| Authentication | `components/KubernautChat.tsx` obtains a user and, outside mock mode, requires a successful coarse access check before mounting `ChatContainer`. `providers/auth.ts` user fields are name/email/initials. | A successful check is not case, workspace, per-tool or cross-user authorization. Display identity is not a trusted owner key. Source inspection does not qualify logout safety. |
| Owner and presenter | `components/ChatContainer.tsx` now places the existing `useChat`, `useRRStatus`, draft and action handlers in a single owner above `ChatPresenter`. `useRRStatus.ts` starts a status subscription in an effect and aborts it on cleanup. | The extracted provider can outlive its presenter in the controlled test; it is not yet a scoped multi-investigation owner or mounted in the new shell. Do not create a second chat. |
| Stream and status | `lib/a2a-client.ts` retries eligible failures but reports a disconnected live stream as interrupted rather than automatically repeating it. `lib/a2a-status-client.ts` separately subscribes/retries RR status. `useRRStatus` exposes idle/connected/reconnecting/error/not-found and terminal state. | RR lifecycle, response stream and status observation are distinct; a status reconnect is not permission to replay a prompt or claim a driver. Initial failures have their own current hook behavior and require parity review. |
| MCP and actions | `lib/mcp-client.ts` has module-level initialization/session state and can reinitialize and repeat a tool call for specific errors. `ChatContainer.tsx` calls `kubernaut_cancel` separately from response Stop and also contains existing workflow and approval handlers. | Preserve current consumer behavior while qualifying source/auth-scoped MCP state and ambiguous dispatch. The planned new conversation projection must keep RAR discovery/decisions outside chat; merely hiding existing controls is not semantic redaction. No action wiring is authorized here. |
| Browser state | `useChat.ts` loads JSON messages from a tab-global session key; its save path clears `isStreaming`, limits thinking on normal save and falls back to the last ten messages on storage failure. `lib/session-state.ts` manages global phase/context/workflow keys and rotates context on cleanup. | These are existing behaviors, not validated multi-owner snapshots or logout fences. Stored text is not a live stream/driver; a fresh context alone does not prove isolation. |
| Field shapes | `useChat.ts` `ChatMessage` contains RR, Alert-like scope, RCA, workflow and verification data; `RCAData` has separate optional scope and metrics, while `WorkflowOption` has no version field. | Do not join Alert and RCA scope, infer an absent version, conflate missing metrics with zero or expose raw thinking. These types are not an approved recorded-case projection. |

## Fixture implementation and proposed live seam

`FixtureInvestigations` is exported from `@kubernaut/ui-core` for isolated
synthetic presentation. It accepts only a fixture scope, an initial screen and
a synthetic read state, not a data adapter or operation handler. Its private
fixture records and relationship checks are in
`packages/ui-core/src/console/investigation-fixtures.ts`; presentation and
focused tests are in `fixture-investigations.tsx` and
`fixture-investigations.test.tsx`. The component reuses `ReadStatePanel` and
does not mount in standalone. Its list, case and recorded-workspace context are
in-memory component states, not production routes or browser history. It has no
transcript, draft, storage, network, operational action, or live chat owner.
Displayed workspace eligibility is a synthetic fixture assertion only. The
presenter does not implement the accepted live workspace layout or chat parity.
Use `@kubernaut/ui-core/styles/console-foundation.css` for the fixture shell.
Fixture tests cover the local ID/scope/read-state/relationship presentation
boundaries only, not authorization or the G1–G5/INV/OWN/SAFE exit gates.

1. Reuse `screenIds` and `ReadStatePanel` for a fixture-only recorded list and
   exact case view. Keep fixture provenance and dataset/source scope explicit;
   do not add a router, fetcher or endpoint. An exact requested ID must either
   match within the supplied fixture scope or produce missing/out-of-scope; it
   must never fall back to a first row. Protected direct links withhold data and
   counts on denial or scope change. The eight read states stay distinct.
2. Model an optional existing-workspace relationship as an **explicit supplied,
   exact case relationship** with separately supplied access/verification
   outcome. Absent, ambiguous, mismatched, denied or unverified means no open
   workspace affordance; never create one for a historical record or link the
   separate layout fixture to the synthetic case. A fixture boolean is not
   authority and does not define an upstream wire field.
3. A future stable operational owner, above all presenters, captures trusted
   source/auth/session and investigation scope, request generation and distinct
   RR, A2A context/task, MCP session and driver identities. Presenter focus,
   scroll and layout remain local. This is a desired ownership boundary, not
   an implemented identity algorithm. Scope changes invalidate generations
   before cleanup; late events/storage writes must not affect another owner.
4. Future bounded, validated, versioned drafts and snapshots retain stable
   message IDs and permitted partial content, with explicit retention, size,
   legacy migration and privacy policy. Restore interrupted/disconnected, never
   a live driver or streaming state. Do not persist credentials, handles,
   pending actions or private reasoning. Storage errors are best-effort and
   must not widen scope. No replay or resume API is proposed.
5. Keep Alert original scope, RCA target scope and RR identity separately
   sourced. Surface missing values and provenance; a supplied workspace
   relationship is not a target join. List filtering is over loaded authorized
   data only until server filtering/paging is qualified. No implicit start,
   claim, reconnect, selection, approval, cancellation or execution on navigation.

Pure fixture tests exercise exact IDs, denial, provenance, read states and
relationship absence without importing chat or asserting identity security.
Any implementation of actual owner, snapshot, auth or logout behavior
requires the private evidence and reviewed host contracts first. No fixture
model in this slice is exported as a future live adapter.

## Screen and gate matrix

Every row is **open**. Proposed tests are future requirements, not results.

| Screen / gate | Required seam and minimum future evidence |
| --- | --- |
| `investigations.list` | Scoped recorded rows with provenance and honest loaded counts; all eight states, invalid filter no widening, list position retained. Fixture tests cover empty versus denied/unavailable and no implicit actions; backend paging/access remains unqualified. |
| `investigations.case` | Exact read-only RR/case and independently supplied lifecycle, proposal and prior outcomes; exact related links only. Direct-link denied/missing exposes no protected data; fixture tests reject mismatched IDs and missing relationships. |
| `investigations.workspace` | Explicit verified authorized relationship only, then one canonical full workspace using the existing chat's eventual shared owner/presenter; dock is a separate decision. A layout mock or captured text does not establish a relationship or driver. |
| G1 lifecycle/channels | Separately model case/RR phase, task, stream and status connection; test interruption, retained findings, same-case status reconnect, terminal and late events. Live driver ownership is not inferred. |
| G2 clocks/verification | Preserve independently sourced execution, watch, observation, receipt and deadline clocks; all supplied step names/status/details/retries. Test missing/invalid/zero and explicit finished state; elapsed/window expiry is not step duration or recovery. |
| G3 public content / SAFE-01 | Require reviewed semantic projection and negative cases for structured **and generic** RAR narration, private reasoning and tool commands/arguments/results; no assumption that text nodes or an allowlist alone are safe. Announcements must be bounded and meaningful. |
| G4 fields | Exact separately sourced RR/Alert/RCA scopes, exact workflow ID/version, genuine parameters, same-RCA metrics/provenance. Test missing and mismatched scope/version/snapshots; no latest or RCA-derived target inputs. Current `WorkflowOption` needs a qualified version source. |
| G5 actions/ownership | Stable owners, scoped drafts and callbacks, explicit supported guards and destinations; view changes trigger no operational activity. Real auth/source/session and logout contracts plus maintainer-held evidence remain mandatory. |

## Acceptance traceability

| Cases | Future negative and parity proof; all remain open |
| --- | --- |
| INV-01–03 | Test responsive permanent adjustable summary/phone context, independent scope, RR ID-only, RCA/evidence disclosure, workflow placement, message alignment, severity and origin. Include keyboard, both themes and real-device/AT qualification. |
| INV-04–06 | Exercise plain/Markdown, early/missing RCA, discovery variants, error/recovery/alignment/divergence; protect caret/focus around sticky composer and real Activity return against user-intent snapback. No disabled fixture action counts as implemented. |
| INV-07–08 | Test explicit completion without valid duration, timing-only updates, true zero, all verification steps/retries and independent clocks. Confirm same-snapshot RCA metrics, unknown versus zero, no computed effectiveness or ETA. |
| OWN-01–02 | Test interleaved owners across hide/switch without send, claim, reconnect, dispose or cross-owner mutation. Check bounded/versioned snapshots, stable IDs, partial content, legacy and storage failures; restored content is disconnected/interrupted. |
| OWN-03–04 | Test identity/source/logout generation invalidation and stale callbacks, scoped MCP initialization and auth-loading separately. Verify response Stop versus explicit RR Cancel, new conversation/history/templates and no automatic sends or wrong-context reuse. |

SAFE-01 and G1–G5 remain required alongside every relevant INV/OWN case;
fixture tests, source inspection and synthetic browser runs do not close them.
Protected direct-link behavior and no implicit action also require NAV-04/05.
Actual host authorization, cross-user tests, AF/KA concurrent contexts/driver
ownership, supported browsers, real devices and human AT remain separately
qualified. Private companion access is a prerequisite for the affected gates.

## Next handoff: Stage 5, not implemented here

Keep remediation workflow catalog, exact-version detail, execution and
verification pages in Stage 5. They need separately authorized, scoped reads,
exact workflow ID/version and recorded execution/assessment relationships;
unknown, denied and missing remain distinct. Reuse the shared read-state and
provenance presentation without importing chat owner state or granting catalog,
execution, general audit or investigation permissions. No Run/Select/edit,
parameter override or workflow action is implied. Stage 5 must preserve the
distinction between execution, application, assessment, effectiveness, signal
and recovery, and must not treat a case/workspace link as an execution grant.
