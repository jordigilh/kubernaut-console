# Operational console design — authoritative reference

This directory is the version-controlled design and implementation handoff for the standalone Kubernaut console. It captures accepted navigation/presentation decisions, per-screen contracts, runnable mockups and implementation acceptance requirements. **Design acceptance is not production/runtime readiness.**

## Read first

1. [Decisions and supersession](decisions.md), then [design and navigation](design-and-navigation.md).
2. [Screen contracts](screen-contracts.md) and [machine-readable inventory](screen-inventory.json).
3. [Implementation readiness](implementation-readiness.md) and [acceptance/delivery](acceptance-and-delivery.md).
4. [New-session prompt](new-session-prompt.md) for implementation handover.

The current fixture-backed source-only correction is mapped in
[approval-first-source-only.md](approval-first-source-only.md). Its limitations
are explicit; it is not a live-readiness claim.
The [RAR contract seam](rar-live-contract-seam.md) maps that fixture model to
current upstream source and the unresolved live-read requirements.
The [Stage 3 matrix](rar-stage-3-matrix.md) connects those gaps to owners,
decision states and RAR-01–08 evidence without authorizing live wiring.

Written current contracts govern behavior. The current mockups govern demonstrated visual composition; historical screenshots do not reinstate superseded chrome. Actual source/API/permission contracts constrain what can be wired, but do not silently override an approved UX correction. If a required behavior is unsupported, identify the contract gap rather than inventing data, expanding privileges or redesigning it without review.

## Open the mockups

| Reference | Purpose |
| --- | --- |
| [Menu/approval prototype](../../../mockups/console/navigation-demo.html) | All eight menu destinations, approval review and exact-version workflow detour; synthetic and recorded datasets remain separate. |
| [Investigation layout](../../../mockups/console/navigation-investigation.html) | Current right-summary/phone-top-summary and conversation presentation, safe activity and navigation. |
| [Visual gallery](../../../mockups/console/gallery.html) |147 indexed captures: six current navigation/layout captures plus141 historical screen/state references. |
| [Design tokens](design-tokens.json) | Approved paired palette and exact logo reference. |

Open the HTML files locally from a checkout; GitHub's source view does not execute them. No backend, Figma access, dependency installation or preview server is required. See the [mockup README](../../../mockups/console/README.md) for boundaries. The separate investigation layout link is a review aid, not an actual case/workspace relationship or cross-document draft/driver persistence implementation.

## Accepted baseline and open gates

The user tested the priority navigation and confirmed it works: at≤699px, permitted Approvals/Investigations are direct and secondary destinations are under More; above699px, the sidebar is grouped Operate/Explore/Manage. Preserve the approved V7.3 logo/themes/status semantics and the current investigation/approval behavior contracts.

The first runtime delivery remains independent cross-operator RAR discovery/review/approve-or-reject without the originating chat or investigative rights. All-menu designs do not make inventory, dashboards, general audit, administration or parameter editing prerequisites.

Full information/state/action parity, typed read projections, least-privilege grants, conditional decisions, browser ownership, supported browsers/AT and deployed acceptance remain explicitly gated. Current mockup check counts and historical review outcomes are not production test passes or a blanket independent audit. The design handoff does not implement application behavior, change authentication or deploy live state. Accompanying runtime-base security maintenance is tracked separately in the [image scan record](../../security/standalone-image-scan-exceptions.md), not treated as authorization for the console redesign.

## Public reference boundary

This repository contains the design/DDs, allowlisted mockup assets, synthetic/historical fixture projections, screenshots and reproducible checks. It intentionally excludes private technical/security reports, source-level vulnerability observations, credentials, machine paths, operational investigation records, raw transcripts/provider reasoning, copied source trees and large historical archives. Security observations follow [SECURITY.md](../../../SECURITY.md); public prerequisites describe requirements/tests, not private findings.

Relevant private findings are retained separately, not discarded with an implementation worktree. The [private-companion requirement](implementation-readiness.md#private-implementation-risk-companion) tells the next session when to request that context from the maintainer. Its contents and access links must not be committed publicly.

## Verify and maintain

Run `python3 scripts/check-console-design.py` from the repository root. The check uses Python's standard library and validates local references, assets, tokens, screen/visual inventory and mockup hashes without executing a backend or exporter. An optional installed-Playwright smoke check is documented in the mockup README.

Update the specification deliberately with approved design changes. Keep stable decision/screen references, source provenance, fixture-vs-runtime distinctions and acceptance tests together. Do not copy the prototype's DOM or disabled actions as an implemented React feature. [ADR-010](../../adr/010-prototype-led-console-design.md) records this authority model. Existing runtime contribution conventions remain in force outside a separately authorized redesign slice.
