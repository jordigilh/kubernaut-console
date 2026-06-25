# Integration Guide

This document defines the protocols, event schemas, and metadata contracts that Kubernaut Console expects from the API Frontend (AF). Use this guide to implement a compatible backend or integrate the console into your platform.

## Overview

The console communicates with the backend via two protocols:

| Protocol | Transport | Purpose | Endpoint |
|----------|-----------|---------|----------|
| **A2A** | HTTP POST → SSE response | Real-time agent streaming | `POST /a2a/` |
| **MCP** | HTTP POST → JSON response | Discrete tool invocations | `POST /mcp` |

Both use JSON-RPC 2.0 encoding.

---

## A2A Protocol (Agent-to-Agent)

### Request Format

```json
{
  "jsonrpc": "2.0",
  "id": "req-001",
  "method": "message/stream",
  "params": {
    "message": {
      "role": "user",
      "parts": [{ "kind": "text", "text": "Investigate the CrashLoopBackOff alert" }],
      "contextId": "ctx-abc123"
    }
  }
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `method` | string | Yes | Always `"message/stream"` |
| `params.message.role` | string | Yes | Always `"user"` |
| `params.message.parts` | Part[] | Yes | User message content |
| `params.message.contextId` | string | No | Conversation context (omit for new) |

### Response Format

The response body is an SSE stream. Each SSE `data:` line contains a JSON event object.

### Event Types

#### StatusUpdateEvent

```typescript
{
  kind: "status-update";
  taskId: string;
  contextId: string;
  final?: boolean;
  status: {
    state: "submitted" | "working" | "input-required" | "completed" | "failed" | "canceled";
    message?: { role: "agent"; parts: Part[] };
  };
  metadata?: {
    type?: string;     // Event classification
    rr_id?: string;    // Remediation Request ID
    namespace?: string;
    kind?: string;     // K8s resource kind
    target?: string;   // K8s resource name
    alert_name?: string;
    phase?: string;    // CRD phase
    [key: string]: unknown;
  };
}
```

#### ArtifactUpdateEvent

```typescript
{
  kind: "artifact-update";
  taskId: string;
  contextId: string;
  artifact: {
    artifactId: string;
    parts: Part[];           // TextPart and/or DataPart
    metadata?: Record<string, unknown>;
  };
  lastChunk: boolean;
  append?: boolean;          // true = append to previous artifact content
}
```

### Part Types

```typescript
// Text content (markdown, plain text)
{ kind: "text"; text: string }

