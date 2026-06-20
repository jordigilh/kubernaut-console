# Changelog

All notable changes to Kubernaut Demo Console are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Multi-platform plugin architecture: standalone (Vite), OCP Console (Webpack Federation), Backstage (Module Federation)
- `@kubernaut/ui-core` shared component library with PatternFly 6
- Phase indicator with live elapsed timer above input area
- Real-time status stream via SSE (`/a2a/status`) with reconnection and idle timeout
- Session persistence across page refreshes (sessionStorage)
- Investigation context bar (RR ID, cluster, severity)
- Approval card with countdown timer, RBAC denial display, and state persistence
- Workflow cards with alignment verdicts and target divergence display
- Verification timer with progress arc
- Query intent gating — remediation UX hidden for read-only queries
- Monotonic phase progression (`maxChatPhase`) preventing stale status regression
- E2E test suite (Playwright): standalone, Backstage, OCM, accessibility, visual regression
- Visual regression baselines stored in OCI registry
- Storybook component stories for all major UI components
- pnpm + Turborepo monorepo orchestration
- CI workflows: build, test, E2E, visual regression, standalone image, OCM image
- Helm chart for standalone deployment with OAuth2 Proxy and nginx
- Verification activity log with live step events (#1427)
- MCP-direct workflow selection (bypasses A2A for deterministic actions)
- Verification step types and event handling in useChat
- Integration tests for RR context extraction (IT-CONSOLE-STATUS-META-001–004)
- Skip-nav link for keyboard accessibility
- ARIA labels on WelcomeState suggestion chips
- VerificationTimer accepts server-provided `startedAt` timestamp
- Comprehensive documentation: architecture, deployment, integration guide, development guide

### Changed
- Migrated from single Vite SPA to monorepo workspace structure
- Replaced Tailwind CSS with PatternFly 6 design tokens in ui-core
- Upgraded to React 19, TypeScript 6, Vite 8
- Moved all shared code from `src/` to `packages/ui-core/src/`
- VerificationTimer uses server timestamps instead of component mount time

### Removed
- `ExecutionStep` interface and `executionSteps`/`executionComplete` fields (replaced by phase-based banner)

### Fixed
- Investigation timer not clearing on new session start
- Phase indicator regression from stale status stream data
- Status stream reconnection flashing before initial connection
- Approval countdown freeze on submit
- Auto-scroll to bottom on message submit
- MCP tool call retry on 404 (stale session recovery)
- MCP session initialization: send notifications/initialized without JSON-RPC id field
- Add verification_step to StatusUpdateEvent type union
- Fix MCP promise type mismatch

## [0.5.12] - 2026-06-15

### Added
- Workflow selection UX with countdown timer and confirmation
- RCA output formatting with structured causal chain parsing
- "No action needed" / "Escalate" escape hatches shown immediately after RCA
- Investigation context banner populated early from RR metadata
- Stabilization window countdown timer (VerificationTimer component)

### Fixed
- Authentication: use X-Forwarded-Access-Token from oauth2-proxy
- Suppress "ALERT: unknown" in investigation banner
- MCP session lifecycle (initialize + notifications/initialized before tools/call)
- Parse SSE-wrapped responses from MCP endpoint

## [0.5.11] - 2026-06-13

### Added
- Inline escalation input (replace modal with rose-toned expand input)
- Always-reserve banner height for zero layout shift
- Escape hatches when no workflows found

### Fixed
- Input focus styling across multiple CSS layer ordering issues
- ThinkingPanel double outline
- Status banner namespace parsing
- Phase set to 'investigation' when stream starts

## [0.5.10] - 2026-06-13

### Added
- CI security hardening: decouple build from scan, reduce Trivy to CRITICAL only
- Escalation tests and namespace type additions

### Fixed
- Modal centering, +New icon replacement, error clear on reset
- Escalation modal replaced with inline expand input

## [0.5.9] - 2026-06-12

### Added
- MCP approval flow (kubernaut_approve, kubernaut_complete_no_action)
- XSS sanitization with rehype-sanitize
- Accessible modals with focus trap
- Session audit events (AC-2, AU-2 compliance)
- Nginx gzip, cache headers, healthz endpoint
- Idle timeout for SSE stream
- ErrorBoundary with telemetry

### Fixed
- Null guard for payload.rca
- Font size normalization
- SSE reconnection error banner suppression
- Approval button swap and disable on click

[Unreleased]: https://github.com/jordigilh/kubernaut-demo-console/compare/v0.5.12...HEAD
[0.5.12]: https://github.com/jordigilh/kubernaut-demo-console/compare/v0.5.11...v0.5.12
[0.5.11]: https://github.com/jordigilh/kubernaut-demo-console/compare/v0.5.10...v0.5.11
[0.5.10]: https://github.com/jordigilh/kubernaut-demo-console/compare/v0.5.9...v0.5.10
[0.5.9]: https://github.com/jordigilh/kubernaut-demo-console/compare/v0.5.8...v0.5.9
