import { describe, expect, it } from "vitest";
import {
  formatConsoleRoute,
  parseConsoleRoute,
  sectionForScreen,
  sectionScreens,
} from "./routes";
import { screenIds, type NavigationId } from "./registry";

const detailParams: Record<string, Record<string, string>> = {
  "approvals.review": { requestId: "rar-demo-02" },
  "investigations.case": { caseId: "rr-demo-02" },
  "investigations.workspace": { rrId: "rr-demo-02" },
  "workflows.detail": { workflowId: "wf-demo-01" },
  "executions.detail": { executionId: "we-demo-01" },
  "outcomes.verification": { assessmentId: "ea-demo-01" },
  "resources.detail": { resourceId: "res-demo-01" },
  "clusters.detail": { clusterId: "spoke-a" },
  "audit.event": { eventId: "evt-demo-decision" },
};

describe("UT-CONSOLE-169-001: every screen purpose has a stable production route", () => {
  it("round-trips all 24 screens through format and parse", () => {
    expect(screenIds).toHaveLength(24);
    for (const screenId of screenIds) {
      const params = detailParams[screenId] ?? {};
      const path = formatConsoleRoute(screenId, params);
      const route = parseConsoleRoute(path);
      expect(route, `${screenId} -> ${path}`).not.toBeNull();
      expect(route!.screenId).toBe(screenId);
      expect(route!.params).toEqual(params);
    }
  });

  it("resolves the chat route at the application root", () => {
    expect(parseConsoleRoute("/")).toEqual({ screenId: "chat", params: {}, query: {} });
    expect(parseConsoleRoute("")).toEqual({ screenId: "chat", params: {}, query: {} });
  });

  it("is trailing-slash tolerant without changing the screen", () => {
    expect(parseConsoleRoute("/approvals/")?.screenId).toBe("approvals.inbox");
    expect(parseConsoleRoute("/settings/console/")?.screenId).toBe("settings.console");
  });
});

describe("UT-CONSOLE-169-002: unknown or malformed addresses fail closed", () => {
  it("returns null for unknown paths instead of a nearest match", () => {
    expect(parseConsoleRoute("/nope")).toBeNull();
    expect(parseConsoleRoute("/approvals/review")).toBeNull();
    expect(parseConsoleRoute("/policies/unknown")).toBeNull();
  });

  it("an absent detail reference never falls back to another screen", () => {
    expect(parseConsoleRoute("/approvals/review/")).toBeNull();
    expect(parseConsoleRoute("/audit/events/")).toBeNull();
  });

  it("returns null for malformed percent-encoding rather than throwing", () => {
    expect(parseConsoleRoute("/clusters/%zz")).toBeNull();
    expect(parseConsoleRoute("/resources/%")).toBeNull();
  });
});

describe("UT-CONSOLE-169-003: references survive encoding round-trips", () => {
  it("encodes and decodes identifiers with reserved characters", () => {
    const path = formatConsoleRoute("clusters.detail", { clusterId: "cluster a/b" });
    expect(path).toBe("/clusters/cluster%20a%2Fb");
    expect(parseConsoleRoute(path)?.params.clusterId).toBe("cluster a/b");
  });

  it("preserves unicode identifiers", () => {
    const path = formatConsoleRoute("audit.event", { eventId: "événement-1" });
    expect(parseConsoleRoute(path)?.params.eventId).toBe("événement-1");
  });
});

describe("UT-CONSOLE-169-004: query filters parse exactly and never widen", () => {
  it("parses the exact workflow filter on the executions list", () => {
    const route = parseConsoleRoute("/executions", "?workflow=wf-demo-01");
    expect(route?.screenId).toBe("workflows.executions");
    expect(route?.query).toEqual({ workflow: "wf-demo-01" });
  });

  it("parses a search string without a leading question mark", () => {
    expect(parseConsoleRoute("/approvals", "x=1")?.query).toEqual({ x: "1" });
  });

  it("parses cluster and case filters", () => {
    expect(parseConsoleRoute("/resources", "?cluster=spoke-a")?.query).toEqual({ cluster: "spoke-a" });
    expect(parseConsoleRoute("/audit", "?case=rr-demo-02")?.query).toEqual({ case: "rr-demo-02" });
    expect(parseConsoleRoute("/workflows", "?version=1.0.7")?.query).toEqual({ version: "1.0.7" });
  });

  it("formats query filters and omits empty values", () => {
    expect(formatConsoleRoute("workflows.executions", {}, { workflow: "wf-demo-01" })).toBe(
      "/executions?workflow=wf-demo-01",
    );
    expect(formatConsoleRoute("resources.list", {}, { cluster: "" })).toBe("/resources");
    expect(formatConsoleRoute("governance.audit")).toBe("/audit");
  });
});

