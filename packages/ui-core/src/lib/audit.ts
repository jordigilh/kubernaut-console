export interface AuditEvent {
  action: "approve" | "decline" | "escalate" | "dismiss" | "execute_workflow" | "clear_history";
  timestamp: string;
  user?: string;
  rrId?: string;
  detail?: Record<string, string>;
}

export function emitAuditEvent(event: AuditEvent): void {
  const payload = JSON.stringify(event);

  if (navigator.sendBeacon) {
    navigator.sendBeacon("/a2a/telemetry/audit", payload);
  } else {
    fetch("/a2a/telemetry/audit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payload,
      keepalive: true,
    }).catch(() => {});
  }
}
