import { describe, it, expect } from "vitest";
import { mockStreamA2A } from "./a2a-mock";
import type { A2AEvent, StatusUpdateEvent } from "./a2a-types";

describe("mockStreamA2A (gitops-drift)", { timeout: 30000 }, () => {
  it("UT-CONSOLE-MOCK-001: emits preflight events first in investigation flow", async () => {
    const events: A2AEvent[] = [];
    await mockStreamA2A("What's crashing?", (e) => events.push(e));

    const statusEvents = events.filter((e): e is StatusUpdateEvent => e.kind === "status-update");
    const preflightEvents = statusEvents.filter((e) => e.metadata?.type === "preflight");
    expect(preflightEvents.length).toBe(3);
    expect(preflightEvents[0].status.message?.parts[0].text).toBe("Analyzing...");
  });

  it("UT-CONSOLE-MOCK-002: emits tool_call events during investigation", async () => {
    const events: A2AEvent[] = [];
    await mockStreamA2A("What's crashing?", (e) => events.push(e));

    const statusEvents = events.filter((e): e is StatusUpdateEvent => e.kind === "status-update");
    const toolCalls = statusEvents.filter((e) => e.metadata?.type === "tool_call");
    expect(toolCalls.length).toBeGreaterThanOrEqual(5);
    expect(toolCalls[0].status.message?.parts[0].text).toContain("kubectl_previous_logs");
  });

  it("UT-CONSOLE-MOCK-003: emits decision event with extended RCA payload", async () => {
    const events: A2AEvent[] = [];
    await mockStreamA2A("What's crashing?", (e) => events.push(e));

    const statusEvents = events.filter((e): e is StatusUpdateEvent => e.kind === "status-update");
    const decision = statusEvents.find((e) => e.metadata?.type === "decision");
    expect(decision).toBeDefined();
    expect(decision!.final).toBe(true);

    const payload = JSON.parse(decision!.status.message!.parts[0].text);
    expect(payload.rca.severity).toBe("critical");
    expect(payload.rca.confidence).toBe(0.95);
    expect(payload.rca.causal_chain).toHaveLength(5);
    expect(payload.options).toHaveLength(2);
    expect(payload.options[0].parameters.TARGET_RESOURCE_NAME).toBe("app-config");
    expect(payload.options[1].ruled_out_reason).toContain("selfHeal");
  });

  it("UT-CONSOLE-MOCK-004: emits CTA artifact before decision event", async () => {
    const events: A2AEvent[] = [];
    await mockStreamA2A("What's crashing?", (e) => events.push(e));

    const artifactEvents = events.filter((e) => e.kind === "artifact-update");
    expect(artifactEvents.length).toBe(1);
    expect(artifactEvents[0].artifact.parts[0].text).toContain("ArgoCD selfHeal will revert them");
  });

  it("UT-CONSOLE-MOCK-005: remediation flow emits execution steps", async () => {
    const events: A2AEvent[] = [];
    await mockStreamA2A("Use git-revert-v2", (e) => events.push(e));

    const statusEvents = events.filter((e): e is StatusUpdateEvent => e.kind === "status-update");
    const outputEvents = statusEvents.filter((e) => e.metadata?.type === "output");
    expect(outputEvents.length).toBe(4);

    const lastPayload = JSON.parse(outputEvents[3].status.message!.parts[0].text);
    expect(lastPayload.completed).toBe(true);
  });
});
