import { describe, it, expect } from "vitest";
import { emitAuditEvent, type AuditEvent } from "./audit";

describe("audit", () => {
  it("UT-CONSOLE-AUDIT-001: AU-2 — emitAuditEvent includes action, timestamp, and user", () => {
    const events: string[] = [];
    const beaconSpy = (globalThis.navigator.sendBeacon as unknown) = (url: string, body: string) => {
      events.push(body);
      return true;
    };

    const event: AuditEvent = {
      action: "approve",
      timestamp: "2026-06-10T12:00:00Z",
      user: "admin@kubernaut.io",
      rrId: "rr-abc123",
      detail: { rarName: "test-rar", reason: "looks good" },
    };

    emitAuditEvent(event);

    expect(events).toHaveLength(1);
    const parsed = JSON.parse(events[0]);
    expect(parsed.action).toBe("approve");
    expect(parsed.timestamp).toBe("2026-06-10T12:00:00Z");
    expect(parsed.user).toBe("admin@kubernaut.io");
    expect(parsed.rrId).toBe("rr-abc123");
    expect(parsed.detail.rarName).toBe("test-rar");

    (globalThis.navigator as unknown as Record<string, unknown>).sendBeacon = beaconSpy;
  });
});
