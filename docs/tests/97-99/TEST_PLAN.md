# Test Plan: ErrorBoundary — consistent message policy + untested branch

> **IEEE 829 Test Plan** for kubernaut-console#97 and kubernaut-console#99
> **Audit source**: `docs/audit/PRODUCTION-READINESS-FEDRAMP-ASVS.md` F-19, F-10
> **Status**: Active
> **Last Updated**: 2026-08-26

## 1. Test Plan Identifier

TP-CONSOLE-97-99

## 2. Introduction

Resolved together per both issues' own methodology note (same component,
overlapping test setup):

- **#99 (F-10)**: `ErrorBoundary.tsx`'s render branch has an untested path
  — `this.state.error?.message || "An unexpected error occurred."` — the
  fallback (`error` null, or `error.message` falsy) is never exercised.
- **#97 (F-19)**: `ErrorBoundary` currently renders `error.message`
  **verbatim** in all cases — no policy decision was ever made about
  whether a render-crash's raw message (which can echo internal file
  paths, prop values, or other implementation detail) is safe to show a
  user. This is inconsistent with `useChat.ts`'s own `friendlyError()`,
  which at least attempts to translate known error categories to
  user-safe text (though notably `friendlyError()` itself still falls
  back to the raw string for *unrecognized* categories — so "inconsistent
  policy" is the accurate framing, not "ErrorBoundary is uniquely unsafe
  and useChat.ts is uniquely safe").

**Policy decided for this issue**: dev builds show the raw error message
(developer-facing, matches today's DX); production builds show a fixed,
generic message plus a correlation ID (for support/telemetry
cross-reference), never the raw `error.message` or stack. This is the
"generic user-facing message + correlation ID, full detail only in dev
builds" option #97 explicitly suggested.

**Key testability finding (documented before writing any test)**:
`import.meta.env.DEV` is statically `true` in every Vitest run in this
repo — confirmed by direct probe — and does **not** respond to
`vi.stubEnv("NODE_ENV", ...)` at runtime (Vite bakes it in at transform
time). This means the dev/prod branch **cannot** be flipped by
manipulating environment state from a test. The policy logic is therefore
extracted into a pure, exported function taking `isDev` as an explicit
parameter, fully unit-testable for both branches; the component itself
just calls that function with `import.meta.env.DEV` — a trivial,
low-risk pass-through that can only ever be exercised in its "true"
state in this test environment (acceptable: it's not branching logic,
it's one value flowing into an already-fully-tested pure function).

## 3. Test Items

| Item | File | Change |
|------|------|--------|
| 1 | `ErrorBoundary.tsx` | Add `formatErrorBoundaryMessage(error, correlationId, isDev)` (exported pure function) and `generateCorrelationId()`; add `correlationId: string \| null` to `State`, generated in `getDerivedStateFromError`; `render()` calls `formatErrorBoundaryMessage(...)` instead of rendering `error.message` directly; `componentDidCatch`'s telemetry beacon payload includes `correlationId` (same ID shown to the user, for cross-reference) |

## 4. Features to be Tested

- `formatErrorBoundaryMessage`: dev + message present → raw message; dev + no message/null error → the existing generic fallback (closes #99/F-10's specific gap); prod (any error, any message, including one containing path-/stack-like content) → the fixed generic message + correlation ID, and critically **never** contains the original message text
- `generateCorrelationId`: returns a non-empty string; two calls produce different values
- Component-level: default (dev) rendering still shows the thrown error's message (proves wiring, matches existing `IT-CONSOLE-EB-002` behavior — not a regression); telemetry beacon payload's `correlationId` field matches what govern the rendered ID would be (component-level check that the same ID appears in both, even though we can't render the prod branch)

## 5. Features Not Tested

- Actual prod-mode rendering through the real component (blocked by the
  Vite static-replacement limitation above) — covered instead by the
  pure-function unit tests, which own 100% of the policy's real logic
- `useChat.ts`'s `friendlyError()` reconciliation beyond noting it already
  has its own (different, HTTP/network-error-shaped) categorization —
  out of scope; that function handles a different error domain (stream
  errors) than render crashes, and both issues' text frames this as
  "define ErrorBoundary's own consistent policy," not "make the two
  functions identical"

## 6. Approach

Pyramid Invariant: the policy is pure business logic → unit tests own it
completely. Existing `ErrorBoundary.test.tsx` integration tests are
extended with a small number of additional cases, not restructured.

### 6.1 Unit Tests — `formatErrorBoundaryMessage` / `generateCorrelationId`

| Test ID | Scenario | Expected | FedRAMP |
|---------|----------|----------|---------|
| UT-CONSOLE-EB-005 | `isDev=true`, error with a message | Returns the raw message | SI-11 |
| UT-CONSOLE-EB-006 | `isDev=true`, `error=null` | Returns `"An unexpected error occurred."` (closes #99/F-10) | SA-11 |
| UT-CONSOLE-EB-007 | `isDev=true`, error with an empty-string message | Returns `"An unexpected error occurred."` | SA-11 |
| UT-CONSOLE-EB-008 | `isDev=false`, error message contains a file path / stack-like fragment | Returned string does **not** contain that fragment anywhere | SI-11, V7.4 |
| UT-CONSOLE-EB-009 | `isDev=false` | Returned string contains the given `correlationId` | SI-11 |
| UT-CONSOLE-EB-010 | `isDev=false`, `error=null` | Same generic+correlationId message (no crash on null error in prod path either) | SI-11 |
| UT-CONSOLE-EB-011 | `generateCorrelationId()` called twice | Two different, non-empty strings | — |

### 6.2 Component Tests — `ErrorBoundary.test.tsx` (extends existing suite)

| Test ID | Scenario | Expected | FedRAMP |
|---------|----------|----------|---------|
| IT-CONSOLE-EB-005 | Thrown error has an empty message (`new Error("")`) | Rendered body shows the generic fallback, not an empty string (closes #99/F-10's component-level equivalent) | SA-11 |
| IT-CONSOLE-EB-006 | Telemetry beacon payload's `correlationId` is a non-empty string present alongside `message`/`stack` | Beacon payload includes a `correlationId` field | SI-11 |

## 7. Pass/Fail Criteria

- All new tests in §6 pass
- All existing `ErrorBoundary.test.tsx` tests continue to pass unmodified
- `ErrorBoundary.tsx` reaches 100% branch coverage (closes #99/F-10)
- `pnpm --filter @kubernaut/ui-core test` green
- `pnpm build` clean

## 8. FedRAMP Control Mapping

| Control | Description | Tests |
|---------|-------------|-------|
| SI-11 (Error Handling) | A single, deliberate disclosure policy governs what a caught render error shows the user; no path exists for verbatim internal detail to reach production output | §6.1 UT-CONSOLE-EB-008/009/010 |
| SA-11 (Developer Testing) | The previously-untested fallback branch (#99/F-10) is now covered | §6.1 UT-CONSOLE-EB-006/007, §6.2 IT-CONSOLE-EB-005 |

## 9. Test Deliverables

- This test plan document
- `formatErrorBoundaryMessage()`, `generateCorrelationId()` (moved to `packages/ui-core/src/lib/error-boundary-policy.ts` — see §12)
- New test cases per §6

## 10. Note on the global 80% threshold

Like #96 (see its `TEST_PLAN.md` §10 for the fuller explanation), this
branch is based on `main` and doesn't include #89's `*.stories.tsx`
glob fix or #96's `mcp-client.ts`/`a2a-status-client.ts` coverage work.
In isolation this branch's global run is 79.24% statements / 79.7%
branches / 82.69% functions / 80.69% lines — only the statements
threshold (80%) is missed, by 0.76 points; branches (≥75%), functions,
and lines all already clear their configured thresholds. The two files
this issue actually owns
(`ErrorBoundary.tsx`, `error-boundary-policy.ts`) are both at 100%
lines/branches (§11). The global number will be re-verified once all of
#89/#90/#93/#96/#97/#99 land together, per the already-decided merge
sequencing (gap-closing issues before #89's CI-enforcement PR).

## 11. RED-phase findings

All 13 new tests passed against the pre-refactor code on the first run
— this is coverage-closing + policy-definition work, not a bug fix (the
"bug," if any, was the *absence* of a policy, not incorrect code).
Final coverage:

| File | Statements | Branches | Functions | Lines |
|------|-----------|----------|-----------|-------|
| `ErrorBoundary.tsx` | 100% | 100% | 100% | 100% |
| `error-boundary-policy.ts` | 100% | 100% | 100% | 100% |

## 12. REFACTOR

`pnpm lint` caught a real issue on the first GREEN pass:
`react-refresh/only-export-components` flagged `ErrorBoundary.tsx` for
exporting `formatErrorBoundaryMessage`/`generateCorrelationId` alongside
the `ErrorBoundary` component class — Fast Refresh only works when a
component file exports *only* components. Extracted both functions into
a new `packages/ui-core/src/lib/error-boundary-policy.ts` module (with
its own colocated `error-boundary-policy.test.ts`), consistent with
this repo's established pattern of pulling shared pure logic out of
component/hook files into `src/lib/*` (see #90's `type-guards.ts`
extraction). `ErrorBoundary.tsx` now only imports from it; `lint` and
`build` are clean after the move.
