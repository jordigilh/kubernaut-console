# Design authority and decision ledger

This is the current normative interpretation of recorded user decisions. IDs below are **handoff-local references**, not newly registered business requirements. Historical design studies do not override this reconciled specification. A newer request can change this baseline, but implementation must not resolve a conflict by silently choosing an older mock, source renderer, screenshot or plan paragraph.

## Precedence by subject

| Subject | Use | Explicitly superseded / not implied |
| --- | --- | --- |
| Workflow | Reviewed local prototype/spec, shared tokens, typed source mappings | Native Figma completeness, quota or flattened image exports are not prerequisites; no Figma calls/workarounds. |
| Navigation | N01–N04 and current priority-navigation prototype | Old flat wrapping menu, old full-menu mobile toggle, “navigation unapproved” in inherited `tokens.json` and bluebook metadata. |
| Palette/status | Current paired tokens and D02–D03 | Earlier muted palette tables and the old Remediated-neutral suggestion. |
| Investigation layout | I01–I06 and latest investigation HTML with Activity-return repair | Prior phone-right-only layout, hideable desktop summary, Escape-to-hide, old scrolling/focus/lifecycle defects. |
| Approval | A01–A05 and versioned workflow review study | In-chat independent RAR decisions; optional workflow version; missing audit as an action gate. |
| APIs/security | Pinned source, typed contract qualification and gate register | Synthetic fixture fields, disabled buttons, old green test summaries or a source struct are not live/backend acceptance. |

## Foundation and navigation

| ID | Decision / required outcome | Basis and scope |
| --- | --- | --- |
| D01 | Prototype-led design is the implementation reference. New presentation uses Tailwind, retaining public consumers and domain/transport behavior. | User selected prototype-first and Tailwind; stable4.3.3 was the reviewed pin, not permission to install it now or assume a later version. Headless primitives/font assets remain a separate choice. |
| D02 | Retain exact logo, paired light/dark colors and semantic role names. | Approved V7.3 foundation, original silver/amber artwork. No recoloring or external-brand UI. |
| D03 | Completed is neutral lifecycle; Full is blue completeness; Not captured is dashed neutral unknown; supplied Remediated is green/check with provenance. | V7/V7.1/V7.2 decisions; hue never stands alone and no independent recovery measurement is invented. |
| N01 | ≤699px: permitted Approvals and Investigations directly accessible; secondary destinations under More. | User authorized navigation-only draft, then tested and said “done, it works”. No measured-usage claim or fabricated urgency totals. |
| N02 | >699px: Operate / Explore / Manage groups in the existing sidebar. More uses two groups in columns≥360px and stacks below360px. | Same accepted navigation study. Same route destinations and scope, not a parallel application. |
| N03 | Navigation is permission-scoped. Approval-only does not require investigation/catalog/general-audit access. | Existing fixture boundary is a study, not server RBAC implementation. |
| N04 | Clusters depends on authoritative fleet mode, not count. Local omits it; unknown does not mean local. | One visible cluster remains fleet. Shared inventory is not duplicated per cluster. |

## Independent approval and workflow context

| ID | Decision / required outcome | Basis and scope |
| --- | --- | --- |
| A01 | Independent cross-operator RAR review is outside conversations. No inserted RAR cards/events/links/reasons/decision controls in chat. | Shared shell owns discovery. ManualReviewRequired is not necessarily a pending RAR. Genuine non-RAR agent content remains subject to safe projection. |
| A02 | Missing/partial/stale/unavailable/forbidden related evidence does not disable either decision on an independently readable, authorized, valid pending RAR. | Human decides sufficiency and supplies reason. Authorization, identity, expiry, terminal state and conditional-write gates still apply. |
| A03 | One central decision form and one request/target/namespace/source/deadline ledger; originating operator and reviewer are distinct. | Accepted approval refinement, no duplicate competing decision panels. Confirmation shows an immutable contextual snapshot. |
| A04 | Proposed workflow **ID and version are mandatory**. Exact match only; never latest/by-name/first-record substitution. | Explicit user correction, confirmed RAR schema; malformed/missing refs remain invalid rather than a normal optional-version proposal. |
| A05 | One top-left contextual Back from exact workflow details; approval-origin returns draft/focus/position to that review. History is secondary/collapsed. | Provisionally accepted workflow-review study. Separate catalog permission; unavailable optional details do not invalidate pending review. |