describe("UT-CONSOLE-169-005: format is strict about required references", () => {
  it("throws when a required detail parameter is missing", () => {
    expect(() => formatConsoleRoute("approvals.review", {})).toThrow(/requestId/);
  });

  it("throws when a required detail parameter is empty", () => {
    expect(() => formatConsoleRoute("clusters.detail", { clusterId: "" })).toThrow(/clusterId/);
  });

  it("throws for a screen with no defined route", () => {
    expect(() => formatConsoleRoute("not-a-screen" as never)).toThrow(/No console route/);
  });

  it("formats the chat route as the application root", () => {
    expect(formatConsoleRoute("chat")).toBe("/");
  });

  it("rejects dot-segment references that would escape the route path", () => {
    expect(() => formatConsoleRoute("resources.detail", { resourceId: ".." })).toThrow(/\.\./);
    expect(() => formatConsoleRoute("clusters.detail", { clusterId: "." })).toThrow(/\.\./);
  });
});

describe("UT-CONSOLE-169-006: literal segments win over parameterized paths", () => {
  it("prefers the literal policy screens over the policies section route", () => {
    expect(parseConsoleRoute("/policies/approval")?.screenId).toBe("policies.approval");
    expect(parseConsoleRoute("/policies/scope")?.screenId).toBe("policies.scope");
    expect(parseConsoleRoute("/policies")?.screenId).toBe("governance.policies");
  });

  it("prefers the literal audit event route over the audit list", () => {
    expect(parseConsoleRoute("/audit/events/evt-1")?.screenId).toBe("audit.event");
    expect(parseConsoleRoute("/audit")?.screenId).toBe("governance.audit");
  });

  it("prefers the literal settings screens over parameterized detail routes", () => {
    expect(parseConsoleRoute("/settings/console")?.screenId).toBe("settings.console");
    expect(parseConsoleRoute("/settings/platform")?.screenId).toBe("settings.platform");
    expect(parseConsoleRoute("/settings/access")?.screenId).toBe("settings.access");
  });
});

describe("UT-CONSOLE-169-007: sections map to canonical screens", () => {
  it("gives every navigation section a section route", () => {
    for (const section of Object.keys(sectionScreens) as NavigationId[]) {
      const path = formatConsoleRoute(sectionScreens[section]);
      expect(parseConsoleRoute(path)?.screenId).toBe(sectionScreens[section]);
    }
  });

  it("maps screens back to their navigation section", () => {
    expect(sectionForScreen("chat")).toBeUndefined();
    const expected: Record<string, NavigationId> = {
      "overview": "overview",
      "approvals.inbox": "approvals",
      "approvals.review": "approvals",
      "investigations.list": "investigations",
      "investigations.case": "investigations",
      "investigations.workspace": "investigations",
      "workflows.catalog": "workflows",
      "workflows.detail": "workflows",
      "workflows.executions": "workflows",
      "executions.detail": "workflows",
      "outcomes.verification": "workflows",
      "resources.list": "resources",
      "resources.detail": "resources",
      "clusters.list": "clusters",
      "clusters.detail": "clusters",
      "governance.policies": "policies",
      "policies.approval": "policies",
      "policies.scope": "policies",
      "governance.audit": "policies",
      "audit.event": "policies",
      "administration": "administration",
      "settings.console": "administration",
      "settings.platform": "administration",
      "settings.access": "administration",
    };
    for (const screenId of screenIds) {
      expect(sectionForScreen(screenId), screenId).toBe(expected[screenId]);
    }
  });
});
