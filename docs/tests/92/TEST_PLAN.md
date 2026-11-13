# Test Plan: Standalone Auth-Provider Selection and Behavior

> **IEEE 829 test plan** for kubernaut-console#92
> **Audit finding**: F-04
> **FedRAMP / ASVS**: SA-11, IA-2 / V1.1, V3.1
> **Status**: Completed

## 1. Objective and Scope

At plan creation, `packages/standalone` had no Vitest project, test script, or
coverage provider. The completed change adds focused unit coverage for the security-sensitive
selection of the host-owned `ProxyAuthProvider` and its public success/error
behavior. Live E2E authentication is server-side and must not introduce a
browser bearer-token provider.

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
| 4 | `packages/standalone/src/App.test.tsx` | Verify the real App wiring always selects `ProxyAuthProvider`, including when the legacy browser-token variable is set. |
| 5 | `packages/standalone/src/auth-providers.test.ts` | Verify public success and error paths for the host-owned auth provider. |
| 6 | `pnpm-lock.yaml` | Record the workspace dependency changes. |

## 4. Unit Test Matrix

| Test ID | Scenario | Expected result | Control |
|---|---|---|---|
| UT-CONSOLE-AUTH-092-001 | App loads normally | `KubernautChat` receives a `ProxyAuthProvider`. | IA-2 |
| UT-CONSOLE-AUTH-092-002 | App loads with a legacy browser-token variable | `KubernautChat` still receives a `ProxyAuthProvider`; no browser token provider is selected. | IA-2 |
| UT-CONSOLE-AUTH-092-003 | Proxy provider requests a token | Resolves the empty string because oauth2-proxy injects auth server-side. | IA-2 |
| UT-CONSOLE-AUTH-092-004 | Proxy userinfo returns a valid identity | Fetches `/oauth2/userinfo`, selects the documented name/email fields, and computes initials. | IA-2 |
| UT-CONSOLE-AUTH-092-005 | Proxy mock mode is enabled | Returns the deterministic development identity without making a network request. | SA-11 |
| UT-CONSOLE-AUTH-092-006 | Proxy userinfo returns 401/403 | Redirects to `/oauth2/sign_in` and rejects with the redirecting-login error. | IA-2 |
| UT-CONSOLE-AUTH-092-007 | Proxy userinfo returns another HTTP error | Rejects with the response status and does not fabricate a user. | IA-2 |

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

- Focused standalone suite: **21 tests passed**.
- Standalone coverage: **87.71% statements, 87.5% branches, 100% functions
  and 91.83% lines**; the removed browser-token provider is no longer part of
  the source denominator.
- Root `pnpm test`: **785 ui-core tests and 21 standalone tests passed**;
  standalone coverage ran through Turbo.
- Explicit ui-core coverage: **83.33% statements, 83.11% branches, 86.37%
  functions, 86.85% lines**, above its configured thresholds.
- Root `pnpm lint` and `pnpm build`: passed. Existing ui-core lint warnings and
  the existing standalone bundle-size warning remain non-blocking.

## 10. REFACTOR Review

No production refactor was warranted: `App` now constructs one module-level
`ProxyAuthProvider` and passes it directly to `KubernautChat`; there is no
provider-selection ternary or browser-token provider. The tests cover that
selection, including ignoring the legacy browser-token variable, plus the
provider's empty-token behavior, mock identity, same-origin userinfo mapping,
verified `iss`/`sub`/`sid` claims, session supersession, and authentication or
HTTP error handling. Test helpers are limited to dynamic module loading so
each build-time environment variant is isolated. Coverage scope excludes only
test/setup files and the `main.tsx` bootstrap, not the auth logic under test.

## 11. Design / Sequencing Limitations

The disposable Kind lanes keep auth host-owned: Keycloak and Traefik handle the
browser session, and the App always selects `ProxyAuthProvider`. There is no
Vite Dex token helper or browser bearer-token path. These unit tests do not
replace a live Keycloak/Traefik run against the real backend.

This checkout predates the separately tracked F-02/#89 CI-enforcement change,
so its existing ui-core package script remains `vitest run` rather than
`vitest run --coverage`. The standalone package itself invokes coverage and
enforces its thresholds through root Turbo/CI discovery. The explicit ui-core
coverage command above passed; no root threshold was lowered or bypassed.
