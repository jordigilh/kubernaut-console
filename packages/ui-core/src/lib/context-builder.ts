export interface DeferredContextMetadata {
  target?: string;
  resource?: string;
  alert_name?: string;
  signal_name?: string;
}

/**
 * Builds a structured XML-tagged context block for deferred injection into
 * a fresh A2A session. Includes the RR ID and available tool hints so the
 * agent can answer post-mortem questions without the old session history.
 *
 * @see ADR-008: Session Awareness After MCP Actions
 */
export function buildDeferredContext(
  rrId: string,
  phase: string,
  metadata?: DeferredContextMetadata,
): string {
  const lines = [
    '<previous_investigation>',
    `  rr_id: ${rrId}`,
    `  phase: ${phase}`,
  ];

  if (metadata?.target) {
    lines.push(`  target: ${metadata.target}`);
  }
  if (metadata?.resource) {
    lines.push(`  resource: ${metadata.resource}`);
  }
  if (metadata?.alert_name || metadata?.signal_name) {
    lines.push(`  alert: ${metadata.alert_name ?? metadata.signal_name}`);
  }

  lines.push(
    '  tools_available: kubernaut_get_audit_trail(rr_id), kubernaut_get_remediation_request(rr_id)',
    '</previous_investigation>',
  );

  return lines.join('\n');
}
