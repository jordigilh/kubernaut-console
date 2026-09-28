# Implementation and Test Plan: Issue #139

## Objective

Expose the authenticated username and email in the Console profile control,
clear the browser-side Console session before sign-out navigation, and verify
that the deployed OAuth2 Proxy/IdP path requires a fresh login.

The Console owns identity presentation and local-state invalidation. Persistent
OAuth2 Proxy configuration is owned by deployment repositories and is tracked
by:

- `kubernaut-operator#483`: reconciliation-owned OAuth2 Proxy configuration.
- `kubernaut#2448`: Helm value/template persistence.

## Preflight and Spikes

- `ProxyAuthProvider` already receives `preferredUsername` and `email`.
- `ChatContainer` already clears transcript, pending context, phase/workflow
  state, and rotates the backend context before `/oauth2/sign_out`.
- OAuth2 Proxy 7.15.3 on the current hub supports
  `--backend-logout-url` with `{id_token}`.
- Hub OIDC discovery reports
  `https://keycloak:8443/realms/kubernaut-demo/protocol/openid-connect/logout`
  as `end_session_endpoint`.
- A live browser spike against `https://kubernaut-console.local:8843` proved
  the temporary backend logout argument reaches the Keycloak login form after
  sign-out and does not restore the seeded transcript.
- The Helm release's computed values do not contain the temporary logout
  setting, so a reconcile/upgrade persistence gap remains external to this
  repository.

## Pyramid Invariant

Unit tests prove identity formatting and safe fallbacks. Integration tests
prove `ChatContainer` exposes the claims and retains the server-owned logout
URL while existing coverage proves state clearing. Live E2E proves the
authenticated browser journey through OAuth2 Proxy and Keycloak. No tier
substitutes for another.

| Tier | Test | Business behavior |
|---|---|---|
| UT | `UT-CONSOLE-AUTH-007` in `lib/user-identity.test.ts` | Username and email are exposed together; missing claims fail closed to a useful label |
| IT | `IT-CONSOLE-AUTH-002` in `ChatContainer.auth.test.tsx` | The real component exposes both claims and keeps `/oauth2/sign_out` as the server-owned boundary |
| IT | `IT-CONSOLE-AUTH-001` in `ChatContainer.integration.test.tsx` | Transcript and browser session state are cleared before navigation |
| E2E | `e2e/live/logout.spec.ts` | OAuth2 Proxy and the IdP require a fresh login, and the old transcript is absent |

## Control-Objective Crosswalk

These are business-level evidence claims, not a standalone compliance claim.

| Business behavior | FedRAMP / NIST 800-53 | SOC 2 | OWASP ASVS 5.0 | Evidence |
|---|---|---|---|---|
| Operator can identify the authenticated username and email | AC-2, AC-6 | CC6.1 | V7.2.1 | UT-CONSOLE-AUTH-007, IT-CONSOLE-AUTH-002, live E2E |
| Console transcript/context is removed before auth navigation | AC-12 | CC6.3 | V3.3 | Existing UT-CONSOLE-SESSION-019, IT-CONSOLE-AUTH-001, standalone E2E |
| IdP session termination prevents silent re-authentication | AC-12 | CC6.1, CC6.3 | V3.3, V7.2.1 | Live Keycloak spike and live E2E; persistent config issues #483/#2448 |
| OIDC tokens remain server-side and logout uses OAuth2 Proxy | AC-6 | CC6.1 | V8 | Source review, IT-CONSOLE-AUTH-002, deployment tests |

## Verification

```bash
pnpm --filter @kubernaut/ui-core exec vitest run \
  src/lib/user-identity.test.ts \
  src/components/ChatContainer.auth.test.tsx \
  src/components/ChatContainer.integration.test.tsx \
  src/lib/session-state.test.ts
pnpm --filter @kubernaut/ui-core test
pnpm --filter @kubernaut/ui-core lint
pnpm --filter @kubernaut/ui-core build
pnpm exec playwright test e2e/standalone.spec.ts
pnpm exec playwright test e2e/live/logout.spec.ts \
  --config=playwright.live-kind.config.ts
```

The live test requires the deployment-side logout argument from #483/#2448;
the current hub's temporary patch is suitable for preflight only.

## Confidence

**Console implementation confidence: 0.94.** The identity fix is isolated,
the existing local-state behavior is covered, and the provider logout flow
was verified against the live hub. Full deployment acceptance remains gated
on the reconciliation/Helm changes tracked upstream in #483 and #2448.
