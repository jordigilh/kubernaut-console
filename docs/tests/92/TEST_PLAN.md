# Test Plan: Standalone Auth-Provider Selection and Behavior

> **IEEE 829 test plan** for kubernaut-console#92
> **Audit finding**: F-04
> **FedRAMP / ASVS**: SA-11, IA-2 / V1.1, V3.1
> **Status**: Completed

## 1. Objective and Scope

`packages/standalone` currently has no Vitest project, test script, or coverage
provider. This plan adds focused unit coverage for the security-sensitive
selection of `ProxyAuthProvider` versus the live-E2E-only
`LiveE2EAuthProvider`, and for the public success/error behavior of both
providers.

The production auth behavior is unchanged. `main.tsx` bootstrap behavior,
real OAuth/Dex infrastructure, and browser-level operator journeys remain out
of scope; the existing Playwright suites cover those higher-level concerns.

The repository's existing root setup was inspected before implementation:

- `turbo.json` runs each workspace package's `test` task after dependency
  builds.
- The root `vitest.config.ts` owns the existing ui-core and Storybook projects.
- `packages/ui-core/vitest.config.ts` is the package-level model and enforces
  80% lines, 80% functions, 75% branches, and 80% statements.

The standalone package will therefore get its own focused Vitest config and
the same threshold floor. Its `test` script will invoke `vitest run
--coverage`, so Turbo's existing root `pnpm test` task discovers it without
changing or weakening the existing ui-core/root gates.

## 2. Pyramid Invariant

The provider methods and build-time selection decision are business logic, so
unit tests own their input/output and failure contracts. The App selection
tests render the real `App` component with only `KubernautChat` and
`ErrorBoundary` replaced by a capture stub; this proves the production
selection value reaches the wiring point without adding a new integration or
E2E surface. No backend or browser-auth infrastructure is required.

## 3. Test Items

| Item | File | Change |
|---|---|---|
| 1 | `packages/standalone/package.json` | Add `test`/`test:watch` scripts and Vitest, jsdom, React Testing Library, and v8 coverage tooling as package dev dependencies. |
| 2 | `packages/standalone/vitest.config.ts` | Add a React/jsdom Vitest project with explicit source coverage scope and the existing 80/80/75/80 threshold floor. Exclude tests, setup, and the `main.tsx` bootstrap from the denominator. |
| 3 | `packages/standalone/src/test/setup.ts` | Install the shared DOM matcher setup used by the App component test. |
| 4 | `packages/standalone/src/App.test.tsx` | Verify default/empty-token selection and non-empty-token selection through the real App wiring. |
| 5 | `packages/standalone/src/auth-providers.test.ts` | Verify public success and error paths for both auth providers. |
| 6 | `pnpm-lock.yaml` | Record the workspace dependency changes. |

## 4. Unit Test Matrix

| Test ID | Scenario | Expected result | Control |
|---|---|---|---|
| UT-CONSOLE-AUTH-092-001 | App loads without `VITE_LIVE_E2E_TOKEN` | `KubernautChat` receives a `ProxyAuthProvider`. | IA-2 |
| UT-CONSOLE-AUTH-092-002 | App loads with a non-empty `VITE_LIVE_E2E_TOKEN` | `KubernautChat` receives a `LiveE2EAuthProvider`; the live provider is not selected by the default path. | IA-2 |
| UT-CONSOLE-AUTH-092-003 | Proxy provider requests a token | Resolves the empty string because oauth2-proxy injects auth server-side. | IA-2 |
| UT-CONSOLE-AUTH-092-004 | Proxy userinfo returns a valid identity | Fetches `/oauth2/userinfo`, selects the documented name/email fields, and computes initials. | IA-2 |
| UT-CONSOLE-AUTH-092-005 | Proxy mock mode is enabled | Returns the deterministic development identity without making a network request. | SA-11 |
| UT-CONSOLE-AUTH-092-006 | Proxy userinfo returns 401/403 | Redirects to `/oauth2/sign_in` and rejects with the redirecting-login error. | IA-2 |
| UT-CONSOLE-AUTH-092-007 | Proxy userinfo returns another HTTP error | Rejects with the response status and does not fabricate a user. | IA-2 |
| UT-CONSOLE-AUTH-092-008 | Live provider has a token | Returns the exact build-time token. | IA-2 |
| UT-CONSOLE-AUTH-092-009 | Live provider has no token | Rejects with the provider safety error explaining the live-E2E-only guard. | IA-2 |
| UT-CONSOLE-AUTH-092-010 | Live provider resolves its identity | Returns the stable `sre-user` identity used by live E2E. | IA-2 |

