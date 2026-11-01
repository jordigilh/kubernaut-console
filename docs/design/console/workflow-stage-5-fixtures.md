# Stage 5 first wave — workflow fixture presentation

`FixtureWorkflows` provides source-only synthetic presentations for
`workflows.catalog`, `workflows.detail`, `workflows.executions`,
`executions.detail`, and `outcomes.verification`. It is not mounted in
standalone and has no router, API, adapter, network, storage, operational action,
identity or permission implementation. Supply the existing console foundation
stylesheet. The synthetic scope and status inputs are not authorization evidence.

The separately maintained `workflow-fixtures.ts` models definitions with exact
ID/version, independently recorded execution snapshots, and explicitly related
assessments. Uniqueness and scope checks reject missing, duplicated or mismatched
identities and relationships, without choosing latest or first. The display
keeps execution, application, assessment, effectiveness, signal and recovery
separate; unknown fields remain unrecorded. All eight shared read states are
available, and denied/missing views withhold fixture records and provenance.
The component tests cover fixture boundaries only; they do not qualify backend
authorization, source projections, real timestamps, accessibility or live data.
Workflow and assessment schemas here are fixture models, not upstream contracts.

## Remaining handoff

The subsequent [scope fixture wave](scope-stage-5-fixtures.md) covers Overview,
Managed Resources and Clusters. The [governance fixture wave](governance-stage-5-fixtures.md)
covers Policies & Audit and Administration/settings as synthetic presentation.
No general audit, SRE, catalog or execution grant follows from a fixture link.
Parameter editing, overrides, #2570 and V8 remain on hold.

Live Stage 3 RAR remains parked on #2564/#2565, reviewed binding and evidence
contracts, authorization, ownership, logout and concurrency evidence. G1–G5,
NAV, RAR, investigation/ownership, supported browser/device/AT and deployed
acceptance remain open. This fixture wave closes no live acceptance gate.
