# Authoritative design and navigation contract

Read with [the decision ledger](decisions.md). This specifies the intended UX, not a claim that the HTML prototype or current React application implements every runtime requirement.

## Shared shell and foundation

Use one standalone console shell, shared authenticated identity/source context and reusable list/detail/evidence/decision components. Do not make a separate security application, mount the isolated chat in an iframe, duplicate transport implementations, or infer cross-domain evidence/permissions from shared presentation. Existing public component consumers must remain compatible.

The exact logo is [assets/logo.svg](../../../mockups/console/assets/logo.svg). Retain aspect ratio, dark tile and silver/amber strokes plus accessible Kubernaut label. Brand amber is not an operational warning token. The machine-readable paired palette is [design-tokens.json](design-tokens.json), matched to the current prototype's [color CSS](../../../mockups/console/console-color-v7.css).

| Foundation | Required meaning / qualification |
| --- | --- |
| Light | Canvas `#F4F7FB`, surface `#FFFFFF`, text `#172B3A`; primary `#087F8C`, selected tint `#E4F7F7`. |
| Dark | Canvas `#0F1724`, surface `#182334`, text `#E8F0F9`; primary `#4DD0CD`, selected tint `#153C43`. |
| Text/density | Existing prototype uses Red Hat Text/Display with system fallbacks; no font download/installation is assumed. V6 introduced readable14px content,12px metadata and44px principal controls, but specialty compact cells remain smaller. Final production font delivery/type scale/zoom/contrast/AT are not certified by the mock. |
| Interaction | Real links for navigation, labelled native-equivalent controls, visible focus, no hover-only essential information, reduced-motion support. Tables own their horizontal overflow; no whole-page horizontal overflow at supported widths. No headless-library choice is implied. |
| Styling | Tailwind is approved as the new visual foundation; the prototype is plain HTML/CSS, not code to copy wholesale or a benchmark of a particular component framework. Revalidate the reviewed stable pin before a separately authorized dependency change. |

## Navigation hierarchy

| Priority | Destinations | Phone | Desktop |
| --- | --- | --- | --- |
| Operate | Approvals; Investigations | Direct permitted links beside More | First group in sidebar |
| Explore | Overview; Workflows; Managed resources; Clusters | Under More | Second sidebar group |
| Manage | Policies & audit; Administration | Under More | Third sidebar group |

**Phone is ≤699px; desktop/tablet is >699px.** More's Explore/Manage groups use two columns at≥360px; below360px they stack. The disclosure is inline, not a modal, overlay, application-menu role or new summary drawer. The closed navigation occupies one row at tested widths. These priority choices express the user's working hypothesis, not measured traffic or a license to invent urgency/count badges.

Keep one canonical set of link identities and route destinations, not separate desktop/mobile route trees. A secondary current route retains its link's `aria-current`; closed More gets the selected treatment, accessible current-section label and tooltip. The page heading supplies the visible destination name. Never falsely mark More as a destination page.

### More behavior and focus

| Trigger | Outcome |
| --- | --- |
| Enter/Space/click on More | Toggle secondary navigation with accurate `aria-expanded` / `aria-controls`. |
| Tab / Shift+Tab | Ordinary document link order, no trap. Hidden secondary links are not keyboard targets. |
| Escape while navigation is open and focus is inside it | Close navigation; return focus to More. Do not hide summary, cancel work, clear drafts or dismiss unrelated state. |
| Normal unmodified navigation link | Close More, retain inherited final-render route focus/history behavior. Modified/open-new-tab links retain native semantics. |
| Focus leaves navigation / outside pointer action | Close without taking focus back from the user's chosen control. |
| Secondary same-route link | Close without leaving focus in hidden content. |
| Breakpoint change | No hidden focused link. Moving to mobile while a secondary link is focused keeps it exposed; disappearing More on desktop hands focus to a valid visible destination. |
| Phone keyboard focus behind sticky header/fixed composer | Reveal only the newly focused navigation link after native focus scrolling, using measured geometry. Do not continuously anchor normal manual scrolling. |

