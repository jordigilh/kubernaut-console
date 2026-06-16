# Architecture

This document describes the system architecture, data flow, and component interactions of Kubernaut Console.

## System Overview

Kubernaut Console is a React Single Page Application (SPA) that communicates with Kubernaut's API Frontend (AF) using two protocols:

1. **A2A (Agent-to-Agent)** — JSON-RPC over Server-Sent Events for real-time agent communication
2. **MCP (Model Context Protocol)** — JSON-RPC over HTTP POST for discrete tool invocations

```mermaid
graph TB
    subgraph Browser
        SPA["Kubernaut Console SPA"]
        useChat["useChat<br/>(A2A SSE)"]
        useUser["useUser<br/>(headers)"]
        mcpClient["mcp-client<br/>(JSON-RPC POST)"]
        SPA --> useChat
        SPA --> useUser
        SPA --> mcpClient
    end

    useChat -->|"SSE stream"| OAuthProxy
    mcpClient -->|"POST /mcp"| OAuthProxy

    subgraph Pod["Kubernetes Pod"]
        OAuthProxy["OAuth2 Proxy<br/>(port 4180)"]
        Nginx["Nginx<br/>(port 8080)"]
        OAuthProxy -->|"Inject Bearer token"| Nginx
    end

    Nginx -->|"/a2a/* (SSE)"| AF["API Frontend<br/>(port 8443)"]
    Nginx -->|"/mcp (POST)"| AF
    Nginx -->|"/.well-known/*"| AF
    Nginx -->|"/ (static)"| Static["SPA Static Files"]

    OAuthProxy -->|"OIDC flow"| OIDC["Dex / Keycloak"]
```

## Data Flow

### 1. Investigation Flow (A2A)

```mermaid
sequenceDiagram
    participant User
    participant useChat
    participant AF as API Frontend
    participant UI as UI Components

    User->>useChat: sendMessage()
    useChat->>AF: POST /a2a/ (JSON-RPC message/stream)
    
    loop SSE Event Stream
        AF-->>useChat: status-update (reasoning)
        useChat-->>UI: ThinkingPanel
        AF-->>useChat: status-update (tool_call)
        useChat-->>UI: ThinkingPanel
        AF-->>useChat: status-update (keepalive + metadata)
        useChat-->>UI: InvestigationContext banner
        AF-->>useChat: artifact-update (investigation_summary)
        useChat-->>UI: RCACard + WorkflowCards
        AF-->>useChat: artifact-update (execution_progress)
        useChat-->>UI: InvestigationContext (phase)
    end
```

### 2. Approval Flow (MCP)

```mermaid
sequenceDiagram
    participant User
    participant ApprovalCard
    participant mcpClient as mcp-client
    participant AF as API Frontend

    User->>ApprovalCard: Click "Approve"
    ApprovalCard->>mcpClient: callMcpTool("kubernaut_approve", {rr_id, decision})
    mcpClient->>AF: POST /mcp (JSON-RPC tools/call)
    AF-->>mcpClient: {result: {status: "accepted"}}
    mcpClient-->>ApprovalCard: Success
    Note over AF: A2A stream continues with execution_progress events
```

### 3. Escalation/Dismiss Flow (MCP)

```mermaid
sequenceDiagram
    participant User
    participant WorkflowCards
    participant mcpClient as mcp-client
    participant AF as API Frontend

    User->>WorkflowCards: Click "Escalate" / "No action needed"
    WorkflowCards->>mcpClient: callMcpTool("kubernaut_complete_no_action", {rr_id, reason})
    mcpClient->>AF: POST /mcp (JSON-RPC tools/call)
    AF-->>mcpClient: {result: {status: "completed"}}
```

## Component Architecture

### State Management

The application uses React hooks for state management — no external state library.

```mermaid
graph TD
    CC["ChatContainer (orchestrator)"]
    CC --> UC["useChat() → messages[], sendMessage(), isStreaming"]
    CC --> UU["useUser() → user identity from headers"]
    CC --> LS["local state → clearConfirmOpen, error"]
```

### Component Hierarchy

```mermaid
graph TD
    App --> EB["ErrorBoundary"]
    EB --> CC["ChatContainer"]
    CC --> IC["InvestigationContext<br/>(banner: RR ID, alert, phase)"]
    CC --> WS["WelcomeState<br/>(suggestion chips)"]
    CC --> ML["MessageList"]
    ML --> UB["UserBubble"]
    ML --> AB["AgentBubble"]
    AB --> TP["ThinkingPanel"]
    AB --> RCA["RCACard"]
    AB --> WC["WorkflowCards<br/>(+ escape hatches)"]
    AB --> AC["ApprovalCard"]
    AB --> VT["VerificationTimer"]
    AB --> MC["MarkdownContent"]
    AB --> SC["StreamingCursor"]
    CC --> Modal
    CC --> InputForm
```

### Message Lifecycle

Each `ChatMessage` progresses through phases:

```mermaid
stateDiagram-v2
    [*] --> investigation
    investigation --> decision
    decision --> remediation
    remediation --> verifying
    verifying --> complete
    remediation --> failed
    verifying --> failed
    investigation --> failed
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

```mermaid
sequenceDiagram
    participant Browser
    participant OAuthProxy as OAuth2 Proxy
    participant OIDC as OIDC Provider

    Browser->>OAuthProxy: Request /
    OAuthProxy-->>Browser: 302 Redirect to OIDC
    Browser->>OIDC: Authorization request
    OIDC-->>Browser: ID Token + Access Token
    Browser->>OAuthProxy: Callback with code
    OAuthProxy-->>Browser: Set session cookie (httpOnly, Secure)
    Note over OAuthProxy: Subsequent requests carry session cookie
    Browser->>OAuthProxy: Request /a2a/...
    OAuthProxy->>OAuthProxy: Inject Authorization: Bearer
    OAuthProxy-->>Browser: Proxied response
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

```mermaid
graph LR
    subgraph Route/Ingress
        TLS["TLS termination (edge)<br/>console.apps.cluster.example.com"]
    end

    subgraph Service["Service: kubernaut-console (ClusterIP)"]
        Port["Port 4180"]
    end

    subgraph Pod["Pod: kubernaut-console"]
        OAuthProxy["oauth2-proxy<br/>(port 4180)"]
        ConsoleNginx["console-nginx<br/>(port 8080)"]
    end

    TLS --> Port
    Port --> OAuthProxy
    OAuthProxy --> ConsoleNginx
```

### Kind (Demo)

```mermaid
graph LR
    subgraph Service["Service: kubernaut-console (NodePort)"]
        NP["NodePort 30418"]
    end

    subgraph Pod["Pod: kubernaut-console"]
        OAuthProxy["oauth2-proxy<br/>(port 4180)"]
        ConsoleNginx["console-nginx<br/>(port 8080)"]
    end

    NP --> OAuthProxy
    OAuthProxy --> ConsoleNginx
```
