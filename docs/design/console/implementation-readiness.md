# Implementation readiness and source boundaries

This is a public requirements/readiness register, not a private findings report or a claim that live integration has passed. Revalidate current source and requirements before coding. The inspected console baseline was `caac5a796ad19398e2b37dae03576dd313701b71`; references to existing symbols identify reuse opportunities, not authorization to call tools or expose all returned data.

## Private implementation-risk companion

Maintainer-held evidence contains additional implementation context for decision consistency/attribution, auth/logout isolation, browser-state ownership and driver-recovery limits. It is worth preserving and is intentionally not published here. Obtain the relevant private companion before implementing or qualifying those affected boundaries; if unavailable, ask the maintainer rather than treating missing evidence as a resolved gate. Pure visual work can use the public specification without receiving unrelated private material.

The public DDs remain authoritative for UX and required acceptance outcomes. The companion supplies supporting technical findings/reproductions, not permission to change accepted behavior or bypass current-source verification. Do not post its details, access links, raw reports or operational metadata in a public PR/issue. Secret/unlisted links are not access control; use maintainer-approved private storage and follow the security policy.

## First slice: independent RAR review

Reuse existing structured MCP RAR list/detail/decision surfaces, shared auth/fetch/access checks and the `@kubernaut/ui-core` public boundary where applicable. Ordinary user-facing Approve/Deny maps to wire `Approved`/`Rejected`. Do not use an agent prompt, require an existing investigation, or emit workflow/parameter overrides to perform an independent decision.

| Contract | Required qualification before live delivery |
| --- | --- |
| Discovery/detail | Supply authoritative request/parent/target/source/deadline and recorded decision context with unknowns/provenance explicit. Do not infer mock filters, totals, paging or target/source enrichment from a compact list DTO. |
| Related evidence | Typed, redacted, RAR-scoped evidence with bounded paging/completeness and a narrow reviewer grant. Browser joins or general audit privileges must not substitute for this contract. See [upstream #2565](https://github.com/jordigilh/kubernaut/issues/2565). |
| Decision consistency | Authoritative pending/deadline/permission checks, reviewed-content binding, conflict handling and preserved accepted attribution. Prove through the real integration boundary; client disabled buttons are insufficient. See [upstream #2564](https://github.com/jordigilh/kubernaut/issues/2564). |
| Optional detail | Exact workflow ID/version; separately authorized definition/audit reads. Failure to retrieve optional evidence does not gate either decision on a readable authorized valid pending RAR. |
| Unknown write result | Reconcile by read before another write. HTTP success or a local state update is not authoritative decision evidence; no automatic decision replay. |

The RAR recommendation requires workflow ID/version. Current Console `ApprovalRequest.recommendedWorkflow` carries that pair when present; the separate interactive `WorkflowOption` needs a qualified version projection. A source type, field name or current catalog entry does not establish the approved versioned-detail read. Never match by name/latest/first record or infer genuine parameters from RCA scope.

The existing approval component/handlers provide presentation and direct MCP patterns, but independent review must not depend on chat messages, the originating browser or display-name attribution. Preserve public component consumers while moving new-console discovery and RAR-derived presentation outside conversations.

## Interactive integration gates

| Gate | Required source-to-UI parity |
| --- | --- |
| G1 — lifecycle/channels | Separate RR/case, task and transport state; preserve idle/wait/discovery/interruption/terminal, retained findings, same-case reconnect semantics and late/stale updates. Timestamp presence alone proves neither completion nor ownership. |
| G2 — clocks/verification | Qualify execution/watch/verification-observation/receipt/deadline clocks independently. Preserve all step names/status/details/retries and missing/invalid/zero/final timing. Cumulative elapsed is not a per-step duration; window expiry is not pass/recovery. |
| G3 — public content | Safe semantic projection, bounded announcements and all structured/generic RAR-derived narration outside chat. Type allowlisting or text-node rendering alone is not semantic redaction. No raw reasoning/tool payloads. |
| G4 — authoritative fields | Immutable original source, independently qualified target scope, exact workflow ID/version, genuine parameters and same-RCA partial/missing metrics. No borrowing scope, latest joins or unknown-to-zero coercion. |
| G5 — actions/ownership | Supported actions/guards/destinations, stable operational owners above the presenter, scoped validated browser history/drafts, auth/source/session invalidation and logout fencing. No view-change sends/cancels or cached-text-as-live-driver recovery. |

Reuse existing A2A/MCP/SSE parsers/auth/error behavior rather than introducing another transport. Keep browser owner, MCP session, A2A context/task, RR and backend driver identities distinct. Presenter changes must not dispose operational owners or silently initiate operations. Response Stop and RR Cancel are explicit separate actions.

The accepted offline studies are not full React renderer parity. Preserve Markdown/plain fallback, early/missing RCA, pending/empty/many/ruled-out/no-recommended workflow states, recovery/alignment/divergence, countdown/alternate confirmation, action-taken guards and error paths, plus new-conversation/history/draft behavior. Disabled mock controls are not implemented actions.

## Other screens and deferred work

Inventory, registry, policy, general audit, settings and overview require authorized sanitized projections and honest freshness/paging/unknowns. Schema/filter presence is not a browser grant, global health/count API or runtime qualification. Execution/application/assessment/effectiveness/signal/recovery remain distinct; the browser does not compute overall effectiveness.

The [Stage 5 workflow fixture wave](workflow-stage-5-fixtures.md) provides
five isolated source-only synthetic views, not production routes or qualified
live reads. The [scope fixture wave](scope-stage-5-fixtures.md) likewise covers
Overview, Managed Resources and Clusters only as synthetic presentation.
The [governance fixture wave](governance-stage-5-fixtures.md) covers Policies &
Audit and Administration as synthetic presentation only. Live contracts and
acceptance for all Stage 5 screens remain open.

Parameter editing/#2570/V8 remain deferred. A core parameter override and interactive driver-bound selection are not interchangeable with independent RAR approval. No parameter editor, new transcript store, replay/resume API, platform write, role/credential management or operational probe is authorized by this documentation.

Select an explicitly authorized implementation slice, register its actual requirement/test mappings and resolve applicable contracts before wiring live actions. Source-only frontend components/tests may use clearly separated typed fixtures while upstream contracts are unresolved, but must not be presented as live-ready. Real-device/virtual-keyboard/AT, alternate-browser, cross-user and deployed acceptance need their own evidence.
