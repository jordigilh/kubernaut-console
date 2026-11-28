// Production console route model for kubernaut-console #169.
//
// The hash templates in docs/design/console/screen-inventory.json are offline
// design studies, not the production route contract. These paths implement the
// accepted navigation (docs/design/console/design-and-navigation.md): one
// canonical set of link identities and route destinations, normal browser
// Back/Forward/direct-link semantics, and exact-match resolution with no
// first-record or list fallback when a reference is absent or malformed.

import type { NavigationId, ScreenId } from "./registry";

export type ConsoleScreenId = ScreenId | "chat";

export interface ConsoleRoute {
  screenId: ConsoleScreenId;
  params: Readonly<Record<string, string>>;
  query: Readonly<Record<string, string>>;
}

interface RoutePattern {
  screenId: ConsoleScreenId;
  /** Path segments; segments starting with ":" are parameters. */
  segments: readonly string[];
  /** Parameter segment names, in path order. */
  params: readonly string[];
}

const P = (screenId: ConsoleScreenId, path: string): RoutePattern => {
  const segments = path.split("/").filter((segment) => segment !== "");
  return {
    screenId,
    segments,
    params: segments.filter((segment) => segment.startsWith(":")).map((segment) => segment.slice(1)),
  };
};

// Order matters only for readability; matching below sorts by specificity
// (more segments first, then more literal segments first) so `/approvals`
// never shadows `/approvals/review/:requestId`.
const patterns: readonly RoutePattern[] = [
  P("chat", "/"),
  P("approvals.inbox", "/approvals"),
  P("approvals.review", "/approvals/review/:requestId"),
  P("investigations.list", "/investigations"),
  P("investigations.case", "/investigations/case/:caseId"),
  P("investigations.workspace", "/investigations/workspace/:rrId"),
  P("overview", "/overview"),
  P("workflows.catalog", "/workflows"),
  P("workflows.detail", "/workflows/:workflowId"),
  P("workflows.executions", "/executions"),
  P("executions.detail", "/executions/:executionId"),
  P("outcomes.verification", "/verifications/:assessmentId"),
  P("resources.list", "/resources"),
  P("resources.detail", "/resources/:resourceId"),
  P("clusters.list", "/clusters"),
  P("clusters.detail", "/clusters/:clusterId"),
  P("governance.policies", "/policies"),
  P("policies.approval", "/policies/approval"),
  P("policies.scope", "/policies/scope"),
  P("governance.audit", "/audit"),
  P("audit.event", "/audit/events/:eventId"),
  P("administration", "/administration"),
  P("settings.console", "/settings/console"),
  P("settings.platform", "/settings/platform"),
  P("settings.access", "/settings/access"),
];

const byScreenId = new Map(patterns.map((pattern) => [pattern.screenId, pattern]));

function specificity(pattern: RoutePattern): number {
  const literals = pattern.segments.filter((segment) => !segment.startsWith(":")).length;
  return pattern.segments.length * 100 + literals;
}

const orderedPatterns = [...patterns].sort((a, b) => specificity(b) - specificity(a));

/** decodeURIComponent that fails closed (unknown route) on malformed input. */
function decode(segment: string): string | null {
  try {
    return decodeURIComponent(segment);
  } catch {
    return null;
  }
}

function parseQuery(search: string): Record<string, string> {
  const query: Record<string, string> = {};
  if (!search) return query;
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  for (const [key, value] of params) query[key] = value;
  return query;
}

/**
 * Resolve a pathname (and optional search string) to a console route.
 * Returns null for any unknown route; an absent or malformed reference never
 * falls back to another screen or record.
 */
export function parseConsoleRoute(pathname: string, search?: string): ConsoleRoute | null {
  const segments = pathname.split("/").filter((segment) => segment !== "");
  for (const pattern of orderedPatterns) {
    if (pattern.segments.length !== segments.length) continue;
    const params: Record<string, string> = {};
    let matched = true;
    for (let i = 0; i < segments.length; i++) {
      const expected = pattern.segments[i];
      if (expected.startsWith(":")) {
        const decoded = decode(segments[i]);
        if (decoded === null || decoded === "") {
          matched = false;
          break;
        }
        params[expected.slice(1)] = decoded;
      } else if (expected !== segments[i]) {
        matched = false;
        break;
      }
    }
    if (matched) return { screenId: pattern.screenId, params, query: parseQuery(search ?? "") };
  }
  return null;
}

/**
 * Build the path for a screen. Throws when a required route parameter is
 * missing or empty — an absent reference must never silently format to a
 * broader screen (list fallback) the way prototype routes never resolved by
 * name/latest/first record.
 */
export function formatConsoleRoute(
  screenId: ConsoleScreenId,
  params: Readonly<Record<string, string>> = {},
  query: Readonly<Record<string, string>> = {},
): string {
  const pattern = byScreenId.get(screenId);
  if (!pattern) throw new Error(`No console route is defined for screen "${screenId}"`);
  let path = "";
  for (let i = 0; i < pattern.segments.length; i++) {
    const segment = pattern.segments[i];
    if (segment.startsWith(":")) {
      const name = segment.slice(1);
      const value = params[name];
      if (value === undefined || value === "") {
        throw new Error(`Console route for "${screenId}" requires parameter "${name}"`);
      }
      // "." / ".." would be normalized away by the browser (or escape the
      // console path space), breaking format/parse symmetry; reject them.
      if (value === "." || value === "..") {
        throw new Error(`Console route parameter "${name}" must not be "." or ".."`);
      }
      path += `/${encodeURIComponent(value)}`;
    } else {
      path += `/${segment}`;
    }
  }
  if (path === "") path = "/";
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== "") search.set(key, value);
  }
  const queryString = search.toString();
  return queryString ? `${path}?${queryString}` : path;
}

/** Section-level navigation destination for each sidebar entry. */
export const sectionScreens: Readonly<Record<NavigationId, ScreenId>> = {
  approvals: "approvals.inbox",
  investigations: "investigations.list",
  overview: "overview",
  workflows: "workflows.catalog",
  resources: "resources.list",
  clusters: "clusters.list",
  policies: "governance.policies",
  administration: "administration",
};

/** Navigation section a screen belongs to, for aria-current linkage. */
export function sectionForScreen(screenId: ConsoleScreenId): NavigationId | undefined {
  for (const [section, screen] of Object.entries(sectionScreens)) {
    if (screen === screenId) return section as NavigationId;
  }
  switch (screenId) {
    case "approvals.review":
      return "approvals";
    case "investigations.case":
    case "investigations.workspace":
      return "investigations";
    case "workflows.detail":
    case "workflows.executions":
    case "executions.detail":
    case "outcomes.verification":
      return "workflows";
    case "resources.detail":
      return "resources";
    case "clusters.detail":
      return "clusters";
    case "policies.approval":
    case "policies.scope":
    case "governance.audit":
    case "audit.event":
      return "policies";
    case "settings.console":
    case "settings.platform":
    case "settings.access":
      return "administration";
    default:
      return undefined;
  }
}
