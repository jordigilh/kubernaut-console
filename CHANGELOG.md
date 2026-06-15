# Changelog

All notable changes to Kubernaut Demo Console are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Verification activity log with live step events (#1427)
- MCP-direct workflow selection (bypasses A2A for deterministic actions)
- Verification step types and event handling in useChat

### Fixed
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
