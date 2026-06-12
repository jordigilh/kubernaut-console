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

  it("UT-CONSOLE-MOCK-003: emits structured artifact with investigation_summary DataPart", async () => {
    const events: A2AEvent[] = [];
    await mockStreamA2A("What's crashing?", (e) => events.push(e));

    const artifactEvents = events.filter((e) => e.kind === "artifact-update");
    const investigation = artifactEvents.find(
      (e) => e.kind === "artifact-update" && e.artifact.metadata?.type === "investigation_summary"
    );
    expect(investigation).toBeDefined();

    const dataPart = investigation!.artifact.parts.find((p) => p.kind === "data");
    expect(dataPart).toBeDefined();
    expect(dataPart!.kind).toBe("data");

    const payload = (dataPart as { data: Record<string, unknown> }).data;
    expect(payload.type).toBe("investigation_summary");
    expect(payload.schema_version).toBe("1.0");
    expect((payload.rca as Record<string, unknown>).severity).toBe("critical");
    expect((payload.rca as Record<string, unknown>).confidence).toBe(0.95);
    expect((payload.rca as Record<string, unknown>).causal_chain).toHaveLength(5);
    expect(payload.options).toHaveLength(2);
    expect(((payload.options as Record<string, unknown>[])[0].parameters as Record<string, string>).TARGET_RESOURCE_NAME).toBe("app-config");
    expect((payload.options as Record<string, unknown>[])[1].ruled_out_reason).toContain("selfHeal");
  });

  it("UT-CONSOLE-MOCK-004: artifact includes text fallback part for standard clients", async () => {
    const events: A2AEvent[] = [];
    await mockStreamA2A("What's crashing?", (e) => events.push(e));

    const artifactEvents = events.filter((e) => e.kind === "artifact-update");
    const investigation = artifactEvents.find(
      (e) => e.kind === "artifact-update" && e.artifact.metadata?.type === "investigation_summary"
    );
    expect(investigation).toBeDefined();

    const textPart = investigation!.artifact.parts.find((p) => p.kind === "text");
    expect(textPart).toBeDefined();
    expect((textPart as { text: string }).text).toContain("ArgoCD selfHeal will revert them");
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
