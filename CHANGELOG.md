# Changelog

All notable changes to Kubernaut Console are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Status metadata extraction from A2A status events for early banner population
- Integration tests for RR context extraction (IT-CONSOLE-STATUS-META-001–004)
- Skip-nav link for keyboard accessibility
- ARIA labels on WelcomeState suggestion chips
- Audit event emission on session clear (FedRAMP AU-2/AU-3)
- VerificationTimer accepts server-provided `startedAt` timestamp
- Kind nginx hardening: security headers, rate limiting, extended SSE timeouts
- Comprehensive documentation: architecture, deployment, integration guide, development guide

### Changed
- VerificationTimer uses server timestamps instead of component mount time

### Removed
- `ExecutionStep` interface and `executionSteps`/`executionComplete` fields (replaced by phase-based banner)

## [0.5.12] - 2026-06-13

### Fixed
- Inline style `border:none` on input to defeat CSS layer ordering issues
- Phase set to "investigation" immediately when agent stream starts

## [0.5.11] - 2026-06-13

### Fixed
- Force `border:0` on input inside focus-delegate pill

## [0.5.10] - 2026-06-13

### Fixed
- Suppress input `:focus` outline (not just `:focus-visible`)

## [0.5.9] - 2026-06-13

### Fixed
- Suppress inner input focus ring via `data-focus-delegate` CSS rule

## [0.5.8] - 2026-06-12

### Added
- Escape hatches (Escalate / No action needed) when no workflows found
- Always-reserve banner height for zero layout shift
- Inline escalation input (replaces modal)
- "New conversation" icon button (replaces text)
- Centered confirmation modal

### Fixed
- Remove unused `hasContent` variable (lint)
- Single border on ThinkingPanel (remove double outline)
- Status display moved to right with dot indicator
- Namespace parsing from RCA target field

### Changed
- CI: decouple build from security scan, reduce Trivy to CRITICAL only
- Escalation tests and schemas updated for inline flow

## [0.5.7] - 2026-06-12

### Added
- GA audit tests: XSS sanitization, Modal, useUser, audit events
- Integration tests for approval and escalation flows

## [0.5.6] - 2026-06-12

### Added
- Semantic HTML elements and on-brand color palette
- Accessibility improvements: ARIA attributes, focus management

### Fixed
- Overflow handling in message bubbles

## [0.5.5] - 2026-06-11

### Added
- XSS sanitization via rehype-sanitize
- Accessible modal component (HTML `<dialog>`)
- Client-side audit telemetry (approve, decline, escalate, dismiss, execute)
- Session redirect on 401

### Fixed
- Unmount cleanup and timer leak fixes
- `/mcp` added to Vite dev proxy

## [0.5.4] - 2026-06-11

### Added
- Nginx hardening: CSP, HSTS, rate limiting, gzip
- Helm chart production-ready configuration
- CI pipeline: lint, test, security scan, build, helm lint

## [0.5.3] - 2026-06-11

### Added
- MCP approval flow: unit and integration tests
- `kubernaut_approve` and `kubernaut_complete_no_action` tool calls

## [0.5.2] - 2026-06-10

### Added
- InvestigationContext banner with RR ID, alert, namespace, resource, phase
- Real-time phase indicator driven by A2A events
- Multi-alert selection with clickable alert items

### Fixed
- Workflow execution button disabled after fire
- Smart separator for thinking panel streaming
- Trailing newlines trimmed from agent text

### Removed
- Polling-based AlertBanner and useAlerts hook (replaced by event-driven banner)

## [0.5.1] - 2026-06-10

### Added
- Investigation context banner component
- RR ID data threading through chat messages

### Fixed
- PhaseIndicator made event-driven instead of hardcoded default

## [0.5.0] - 2026-06-09

### Added
- Workflow countdown timer with immediate execution option
- Thinking entry paragraph breaks and merge separator

### Fixed
- Trailing newline prevention before streaming cursor

## [0.4.5] - 2026-06-08

### Added
- VerificationTimer component with progress bar and countdown
- Stabilization window parsing from artifact metadata

## [0.4.4] - 2026-06-08

### Added
- Execution progress block with step indicators

## [0.4.3] - 2026-06-07

### Added
- Human-in-the-loop ApprovalCard component
- MCP client for JSON-RPC tool invocations

## [0.4.2] - 2026-06-07

### Added
- WorkflowCards with recommended badge and risk indicators
- Ruled-out workflow display with reasons

## [0.4.1] - 2026-06-06

### Added
- RCACard component (severity, confidence, causal chain)
- Investigation summary artifact parsing

## [0.4.0] - 2026-06-05

### Added
- ThinkingPanel with collapsible reasoning display
- Tool call badges in thinking entries
- Preflight event handling

## [0.3.0] - 2026-06-03

### Added
- OAuth2 Proxy integration for OIDC authentication
- useUser hook for identity extraction from headers
- Markdown rendering with GFM support
- Kind deployment manifests

## [0.2.0] - 2026-06-01

### Added
- A2A SSE streaming client with retry logic
- Chat state machine (useChat hook)
- Basic ChatContainer with user/agent bubbles
- Vite + React + TypeScript + Tailwind v4 project setup

[Unreleased]: https://github.com/jordigilh/kubernaut-demo-console/compare/v0.5.12...HEAD
[0.5.12]: https://github.com/jordigilh/kubernaut-demo-console/compare/v0.5.11...v0.5.12
[0.5.11]: https://github.com/jordigilh/kubernaut-demo-console/compare/v0.5.10...v0.5.11
[0.5.10]: https://github.com/jordigilh/kubernaut-demo-console/compare/v0.5.9...v0.5.10
[0.5.9]: https://github.com/jordigilh/kubernaut-demo-console/compare/v0.5.8...v0.5.9
[0.5.8]: https://github.com/jordigilh/kubernaut-demo-console/compare/v0.5.7...v0.5.8
[0.5.7]: https://github.com/jordigilh/kubernaut-demo-console/compare/v0.5.6...v0.5.7
[0.5.6]: https://github.com/jordigilh/kubernaut-demo-console/compare/v0.5.5...v0.5.6
[0.5.5]: https://github.com/jordigilh/kubernaut-demo-console/compare/v0.5.4...v0.5.5
[0.5.4]: https://github.com/jordigilh/kubernaut-demo-console/compare/v0.5.3...v0.5.4
[0.5.3]: https://github.com/jordigilh/kubernaut-demo-console/compare/v0.5.2...v0.5.3
[0.5.2]: https://github.com/jordigilh/kubernaut-demo-console/compare/v0.5.1...v0.5.2
[0.5.1]: https://github.com/jordigilh/kubernaut-demo-console/compare/v0.5.0...v0.5.1
[0.5.0]: https://github.com/jordigilh/kubernaut-demo-console/compare/v0.4.5...v0.5.0
[0.4.5]: https://github.com/jordigilh/kubernaut-demo-console/compare/v0.4.4...v0.4.5
[0.4.4]: https://github.com/jordigilh/kubernaut-demo-console/compare/v0.4.3...v0.4.4
[0.4.3]: https://github.com/jordigilh/kubernaut-demo-console/compare/v0.4.2...v0.4.3
[0.4.2]: https://github.com/jordigilh/kubernaut-demo-console/compare/v0.4.1...v0.4.2
[0.4.1]: https://github.com/jordigilh/kubernaut-demo-console/compare/v0.4.0...v0.4.1
[0.4.0]: https://github.com/jordigilh/kubernaut-demo-console/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/jordigilh/kubernaut-demo-console/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/jordigilh/kubernaut-demo-console/releases/tag/v0.2.0
