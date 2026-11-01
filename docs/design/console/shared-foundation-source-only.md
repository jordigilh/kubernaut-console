# Shared console foundation — source-only seam

This is an incremental foundation, not a mounted application or a production
navigation, authorization, or accessibility qualification. The standalone
application and existing `ApprovalConsole` remain unchanged and unmounted.

`@kubernaut/ui-core` exports `ConsoleShell`, the stable `screenIds` registry,
`navigationFor`, `ReadStatePanel`, and `FixtureApprovalWorkspace`. Import
`@kubernaut/ui-core/styles/console-foundation.css` for the shell and
`@kubernaut/ui-core/styles/approval-console.css` for the fixture pages. A host
must supply the unchanged `/logo.svg` asset and explicitly supply visibility,
topology, URLs and already-authorized content. Visibility is not authorization;
no URL scheme, router, auth context or protected read is invented here.

The isolated `FixtureApprovalWorkspace` composes the existing approval pages
with its own in-memory adapter and fixture reviewer; it accepts no adapter and
cannot submit a live decision. It is not connected to standalone. All other
destinations are explicit deferred presentation, including an unknown-topology
state rather than a local fallback. The fixture's inbox/review transition is
component state, not a browser route or a direct-link contract.

`ReadStatePanel` distinguishes the eight handoff read states, renders children
only for ready/partial/stale, and offers an explicitly supplied retry only for
unavailable reads. It neither performs reads nor fences async work. Callers must
discard protected data on scope changes and establish request ownership before
using it for live data. The existing approval-specific panel remains unchanged.

The responsive CSS implements the 699px and 359px layout boundaries and paired
base colors. The full NAV-01–05 matrix remains open: in particular breakpoint
focus handoff, selected secondary More semantics, protected direct links,
browser history/heading focus, sticky/composer geometry, real devices and AT
need implementation and qualification before a production mount. Tailwind/font
delivery remains a separate dependency/design decision. Screen IDs are not
production URL templates. No chat owner, transport, action, identity, browser
state, logout or request-generation contract is implemented by this seam.

Live approval still requires the decision/evidence contracts and upstream
`#2564`/`#2565`; identity, logout, ownership and G1–G5 remain gated. The rollout
plan's foundation step is not complete on the basis of this fixture work.
