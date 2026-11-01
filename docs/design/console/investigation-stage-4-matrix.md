# Stage 4 — investigation and chat source-only readiness

**Status: source mapping plus a fixture-only recorded presentation.** No live
adapter, production route, owner refactor or acceptance gate is implemented.
The rollout plan's Stage 4 remains open. Live RAR Stage 3 is
parked pending upstream qualification; the Stage 4 work does not resolve its
UID/content-binding contract conflict. Local labels below are handoff labels,
not registered business requirements or passing tests.

## Evidence boundary

The Console worktree starts at `97bd5b4e47cbf22795d36be252466602f1bc7ddf`.
The existing chat, hook, transport, session and auth files cited below are
unchanged from the inspected `caac5a796ad19398e2b37dae03576dd313701b71`
baseline. `packages/ui-core/src/index.ts` and the foundation are read from the
Stage 4 worktree, not the independently indexed main snapshot. Source inspection
is not an executed test or a deployed behavior guarantee. Upstream Engram main
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
| Owner and presenter | `components/ChatContainer.tsx` instantiates `useChat` and `useRRStatus`, holds input locally, derives an RR from messages, and owns action handlers. `useRRStatus.ts` starts a status subscription in an effect and aborts it on cleanup. | Unmounting the existing presenter is not the required stable-owner boundary. Do not simply embed/unmount it for route switches or implement a second chat. |
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
