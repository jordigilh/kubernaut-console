// Authoritative deployment topology for the production console (#169).
//
// N04 (docs/design/console/decisions.md): navigation depends on the
// authoritative fleet mode, not a cluster count. Local omits Clusters; a
// one-cluster fleet remains fleet; unknown never silently becomes local.
//
// No authoritative deployment-mode source is wired into the browser yet
// (identity/session work is #168; the serving charts own deployment mode),
// so the current input is intentionally absent and the result fails closed
// to "unknown".

import type { Topology } from "@kubernaut/ui-core";

export type DeploymentMode = "fleet" | "local";

/** Pure topology rule: only an explicit authoritative mode grants fleet/local. */
export function deploymentTopology(mode: DeploymentMode | null | undefined): Topology {
  return mode === "fleet" || mode === "local" ? mode : "unknown";
}

/** Current host input: no authoritative mode source yet, so unknown (never local). */
export function currentDeploymentTopology(): Topology {
  return deploymentTopology(undefined);
}