The accepted new-menu focus repair is in [priority-navigation.js](../../../mockups/console/priority-navigation.js). It is separate from Activity return. At320×568 with a96px draft, a link's bottom must be above the measured composer, not simply have a nonempty DOM rect.

### Permissions, topology and routes

Permission-scoped visibility is not authorization. Enforce direct list/detail/action reads at the existing backend boundary. The synthetic approval-only study shows Approvals and a limited Overview; it does not grant investigation, catalog, global audit, inventory or administration. If only Overview remains secondary, More stays usable and the empty Manage group disappears.

Clusters is fleet-only even when a fleet has one visible cluster. Local mode omits Clusters and the unnecessary inventory cluster filter. Unknown/unavailable topology never silently becomes local. A cluster-detail resource link opens the same inventory with a validated cluster filter. Reject out-of-scope filters rather than widening them.

Prototype hash routes in [screen-inventory.json](screen-inventory.json) identify stable screen purposes; they are not new REST endpoints or an approved production router dependency. Keep normal browser Back/Forward/direct-link/new-tab semantics, final-render heading focus, and scoped return position/drafts. Navigating to a record must not start, resume or claim an agent. Use an existing-workspace affordance only for an authoritatively supplied authorized relationship.

## Independent approval journey

The first runtime slice is independent RAR discovery/review/decision. It must work for operator B with a fresh authorized browser without operator A's chat, cached transcript, investigative rights or LLM call.

### Review composition

One central **Review and decide** form appears before supporting evidence. One ledger shows request ID, recorded target, target namespace, source cluster and true deadline. Originating operator/submitting actor and current reviewer are separate. Unknown context remains unknown; never substitute a different case or latest catalog default. The reason field is neutral for either decision and stays request/source/auth scoped.

Missing/unavailable/partial/stale/forbidden related audit evidence does not disable Approve or Deny if the RAR is readable, authorized and validly pending. Evidence retry affects only that failed read, preserving RAR context, reason, position and both eligible actions. It is not a decision replay, investigation start or global refresh. An unreadable/unidentified RAR, no decision permission, expiry or accepted terminal decision does gate actions.

Explicit confirmation captures the reviewed request/target/namespace/source/deadline/reviewer/reason, not mutable background text. User-facing Deny maps to wire **`Rejected`**; Approve maps to **`Approved`**. Trust backend attribution and authoritative resolution, not a browser display name or successful HTTP status. In-flight and unknown-outcome states must be recoverable without blindly repeating a write; re-read and show what the server established.

### Workflow detour

Every valid proposed workflow carries **ID and version**. Link only to that exact pair under separate read permission. Missing/blank/ambiguous/unavailable refs do not silently resolve by name, newest revision or first list entry. The accepted synthetic exact definition is `wf-demo-01 /1.0.7`; it is not a live relationship or API promise.

One top-left Back above the detail title is visible below sticky overlays. Approval-origin returns the same review draft/focus/position; catalog-origin/direct details return to Workflows. The approval detour hides competing investigation navigation and puts execution history in a collapsed secondary section. Browsing details does not select/run/override a workflow or replay parameters. Approval-only can review the recorded ID/version without acquiring catalog access; optional detail failure is not a decision eligibility gate.

## Investigation workspace and summary

The current [investigation layout study](../../../mockups/console/navigation-investigation.html) is the visual authority for the accepted presentation. The older all-menu `#investigation/rr-demo-02` is a separate relationship/ownership fixture, **not** permission to ship its old chat layout or alias the GitOps `rr-layout-*` case to it.

