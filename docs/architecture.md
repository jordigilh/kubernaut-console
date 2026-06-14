# Architecture

This document describes the system architecture, data flow, and component interactions of Kubernaut Console.

## System Overview

Kubernaut Console is a React Single Page Application (SPA) that communicates with Kubernaut's API Frontend (AF) using two protocols:

1. **A2A (Agent-to-Agent)** — JSON-RPC over Server-Sent Events for real-time agent communication
2. **MCP (Model Context Protocol)** — JSON-RPC over HTTP POST for discrete tool invocations

```
┌─────────────────────────────────────────────────────────────┐
│                        Browser                               │
│  ┌─────────────────────────────────────────────────────┐    │
│  │              Kubernaut Console SPA                    │    │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────────────┐  │    │
│  │  │ useChat  │  │ useUser  │  │  mcp-client      │  │    │
│  │  │ (A2A SSE)│  │ (headers)│  │  (JSON-RPC POST) │  │    │
│  │  └────┬─────┘  └──────────┘  └────────┬─────────┘  │    │
│  └───────┼────────────────────────────────┼────────────┘    │
└──────────┼────────────────────────────────┼─────────────────┘
           │ SSE stream                     │ POST /mcp
           ▼                                ▼
┌──────────────────────────────────────────────────────────────┐
│                    OAuth2 Proxy (port 4180)                    │
│  - OIDC authentication (Dex / Keycloak)                       │
│  - Injects Authorization: Bearer <access_token>               │
│  - Session cookie management (httpOnly, Secure)               │
└──────────────────────┬───────────────────────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────────────────────┐
│                    Nginx (port 8080)                           │
│  ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌──────────┐ │
│  │ /a2a/*     │ │ /mcp       │ │ /.well-    │ │ /        │ │
│  │ → AF:8443  │ │ → AF:8443  │ │  known/*   │ │ static   │ │
│  │ (SSE proxy)│ │ (POST only)│ │ → AF:8443  │ │ files    │ │
│  └────────────┘ └────────────┘ └────────────┘ └──────────┘ │
└──────────────────────┬───────────────────────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────────────────────┐
│              API Frontend (AF) — port 8443                     │
│  - A2A protocol server (JSON-RPC streaming)                   │
│  - MCP tool endpoint                                          │
│  - Manages Kubernaut Agent (KA) sessions                      │
│  - Emits status events with RR context metadata               │
└──────────────────────────────────────────────────────────────┘
```

## Data Flow

### 1. Investigation Flow (A2A)

```
User types message
  → useChat.sendMessage()
  → buildStreamRequest() (JSON-RPC 2.0)
  → POST /a2a/ with streaming response
  ← SSE events arrive:
     ├── status-update (type: "reasoning")     → ThinkingPanel
     ├── status-update (type: "tool_call")     → ThinkingPanel
     ├── status-update (type: "keepalive")     → InvestigationContext (metadata)
     ├── status-update (type: "approval_request") → ApprovalCard
     ├── artifact-update (investigation_summary)  → RCACard + WorkflowCards
     ├── artifact-update (execution_progress)     → InvestigationContext (phase)
     └── artifact-update (text)                   → AgentBubble (markdown)
```

### 2. Approval Flow (MCP)

```
User clicks "Approve" on ApprovalCard
  → callMcpTool("kubernaut_approve", { rr_id, decision: "approved" })
  → POST /mcp (JSON-RPC 2.0: tools/call)
  ← { result: { status: "accepted" } }
  → A2A stream continues with execution_progress events
```

### 3. Escalation/Dismiss Flow (MCP)

```
User clicks "Escalate" or "No action needed"
  → callMcpTool("kubernaut_complete_no_action", { rr_id, reason, escalation_reason? })
  → POST /mcp
  ← { result: { status: "completed" } }
```

## Component Architecture

### State Management

The application uses React hooks for state management — no external state library.

```
ChatContainer (orchestrator)
  ├── useChat()     → messages[], sendMessage(), isStreaming, connectionStatus
  ├── useUser()     → user identity from X-Auth-Request-* headers
  └── local state   → clearConfirmOpen, error
```

### Component Hierarchy