## 5. Pass/Fail Criteria

- All tests in this plan pass in the standalone package.
- Standalone coverage passes 80% lines, 80% functions, 75% branches, and 80%
  statements without excluding the auth-provider or App source files.
- `pnpm --filter @kubernaut/standalone test` and root `pnpm test` pass.
- Root lint and build checks pass; no existing root/ui-core coverage threshold
  is lowered or bypassed.

## 6. Verification Commands

```bash
pnpm --filter @kubernaut/standalone exec vitest run --coverage
pnpm --filter @kubernaut/standalone lint
pnpm --filter @kubernaut/standalone build
pnpm test
pnpm lint
pnpm build
```

## 7. TDD / Review Record

Implementation follows RED → GREEN → REFACTOR. RED is expected to establish
the missing package/config/test surface before production changes (there are
no intended production behavior changes). GREEN adds the minimal package test
infrastructure and tests. REFACTOR removes only test/setup duplication while
preserving the coverage scope and thresholds.

Any inability to run the full root checks because the separately tracked F-02
coverage-enforcement change is not present on this branch will be recorded as
an external sequencing limitation rather than addressed by lowering a gate.

## 8. RED Findings

The first focused run failed as expected because `packages/standalone` had no
Vitest executable or test script. After the package tooling was added, the
first App test also exposed that the workspace export points at an unbuilt
`ui-core/dist`; the standalone Vitest config resolves the ui-core source entry
for focused tests, while the App test still mocks the child UI components.
No production behavior defect was found.

## 9. GREEN / Verification Results

- Focused standalone suite: **16 tests passed**.
- Standalone coverage: **100% statements, branches, functions, and lines**
  for `App.tsx`, `ProxyAuthProvider.ts`, and `LiveE2EAuthProvider.ts`.
- Root `pnpm test`: **562 ui-core tests and 16 standalone tests passed**;
  standalone coverage ran through Turbo.
- Explicit ui-core coverage: **82.52% statements, 82.83% branches, 84.03%
  functions, 83.84% lines**, above its configured thresholds.
- Root `pnpm lint` and `pnpm build`: passed. Existing ui-core lint warnings and
  the existing standalone bundle-size warning remain non-blocking.

## 10. REFACTOR Review

No production refactor was warranted: the existing selection ternary and both
provider implementations were already small and directly testable. The test
helpers are limited to dynamic module loading so each build-time environment
variant is isolated. Coverage scope excludes only test/setup files and the
`main.tsx` bootstrap, not the auth logic under test.

## 11. Design / Sequencing Limitations

`VITE_LIVE_E2E_TOKEN` is a Vite build-time value, not a runtime feature flag.
The selection tests use Vitest environment stubbing plus module resets to
model the separate production and live-E2E builds; they do not replace a live
Dex/fullpipeline run. No live E2E run was required or attempted for this
unit-only issue.

This checkout predates the separately tracked F-02/#89 CI-enforcement change,
so its existing ui-core package script remains `vitest run` rather than
`vitest run --coverage`. The standalone package itself invokes coverage and
enforces its thresholds through root Turbo/CI discovery. The explicit ui-core
coverage command above passed; no root threshold was lowered or bypassed.