## Investigation presentation and information preservation

| ID | Decision / required outcome | Basis and scope |
| --- | --- | --- |
| I01 | >699px permanent width-adjustable right summary. No drawer/toggle/Escape-to-hide. ≤699px full-width compact top summary above full-width conversation. | Approved layout correction. Keep all context reachable, including long scopes; do not gain space by removing information. |
| I02 | RR ID only; no service-namespace display demand. Original alert and RCA target retain independently qualified cluster/namespace/resource identities. | Explicit corrections. Missing target scope is not borrowed from source scope. Backend-scoped identifiers still remain intact internally. |
| I03 | Compact RCA open by default and through stage/workflow navigation; detailed evidence/causal chain initially collapsed. Workflow cards outside that disclosure. | Accepted investigation behavior, retain no-match/partial/alternative/action semantics during integration. |
| I04 | Human containers right, AI/console left; all message text left-aligned. Chat AI identity is separate from neutral RCA-only AI-generated provenance. | No implication of verification, confidence, compliance or recovery from identity/provenance. |
| I05 | Signal severity belongs in Alert/case summary and compact phone context, not RCA accent/badge. Backend-normalized signal severity wins over model severity. | Approved placement; severity and confidence are different dimensions. |
| I06 | Tokens secondary beside confidence/tool calls/turns, mirrored from the same RCA snapshot in Root cause. Pending/missing/partial≠zero; explicit zero stays zero. | No composer-wide token footer; qualify all missing counters/confidence, not only tokens. |
| I07 | Phase plus safe current task/qualified timing and native Activity return remain discoverable. Final duration and completion do not depend on valid end timestamps. | F1/F2/F3 repairs independently scoped-passing on their candidate. New navigation has separate parent evidence, not inherited independent approval. |
| I08 | Keep genuine supplied workflow parameters, mandatory ID/version and guarded action destinations. Do not add RCA-derived TARGET_RESOURCE_NAMESPACE/KIND/NAME input rows. | No invented parameters or implicit selection/execution; parameter editing remains held. |

## Ownership, scope and unresolved choices

| ID | Required boundary | Qualification |
| --- | --- | --- |
| O01 | Stable operational owners above the visible presenter; preserve supported A2A/MCP/SSE, browser-owned history/drafts and logout safeguards. | Risk spike demonstrates conditional frontend reuse, not production implementation or same-user live concurrency. |
| O02 | View change/hide is not cancellation. Response Stop and RR Cancel are different explicit actions. | No automatic sends, replay, driver claim, workflow selection or approval because a view opens. |
| O03 | Cached text is not live-driver recovery; restoring must not silently become streaming. | No new backend transcript/history service, resume API, automatic prompt/action replay or invented recovery ETA. |
| O04 | One shared console across future remediation domains; share layout, not permissions/evidence/outcome semantics. | No generic plugin framework, threat implementation or new metrics authorized. |
| H01 | Auth/further CR work awaits the user's #2574 hold; parameter/#2570/V8 held. No Figma/upload/share/preview restart/operational changes. | Recorded work constraints persist regardless of whether an issue's remote status later changes. Ask before lifting a user hold. |

Typography/font delivery, headless primitives, whole-UI accessibility, optional dock/multi-investigation integration, live concurrency/driver claims and all materially untested states remain explicitly unqualified. The accepted right-summary/full-width-phone layout is not reopened by those uncertainties.

## Evidence timeline, not a blanket acceptance claim

2026-10-28: user chose prototype-first/full-menu design. 2026-10-29: V7.3 foundation repairs verified. 2026-10-30: approval/workflow navigation provisionally accepted; mandatory version corrected. 2026-10-31: Activity-return fix independently scoped PASS, then navigation draft parent-verified and accepted by user. Current publication: persist the reconciled design/DDs and runnable mockups in a documentation-only pull request. **No implementation/deployment authorization is inferred from these milestones.**