// Structured data (typed payloads)
{ kind: "data"; data: Record<string, unknown>; mediaType?: string; metadata?: Record<string, unknown> }
```

---

## Status Event Metadata Contract

Every status event emitted after the RemediationRequest (RR) is created MUST include RR context metadata. This enables the console to populate the investigation banner immediately.

### Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `rr_id` | string | Yes (after RR creation) | RemediationRequest CR name |
| `namespace` | string | When available | Namespace of the signal resource |
| `kind` | string | When available | K8s resource kind (Deployment, StatefulSet, etc.) |
| `target` | string | When available | K8s resource name |
| `alert_name` | string | When available | Triggering alert/signal name |
| `phase` | string | Yes (after RR creation) | Current CRD phase |

### Phase Values

The `phase` field maps to the RemediationRequest CRD status:

| CRD Phase | Console Display | Description |
|-----------|----------------|-------------|
| `Pending` | Investigating | RR created, awaiting triage |
| `Processing` | Investigating | Triage in progress |
| `Analyzing` | Investigating | KA investigating root cause |
| `Investigating` | Investigating | KA running tool calls |
| `AwaitingApproval` | Awaiting Approval | Waiting for human approval |
| `Executing` | Executing | Remediation workflow running |
| `Verifying` | Verifying | Stabilization window active |
| `Blocked` | Failed | Blocked by dependency/error |
| `Completed` | Complete | Successfully remediated |
| `Failed` | Failed | Remediation failed |
| `TimedOut` | Failed | Stabilization timed out |
| `Skipped` | Complete | Skipped (no action needed) |
| `Cancelled` | Complete | Cancelled by user/system |

### Timing

- Metadata MUST be present on the **first status event** after RR creation
- Metadata SHOULD be included on **every subsequent status event** (including keepalives)
- Fields that are not yet known MAY be omitted (console handles gracefully)

### Example: Early Keepalive with Metadata

```json
{
  "kind": "status-update",
  "taskId": "t-001",
  "contextId": "ctx-abc",
  "status": { "state": "working", "message": { "role": "agent", "parts": [] } },
  "metadata": {
    "type": "keepalive",
    "rr_id": "rr-47ec5289-a204-5e3d-bdf7-6b444be8cb46",
    "namespace": "demo-gateway",
    "kind": "Deployment",
    "target": "api-frontend",
    "alert_name": "ScalingLimited",
    "phase": "Investigating"
  }
}
```

---

## Status Event Types

The `metadata.type` field classifies how the console processes each event:

| Type | Console Behavior |
|------|-----------------|
| `reasoning` | Appended to ThinkingPanel |
| `tool_call` | Appended to ThinkingPanel with tool badge |
| `preflight` | Appended to ThinkingPanel |
| `keepalive` | Metadata extracted, no text displayed |
| `decision` | Not used directly (decisions come via artifacts) |
| `output` | Parsed as execution progress JSON |
| `approval_request` | Renders ApprovalCard |
| `approval_request_resolved` | Updates ApprovalCard state |
| `problem_resolved` | Sets phase to "complete" |
| `alignment_check_failed` | Displays alignment verdict |

---

## Artifact Schemas

### investigation_summary

Delivered as a `DataPart` within an `artifact-update` event.

```json
{
  "kind": "artifact-update",
  "artifact": {
    "parts": [{
      "kind": "data",
      "data": {
        "type": "investigation_summary",
        "schema_version": "1.0",
        "session_id": "ka-session-xyz",
        "rr_id": "rr-47ec5289",
        "summary": "GitOps drift detected: ConfigMap modified outside Git source.",
        "rca": {
          "severity": "critical",
          "confidence": 0.95,
          "target": "ConfigMap/app-config in demo-webui",
          "causal_chain": [
            "Pod CrashLoopBackOff",
            "Invalid config directive",
            "ConfigMap changed via bad commit"
          ],
          "rca_summary": "Bad commit introduced invalid_directive.",
          "tool_calls_count": 19,
          "llm_turns": 17
        },
        "options": [
          {
            "workflow_id": "git-revert-v2",
            "name": "git-revert-v2",
            "description": "Reverts the most recent commit.",
            "risk": "low",
            "recommended": true,
            "parameters": {
              "TARGET_RESOURCE_NAMESPACE": "demo-webui",
              "TARGET_RESOURCE_KIND": "v1/ConfigMap",
              "TARGET_RESOURCE_NAME": "app-config"
            }
          },
          {
            "workflow_id": "patch-v1",
            "name": "patch-configuration-v1",
            "description": "Direct in-cluster patch.",
            "risk": "high",
            "recommended": false,
            "ruled_out_reason": "selfHeal:true will revert patches"
          }
        ]
      },
      "mediaType": "application/json"
    }],
    "metadata": { "type": "investigation_summary" }
  }
}
```

#### Fields

| Field | Type | Description |
|-------|------|-------------|
| `type` | `"investigation_summary"` | Discriminator |
| `rr_id` | string | Remediation Request identifier |
| `summary` | string | One-line investigation summary |
| `rca.severity` | `"critical" \| "high" \| "medium" \| "low"` | Assessed severity |
| `rca.confidence` | number (0-1) | RCA confidence score |
| `rca.target` | string | Affected resource |
| `rca.causal_chain` | string[] | Ordered cause chain |
| `rca.tool_calls_count` | number | Tools invoked during investigation |
| `rca.llm_turns` | number | LLM reasoning steps |
| `options` | WorkflowOption[] | Remediation workflow options |
| `options[].workflow_id` | string | Unique workflow identifier |
| `options[].recommended` | boolean | Whether this is the recommended option |
| `options[].risk` | string | Risk level |
| `options[].ruled_out_reason` | string? | Why this option was not recommended |
| `options[].parameters` | Record<string, string>? | Workflow parameters |

### execution_progress

Tracks remediation execution state.

```json
{
  "kind": "artifact-update",
  "artifact": {
    "parts": [{
      "kind": "data",
      "data": {
        "type": "execution_progress",
        "schema_version": "1.0",
        "rr_name": "rr-47ec5289",
        "current_phase": "Executing",
        "started_at": "2026-06-14T10:00:00Z",
        "completed_at": null
      },
      "mediaType": "application/json"
    }],
    "metadata": {
      "type": "execution_progress",
      "stabilization_window": "120s"
    }
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `current_phase` | string | Current CRD phase |
| `rr_name` | string | RR identifier |
| `started_at` | ISO 8601 string | When this phase started |
| `completed_at` | ISO 8601 string? | When this phase completed |
| `metadata.stabilization_window` | string | Duration (e.g., "120s", "5m") |

---

## MCP Protocol (Model Context Protocol)

### Endpoint

`POST /mcp`

### Request Format

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "<tool_name>",
    "arguments": { ... }
  }
}
```

### Available Tools

#### kubernaut_approve

Approve or decline a remediation approval request.

```json
{
  "params": {
    "name": "kubernaut_approve",
    "arguments": {
      "rar_name": "kubernaut-system/rar-rr-47ec5289",
      "decision": "Approved",
      "reason": "Reviewed and approved by operator"
    }
  }
}
```

| Argument | Type | Values | Description |
|----------|------|--------|-------------|
| `rar_name` | string | — | RAR name (`namespace/name` from status metadata) |
| `decision` | string | `"Approved"` \| `"Rejected"` | User decision |
| `reason` | string | — | Human-readable justification |

#### kubernaut_complete_no_action

Dismiss or escalate an investigation without executing a workflow.

```json
{
  "params": {
    "name": "kubernaut_complete_no_action",
    "arguments": {
      "rr_id": "rr-47ec5289",
      "reason": "escalate",
      "escalation_reason": "Requires manual database migration"
    }
  }
}
```

| Argument | Type | Values | Description |
|----------|------|--------|-------------|
| `rr_id` | string | — | Remediation Request ID |
| `reason` | string | `"dismiss"` \| `"escalate"` | Action type |
| `escalation_reason` | string | — | Required when reason is `"escalate"` |

### Response Format

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": { "status": "accepted" }
}
```

