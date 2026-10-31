# ADR-010: Prototype-led operational console design authority

- **Status:** Accepted design direction; runtime implementation remains separately gated
- **Date:** 2026-10-31

## Context

The standalone operational console spans independent approvals, recorded cases, interactive investigations, workflows, resources, fleet registry, policy/audit and administration. A screenshot alone cannot define data authority, permissions, lifecycle/error behavior or operational side effects. Local-only artifacts and conversation history are also insufficient as the implementation reference for a new session.

## Decision

Persist the reconciled DDs, screen/state/action contracts, paired tokens, exact logo, runnable static studies and indexed visual references in this repository. [The design entry](../design/console/README.md) identifies the authority and supersession rules. Written accepted behavior governs interactions; current accepted mockups govern demonstrated composition; current qualified source/API contracts govern what may be wired. Unsupported requirements become explicit gates, not fabricated data or silently changed design.

Retain one standalone shell and reusable presentation/adapters while preserving existing public component consumers and A2A/MCP/SSE/auth behavior. Tailwind is the selected foundation for the future operational presentation; this decision does not migrate the existing PatternFly runtime or authorize dependency changes.

At≤699px, permitted Approvals and Investigations remain direct, with secondary Explore/Manage destinations under More. Above699px the sidebar groups Operate/Explore/Manage. Visibility remains permission-scoped; Clusters depends on authoritative fleet mode, not count. The current desktop permanent adjustable right summary and phone full-width top summary are retained.

Independent cross-operator RAR review is outside conversations and remains the first runtime slice. It must not require the originating chat, investigative privileges, LLM interpretation, dashboards or inventory. Missing optional related evidence does not gate an otherwise readable, authorized, valid pending human decision. Authoritative attribution, expiry, reviewed-content binding and conditional decision consistency still require qualification.

The repository reference set includes only publishable design material and allowlisted fixture projections. It excludes private safety reports, source-level vulnerability observations, operational records, credentials, absolute machine paths, copied source trees and historical archives. Security disclosures follow [SECURITY.md](../../SECURITY.md).

## Consequences

- New sessions can follow the accepted design through stable repository-relative documents and runnable examples without a prior chat or external design service. Implementing affected safety boundaries also requires the [private companion evidence](../design/console/implementation-readiness.md#private-implementation-risk-companion); missing access does not close those gates.
- Per-screen contracts and acceptance tests preserve information/state/action semantics rather than merely copying prototype DOM.
- Historical screenshots cannot reinstate superseded navigation, palette or layout. Captures and prototype checks are not production test passes.
- Full interactive source parity and narrow review-read/permission/decision contracts remain explicit implementation gates. Offline role/topology selectors and disabled buttons do not close them.
- Native design-service synchronization is optional, not a prerequisite. No live backend, transcript service, replay/resume capability, parameter editor, platform mutation or deployment is introduced by this documentation PR.