```
App
└── ErrorBoundary
    └── ChatContainer
        ├── InvestigationContext (banner: RR ID, alert, namespace, resource, phase)
        ├── WelcomeState (empty state with suggestion chips)
        ├── MessageList
        │   ├── UserBubble (user messages)
        │   └── AgentBubble (agent messages)
        │       ├── ThinkingPanel (reasoning/tool calls)
        │       ├── RCACard (root cause analysis)
        │       ├── WorkflowCards (decision cards + escape hatches)
        │       ├── ApprovalCard (approve/decline)
        │       ├── VerificationTimer (stabilization countdown)
        │       ├── MarkdownContent (sanitized markdown)
        │       └── StreamingCursor (typing indicator)
        ├── Modal (confirmation dialogs)
        └── InputForm (message input with send button)
```

### Message Lifecycle

Each `ChatMessage` progresses through phases:

```
investigation → decision → remediation → verifying → complete
                                                   → failed
```

Phase transitions are driven by:
- **Status event metadata** (`phase` field from AF)
- **Artifact types** (`investigation_summary` → decision, `execution_progress` → remediation/verifying)
- **Text pattern matching** (legacy fallback for unstructured AF responses)

## Protocol Details

### A2A (Agent-to-Agent)

- **Transport**: HTTP POST with SSE response body
- **Encoding**: JSON-RPC 2.0 (`message/stream` method)
- **Events**: `status-update` and `artifact-update` (see [Integration Guide](integration-guide.md))
- **Connection**: Single long-lived request per conversation turn
- **Reconnection**: Automatic retry on network failure (with backoff)

### MCP (Model Context Protocol)

- **Transport**: HTTP POST / JSON response
- **Encoding**: JSON-RPC 2.0 (`tools/call` method)
- **Endpoint**: `/mcp`
- **Tools**: `kubernaut_approve`, `kubernaut_complete_no_action`
- **Authentication**: Bearer token injected by OAuth2 Proxy

### Status Event Metadata

Every status event after RR creation carries:

```json
{
  "metadata": {
    "type": "reasoning|tool_call|keepalive|...",
    "rr_id": "rr-47ec5289",
    "namespace": "production",
    "kind": "Deployment",
    "target": "api-frontend",
    "alert_name": "HighLatency",
    "phase": "Investigating"
  }
}
```

## Security Architecture

### Authentication

```
Browser → OAuth2 Proxy → OIDC Provider (Dex/Keycloak)
                       ← ID Token + Access Token
                       → Sets session cookie
```

- No client-side token handling
- OAuth2 Proxy extracts user info into `X-Auth-Request-*` headers
- `useUser` hook reads identity from response headers

### Authorization

- All API calls authenticated via Bearer token (injected by proxy)
- MCP tools respect Kubernetes RBAC on the backend
- Console has no direct cluster access

### Data Protection

- No sensitive data stored in browser (sessionStorage for chat history only)
- Audit events fire-and-forget via `sendBeacon` (no response needed)
- CSP prevents data exfiltration via inline scripts or unauthorized domains

## Deployment Topology

See [Deployment Guide](deployment.md) for configuration details.

### Production (Helm)

```
┌─ Pod: kubernaut-console ──────────────────┐
│  Container: oauth2-proxy (port 4180)       │
│  Container: console-nginx (port 8080)      │
└────────────────────────────────────────────┘
         │
         ▼
┌─ Service: kubernaut-console (ClusterIP) ───┐
│  Port 4180 → oauth2-proxy                  │
└────────────────────────────────────────────┘
         │
         ▼
┌─ Route/Ingress ───────────────────────────┐
│  TLS termination (edge)                    │
│  Host: console.apps.cluster.example.com    │
└────────────────────────────────────────────┘
```

### Kind (Demo)

```
┌─ Pod: kubernaut-console ──────────────────┐
│  Container: oauth2-proxy (port 4180)       │
│  Container: console-nginx (port 8080)      │
└────────────────────────────────────────────┘
         │
         ▼
┌─ Service: kubernaut-console (NodePort) ───┐
│  NodePort 30418 → oauth2-proxy:4180        │
└────────────────────────────────────────────┘
```
