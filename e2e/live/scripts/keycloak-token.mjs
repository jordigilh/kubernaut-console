// Fetches a Keycloak-issued OIDC access token for the shared OpenShift dev
// cluster's `kagenti` realm — the counterpart to dex-token.mjs, used when
// LIVE_E2E_BACKEND=openshift-v15 targets a real, already-deployed
// console+oauth2-proxy+AF stack (release/v1.5) instead of a local
// Kind/fullpipeline cluster fronted by Dex.
//
// Unlike dex-token.mjs's hardcoded synthetic Kind fixture credentials, these
// are real credentials for a dedicated, non-privileged test identity
// (`console-e2e-test`, member of the `platform-engineering` Keycloak group —
// the same group the `sre` persona's ClusterRoleBinding targets) stored in
// the `console-e2e-keycloak-creds` Secret in the cluster's `kubernaut-system`
// namespace, never hardcoded here. Fetch them via:
//   kubectl get secret console-e2e-keycloak-creds -n kubernaut-system \
//     -o jsonpath='{.data.password}' | base64 -d
//
// Uses the access_token (not id_token): oauth2-proxy's
// --skip-jwt-bearer-tokens validates the access token's `aud` claim against
// its configured --client-id, and AF's SAR-based MCP tool ACLs key off the
// access token's `groups` claim — both confirmed by direct testing against
// this cluster (2026-08-03 preflight spike, ADR-009 §14).
export const KEYCLOAK_DEFAULTS = {
  keycloakUrl: process.env.LIVE_E2E_KEYCLOAK_URL ?? "https://keycloak-keycloak.apps.dev.redhat-internal.com",
  realm: process.env.LIVE_E2E_KEYCLOAK_REALM ?? "kagenti",
  clientId: process.env.LIVE_E2E_KEYCLOAK_CLIENT_ID ?? "kubernaut-console",
  clientSecret: process.env.LIVE_E2E_KEYCLOAK_CLIENT_SECRET ?? "",
  username: process.env.LIVE_E2E_KEYCLOAK_USERNAME ?? "console-e2e-test",
  password: process.env.LIVE_E2E_KEYCLOAK_PASSWORD ?? "",
  scope: "openid email profile",
};

/**
 * @param {Partial<typeof KEYCLOAK_DEFAULTS>} [overrides]
 * @returns {Promise<string>} a real Keycloak-issued access token JWT
 */
export async function fetchKeycloakToken(overrides = {}) {
  const cfg = { ...KEYCLOAK_DEFAULTS, ...overrides };

  if (!cfg.clientSecret || !cfg.password) {
    throw new Error(
      "Missing Keycloak credentials. Set LIVE_E2E_KEYCLOAK_CLIENT_SECRET and " +
        "LIVE_E2E_KEYCLOAK_PASSWORD (see e2e/live/scripts/keycloak-token.mjs " +
        "header for how to fetch them from the console-e2e-keycloak-creds Secret).",
    );
  }

  const body = new URLSearchParams({
    grant_type: "password",
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    username: cfg.username,
    password: cfg.password,
    scope: cfg.scope,
  });

  // Keycloak serves a self-signed/cluster-internal-CA cert on this route —
  // same narrowly-scoped, live-E2E-only TLS bypass as dex-token.mjs.
  const previous = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
  let res;
  try {
    res = await fetch(`${cfg.keycloakUrl}/realms/${cfg.realm}/protocol/openid-connect/token`, {
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
    throw new Error(`Keycloak token request failed: HTTP ${res.status} ${text}`);
  }

  const json = await res.json();
  if (!json.access_token) {
    throw new Error(`Keycloak token response had no access_token: ${JSON.stringify(json)}`);
  }
  return json.access_token;
}

// CLI mode: `node keycloak-token.mjs` prints just the token to stdout, so it
// can be captured synchronously (e.g. via execSync) from playwright config.
if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const token = await fetchKeycloakToken();
    process.stdout.write(token);
  } catch (err) {
    process.stderr.write(`${err.message}\n`);
    process.exit(1);
  }
}
