/** Presentation visibility only; never a substitute for backend authorization. */
export type NavigationId = "approvals" | "investigations" | "overview" | "workflows" | "resources" | "clusters" | "policies" | "administration";
export type Topology = "fleet" | "local" | "unknown";
export type NavigationItem = { id: NavigationId; label: string; group: "Operate" | "Explore" | "Manage"; availability: "available" | "deferred" | "topology-unknown" };

/** Stable screen purposes, not URLs or claims of implemented screens. */
export const screenIds = ["overview", "approvals.inbox", "approvals.review", "investigations.list", "investigations.case", "investigations.workspace", "workflows.catalog", "workflows.detail", "workflows.executions", "executions.detail", "outcomes.verification", "resources.list", "resources.detail", "clusters.list", "clusters.detail", "governance.policies", "policies.approval", "policies.scope", "governance.audit", "audit.event", "administration", "settings.console", "settings.platform", "settings.access"] as const;
export type ScreenId = typeof screenIds[number];

const items: Omit<NavigationItem, "availability">[] = [
  { id: "approvals", label: "Approvals", group: "Operate" },
  { id: "investigations", label: "Investigations", group: "Operate" },
  { id: "overview", label: "Overview", group: "Explore" },
  { id: "workflows", label: "Workflows", group: "Explore" },
  { id: "resources", label: "Managed resources", group: "Explore" },
  { id: "clusters", label: "Clusters", group: "Explore" },
  { id: "policies", label: "Policies & audit", group: "Manage" },
  { id: "administration", label: "Administration", group: "Manage" },
];

export function navigationFor(access: readonly NavigationId[], topology: Topology): NavigationItem[] {
  return items.filter((item) => access.includes(item.id) && !(item.id === "clusters" && topology === "local"))
    .map((item) => ({ ...item, availability: item.id === "clusters" && topology === "unknown" ? "topology-unknown" : item.id === "approvals" ? "available" : "deferred" }));
}
