# Test Plan: CI never runs tests with --coverage; configured threshold never enforced

> **IEEE 829 Test Plan** for kubernaut-console#89
> **Audit source**: `docs/audit/PRODUCTION-READINESS-FEDRAMP-ASVS.md` F-02
> **Status**: Active
> **Last Updated**: 2026-08-26

## 1. Test Plan Identifier

TP-CONSOLE-89

## 2. Introduction

`packages/ui-core/vitest.config.ts` configures coverage thresholds
(80% statements/lines, 75% branches, 80% functions), but `ui-core`'s own
`package.json` `test` script is plain `vitest run` — no `--coverage` flag.
`.github/workflows/ci.yml`'s "Run tests" step runs the root `pnpm test`
(→ `turbo run test` → each package's `test` script), so CI has never once
invoked `--coverage`, meaning the threshold has never gated a merge despite
being configured for over a month.

Root-causing this before fixing it surfaced a **second, independent bug**:
`vitest.config.ts`'s `coverage.exclude` list contained
`"src/**/*.stories.{tsx}"` — a single-option brace-expansion glob. Vitest's
underlying `test-exclude`/glob matcher does not expand a single-option
`{tsx}` the same as a bare `.tsx`, so every Storybook `*.stories.tsx` file
in `src/components/` was being *included* in the coverage denominator as
0%-covered "business logic" it manifestly isn't (dev-only Storybook
scaffolding, never imported by production code or tests). This alone
depressed statement coverage from the real ~82.6% down to the reported
79.17%, i.e. most of the "gap" the audit measured was a coverage-tooling
bug, not missing tests.

Both bugs are fixed here. The real, tooling-corrected coverage remaining
gaps in specific files (`mcp-client.ts`, `a2a-status-client.ts`,
`ErrorBoundary.tsx`) are tracked separately as F-07 (#96) and F-10 (#99) —
this issue is scoped to making the CI gate real and correct, not to writing
net-new business-logic tests.

## 3. Test Items

| Item | File | Description |
|------|------|-------------|
| 1 | `packages/ui-core/vitest.config.ts` | Fix `coverage.exclude` glob so `*.stories.tsx` files are actually excluded from the coverage denominator |
| 2 | `packages/ui-core/package.json` | `test` script runs `vitest run --coverage`, so `pnpm test`/`turbo run test`/CI all enforce the configured thresholds without any CI-specific special-casing |

## 4. Features to be Tested

- Storybook `*.stories.tsx` files are excluded from the coverage report (0 files with `.stories.tsx` in the lcov output)
- `pnpm --filter @kubernaut/ui-core test` fails the process (non-zero exit) if coverage drops below the configured thresholds
- `pnpm --filter @kubernaut/ui-core test` succeeds today, proving the current (tooling-corrected) coverage already clears the existing thresholds without lowering them

## 5. Features Not Tested

- Closing per-file coverage gaps in `mcp-client.ts`/`a2a-status-client.ts` (F-07, #96) or `ErrorBoundary.tsx` (F-10, #99) — tracked separately
- `packages/standalone` participating in coverage enforcement (F-04, #92) — that package has no test infrastructure yet at all

## 6. Approach

This is a config/tooling fix, not new business logic — no new unit test
file is added. Verification is procedural: run the coverage command before
and after each fix and diff the reported numbers/exit code.

### 6.1 RED — reproduce both bugs

1. `npx vitest run --coverage` with the original `"*.stories.{tsx}"` exclude glob → confirm `.stories.tsx` files appear in the lcov report at 0% coverage, and the run prints `ERROR: Coverage for statements (79.17%) does not meet global threshold (80%)`.
2. Confirm `packages/ui-core/package.json`'s `test` script has no `--coverage` flag, and that running plain `pnpm test` never surfaces the threshold failure at all (the bug is invisible in normal CI).

### 6.2 GREEN — apply both fixes

1. Change the exclude glob to `"src/**/*.stories.tsx"` (no braces).
2. Add `--coverage` to `ui-core`'s `test` script.
3. Re-run `pnpm --filter @kubernaut/ui-core test` — confirm exit code 0 and all four metrics (statements/branches/functions/lines) at or above threshold.

### 6.3 REFACTOR

No structural refactor needed — this is a minimal, targeted two-line fix.

## 7. Pass/Fail Criteria

- `pnpm --filter @kubernaut/ui-core test` exits 0 with `--coverage` enabled and all four metrics ≥ configured thresholds
- Coverage lcov report contains zero `*.stories.tsx` entries
- `pnpm build && pnpm test && pnpm lint` green across the monorepo
- CI (`ci.yml`) "Run tests" step surfaces a coverage-threshold failure as a build failure, verified by a scratch commit that deliberately lowers coverage (see Open Item)

## 8. FedRAMP Control Mapping

| Control | Description | Verification |
|---------|-------------|---------------|
| SA-11 (Developer Testing) | Automated test coverage is measured and gated in CI, not merely configured and ignored | `test` script change + local run |
| CM-6 (Configuration Settings) | The coverage-threshold configuration actually takes effect as intended, rather than being silently inert | Exclude-glob fix + before/after coverage numbers |

## 9. Test Deliverables

- This test plan document
- `packages/ui-core/vitest.config.ts` exclude-glob fix
- `packages/ui-core/package.json` `test` script fix
- Before/after coverage numbers recorded in the PR description

## 10. Open Item (Non-Blocking)

Confirming the CI gate actually fails a PR on a real coverage regression
(vs. just failing locally) requires either a throwaway commit on a scratch
branch that deliberately drops coverage, or trusting that a non-zero local
exit code from `vitest run --coverage` propagates identically through
`turbo run test` → `pnpm test` → GitHub Actions' default "step fails the
job" behavior (it does, per Turborepo's documented pass-through exit-code
semantics). Not re-verified end-to-end in this PR to avoid a noisy
disposable CI run; flagging so a reviewer can request it if they want the
belt-and-suspenders proof.
