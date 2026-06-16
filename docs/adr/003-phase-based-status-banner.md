# ADR-003: Phase-Based Status Banner (vs Step Indicators)

## Status

Accepted (supersedes previous ExecutionProgress step indicator design)

## Context

During remediation execution, the user needs visibility into what phase the system is in. We initially implemented a step-by-step progress indicator (`ExecutionProgress` component) that showed discrete steps (Cloning, Reverting, Verifying, etc.) with done/running/pending states.

### Problems with Step Indicators

1. **Steps are backend-specific**: Different workflow engines (Ansible, Tekton, K8s Jobs) produce different step granularities
2. **Step names are opaque**: "Cloning GitOps repository" is an implementation detail, not user-meaningful
3. **Maintenance burden**: Required the `ExecutionStep` interface, step array computation, and mapping logic
4. **Phase is sufficient**: Users care about "what phase am I in?" not "which YAML task is executing"

### Options Considered

1. **Keep step indicators** — Render backend-reported steps with state badges
2. **Phase-based banner** — Single status line showing the current CRD phase with a progress dot
3. **Timeline view** — Vertical timeline with phase transitions and timestamps

## Decision

Use a **phase-based status banner** (`InvestigationContext`) that displays the current CRD phase mapped to user-friendly labels. Remove the `ExecutionStep` infrastructure entirely.

## Rationale

- **Simpler mental model**: 6 phases (Investigating → Awaiting Approval → Executing → Verifying → Complete/Failed) are easy to understand
- **Engine-agnostic**: Works identically regardless of whether Ansible, Tekton, or K8s Jobs are executing
- **Always populated**: Phase comes from RR CRD status, available from the first status event
- **Zero layout shift**: Fixed-height banner reserves space from the start
- **Less code**: Removed `ExecutionStep` interface, step computation, and related test assertions
- **Aligned with CRD**: The banner directly reflects the Kubernetes CR status, creating a single source of truth

### Trade-offs

- **Less granularity**: Users cannot see individual workflow steps (acceptable — they can check workflow logs if needed)
- **No ETA**: Without step count, we can't estimate completion (but we have the VerificationTimer for the stabilization phase)

## Consequences

- `ExecutionStep` interface removed from `useChat.ts`
- `executionSteps` and `executionComplete` fields removed from `ChatMessage`
- `InvestigationContext` component shows: RR ID, alert name, namespace, resource, and phase
- Phase transitions driven by `event.metadata.phase` from status events
- `VerificationTimer` provides detailed progress only during the stabilization window
- Tests updated to assert on `phase` field instead of step arrays