Error:
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "error": { "code": -32000, "message": "RR not found" }
}
```

---

## Audit Telemetry

The console emits audit events via `POST /a2a/telemetry/audit` (fire-and-forget):

```json
{
  "action": "approve",
  "timestamp": "2026-06-14T10:30:00.000Z",
  "user": "john.doe@example.com",
  "rrId": "rr-47ec5289",
  "detail": { "decision": "approved" }
}
```

| Action | Trigger |
|--------|---------|
| `approve` | User approves RAR |
| `decline` | User declines RAR |
| `escalate` | User escalates with reason |
| `dismiss` | User clicks "No action needed" |
| `execute_workflow` | User triggers workflow execution |
| `clear_history` | User clears chat session |

The backend MAY log or forward these events. The console does not depend on a response.

---

## Authentication Requirements

The console expects OAuth2 Proxy to:

1. Handle the OIDC flow (login, token refresh, logout)
2. Set a session cookie (httpOnly, Secure)
3. Inject `Authorization: Bearer <access_token>` on proxied requests
4. Expose user identity via response headers:
   - `X-Auth-Request-User` — username
   - `X-Auth-Request-Email` — email
   - `X-Auth-Request-Preferred-Username` — display name

---

## Implementing a Compatible Backend

To integrate with Kubernaut Console, your backend must:

1. **Accept** JSON-RPC `message/stream` requests at `/a2a/`
2. **Stream** SSE events (`status-update`, `artifact-update`) in the format above
3. **Include** RR context metadata on all status events after RR creation
4. **Serve** MCP tool calls at `/mcp` (at minimum: `kubernaut_approve`, `kubernaut_complete_no_action`)
5. **Accept** audit telemetry at `/a2a/telemetry/audit` (fire-and-forget, 204 response)

### Minimal Implementation Checklist

- [ ] SSE streaming endpoint at `/a2a/`
- [ ] Status events with `type` metadata field
- [ ] RR context metadata on status events
- [ ] `investigation_summary` artifact with RCA and workflow options
- [ ] `execution_progress` artifact with phase transitions
- [ ] MCP endpoint at `/mcp` with `kubernaut_approve`
- [ ] MCP endpoint with `kubernaut_complete_no_action`
- [ ] Audit telemetry sink at `/a2a/telemetry/audit`
