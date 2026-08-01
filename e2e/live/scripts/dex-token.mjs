// Fetches a Dex-issued OIDC token the same way kubernaut's own Go E2E suite
// does (test/e2e/fullpipeline/suite_test.go's getAFToken /
// 06_af_audit_trace_test.go's fpFetchDEXToken) — a password (ROPC) grant
// against Dex's /token endpoint, using the static test client/user Dex is
// seeded with by deploy/apifrontend/overlays/e2e/dex.yaml upstream.
//
// These are synthetic, Kind-cluster-only test fixtures committed in the
// open-source kubernaut repo (not production credentials) — safe to
// hardcode as defaults here, same as upstream does in its own test source.
//
// Verified directly against jordigilh/kubernaut@origin/main on 2026-08-01
// while drafting this suite. Two corrections vs. ADR-009's original text,
// found in that verification pass:
//   1. Dex's host-reachable NodePort is 30556, not 5556 (5556 is only the
//      in-cluster Service port, and is separately reused by an unrelated
//      Dex instance for a different E2E suite — see
//      test/infrastructure/kind-fullpipeline-config.yaml's inline comment).
//   2. Dex's token response is decoded inconsistently even within
//      upstream's own test helpers (`id_token` in one, `access_token` in
//      another). We decode both and prefer `id_token`, since that's the
//      OIDC-standard JWT for an `openid`-scoped request and matches what
//      AF's JWKS-based validation expects.
export const DEX_DEFAULTS = {
  dexUrl: "https://localhost:30556/dex",
  clientId: "kubernaut-apifrontend",
  clientSecret: "e2e-client-secret",
  // "sre" persona: broadest tool ACL in charts/kubernaut/values.yaml
  // (investigate, approve, select_workflow, cancel, etc.). Notably does
  // NOT include kubernaut_complete_no_action (dismiss/escalate) as of the
  // same verification pass — e2e/live/approval-gate.spec.ts's dismiss/
  // escalate scenarios exist specifically to surface whether that's a real
  // authorization gap or stale persona-ACL config.
  username: "sre@kubernaut.ai",
  password: "password",
  scope: "openid email profile groups",
};

/**
 * @param {Partial<typeof DEX_DEFAULTS>} [overrides]
 * @returns {Promise<string>} a real Dex-issued JWT
 */
export async function fetchDexToken(overrides = {}) {
  const cfg = { ...DEX_DEFAULTS, ...overrides };

  const body = new URLSearchParams({
    grant_type: "password",
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    username: cfg.username,
    password: cfg.password,
    scope: cfg.scope,
  });

  // Dex serves a self-signed cert in the e2e overlay (same as AF) — Node's
  // fetch has no per-request TLS-verification override, so this narrowly
  // scoped, live-E2E-only process disables verification for this one call.
  const previous = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
  let res;
  try {
    res = await fetch(`${cfg.dexUrl}/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
  } finally {
    if (previous === undefined) delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
    else process.env.NODE_TLS_REJECT_UNAUTHORIZED = previous;
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Dex token request failed: HTTP ${res.status} ${text}`);
  }

  const json = await res.json();
  const token = json.id_token ?? json.access_token;
  if (!token) {
    throw new Error(`Dex token response had neither id_token nor access_token: ${JSON.stringify(json)}`);
  }
  return token;
}