| Area | Required behavior |
| --- | --- |
| >699px | Permanent right summary with independently scrollable constrained content and real width adjustment. Keep reachable lower scope/Root cause/effectiveness content; no hide/show, drawer or Escape-to-hide. Keyboard Home/End/arrows and pointer resize have usable tablet range and accurate accessible width. |
| ≤699px | Full-width compact top summary above full-width conversation; full source/target context remains reachable. A labelled inner compact-context scroller is allowed to preserve reading budget; Case details expands inline and reveals its trigger/content. Expanded summary is normal flow, not a stale sticky-offset header. |
| Identity | RR ID only in its reference row. Keep independently qualified Alert and RCA-target cluster/namespace/resource identities; do not demand RR controller/service namespace display or infer absent scope. |
| RCA | Compact root cause stays open by default/across stage/workflow navigation. Only detailed evidence/causal chain initially collapses. Preserve long narrative/chain/conclusion and missing data states. |
| Workflow options | Cards stay outside RCA disclosures. All supplied genuine parameters/ID/version remain; omit RCA-derived TARGET_RESOURCE_NAMESPACE/KIND/NAME input rows. Preserve ruled-out reasons/guards and supported action destinations. |
| Message alignment | Human containers right; AI/console containers left; text left-aligned in both. |
| Severity/origin | Signal severity appears in Alert/compact context, using backend-normalized authority. Separate assistant identity from neutral RCA-generated provenance; no verified/compliant/confident implication. |
| Usage | Tokens secondary beside confidence/tool calls/turns; Root cause mirror shares the same RCA snapshot. Missing/pending/partial metrics are not zero, explicit zero is retained. No invented counters, provider costs or composer usage footer. |

### Activity, clocks and verification

Keep a persistent phase plus safe task/actor/qualified timing or a direct Activity return. Distinguish AI analysis, tool work, execution and verification. A pulse means known active and connected; disconnection/failure/interruption/terminal states must not falsely appear live. No raw/provider reasoning, commands/results, invented percent progress or recovery ETA.

Completion is explicit lifecycle state, independent of timestamp availability. Known finished work remains finished and normally completion-collapsed with **Duration: Not available** when clocks are missing; timing changes must not undo a user's reopening. A timestamp alone does not establish completion or driver ownership. Countdown/window expiry is not passed verification or recovery.

Real clocks need distinct provenance: RR execution start, watch start, verification-observation start, event/receipt time and EA deadline are not interchangeable. In the inspected core, step `elapsed_s` is cumulative since verification observation, not individual step duration. Preserve retries, statuses, details and all supported step names, including metrics and generic phase changes; do not hard-code only four illustrated labels.

Activity return preserves draft/disclosures/RCA/focus and reveals phase/task/clock in the actual reading region. The verified residual-scroll fix retains one explicit return intent for real document scrollend, performs a needed still-focused correction once, and cancels on new wheel/touch/pointer/key/focus/view intent. It does not poll, delay arbitrarily, fight normal scrolling or reopen live work after disconnection. Native workflow-reference focus has separate measured header/composer protection.

## Operational ownership and shared-shell feedback

Do not rewrite A2A/MCP/SSE to build the new UI. Stable owner state captures source/auth/session/investigation, owns live hooks/effects/guards, and survives presenter switches. UI focus/scroll/layout stay with the presenter. One owner's callbacks must not mutate another owner's messages, phase, draft or storage. Explicit logout/source/identity changes invalidate generations before clearing scoped snapshots; auth-loading is not logout.

Browser snapshots/drafts are bounded, validated and versioned; restore interrupted/disconnected, not as a recovered stream/driver. No credentials, controllers, live handles, queued actions or raw thinking persistence without a privacy policy. MCP transport session, A2A context/task, RR, browser owner and KA driver are distinct identities. Stop response is not RR cancellation; hide/minimize is neither.

Independent RAR discovery belongs to shared Approvals/notifications, outside conversation. Both synthetic notification sources use one dedup registry; initial list load is quiet. Receipt/dedup lifetime in the prototype is only the open document/scope, not durable cross-document persistence or a global unread/inbox total. Preserve ownership and validation before live integration; do not automatically replay cached alerts/actions.

## Common data states

Loading, ready, valid empty, partial/truncated, stale, unavailable, forbidden and invalid/missing/out-of-scope record are different. Preserve loaded safe context where appropriate; never turn a transport failure into empty/zero/healthy, expose stale protected details after scope change, or widen a rejected filter. Recommendation, selection, execution, application, assessment completeness, effectiveness, signal resolution and independent recovery are distinct facts. Displaying a captured positive label preserves provenance, not newly proven recovery.
