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
base colors. Component tests cover the selected secondary More label and
breakpoint focus handoff, including a synthetic secondary link. A local
fixture-only Chrome check exercised light/dark shell widths 320, 360, 390, 620,
699, 700 and 1024, More/Escape at phone widths, phone-to-desktop focus handoff,
and one inbox-to-review journey at 390px. This is bounded browser evidence, not
real-device or assistive-technology qualification. The full NAV-01–05 matrix
remains open: protected direct links, browser history/heading focus,
sticky/composer geometry, other breakpoint and input transitions, real devices
and AT need implementation and qualification before a production mount. Tailwind/font
delivery remains a separate dependency/design decision. Screen IDs are not
production URL templates. No chat owner, transport, action, identity, browser
state, logout or request-generation contract is implemented by this seam.

## Repeatable browser checks

With the project's dependencies and a Playwright Chromium browser already
available, run from the repository root:

```sh
./node_modules/.bin/playwright test --config playwright.console-foundation.config.ts
```

This separate configuration starts an isolated loopback Vite server, loads the
test fixture entry for these checks, and does not mount it in standalone.
It does not reuse an existing server. `CONSOLE_FOUNDATION_PORT` overrides the
default port; `CONSOLE_FOUNDATION_OUTPUT_DIR` selects a separate results
directory. `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` optionally selects an existing
Chromium-compatible executable instead of Playwright's installed browser.
The normal standalone Playwright configuration excludes this fixture suite.
The E2E workflow runs it after the existing standalone and accessibility suites,
with a separate temporary results directory and failure-trace artifact.

The suite checks phone/desktop navigation at the listed widths in both themes,
keyboard and focus transitions, topology presentation, the fixture approval
journey and serious/critical automated axe findings. Separate read-state browser
checks exercise all eight states, withholding children for non-data states,
supplied provenance, and an explicit targeted retry while retaining an unrelated
draft. These are presentation fixtures, not evidence of authenticated scope
changes or request fencing. The suite does not implement or qualify deferred
links, protected reads, real browser history, human assistive technology use,
or live backend authorization.

Live approval still requires the decision/evidence contracts and upstream
`#2564`/`#2565`; identity, logout, ownership and G1–G5 remain gated. The rollout
plan's foundation step is not complete on the basis of this fixture work.
