# Architecture

## System Context

The Kubernaut Demo Console is the user-facing web application for the Kubernaut autonomous remediation platform. It provides a real-time chat interface for operators to observe, approve, and guide automated incident response.

```mermaid
graph TB
    Operator[Operator Browser] --> Console["Demo Console (React SPA)"]
    Console -->|"SSE /a2a"| AF["API Frontend"]
    Console -->|"JSON-RPC /mcp"| AF
    AF --> KA["Kubernaut Agent"]
    AF --> K8s["Kubernetes API"]
    KA --> LLM["LLM (Anthropic)"]
    KA --> K8s
```

## Container Architecture

Each console pod runs two containers in a sidecar pattern:

```mermaid
graph LR
    subgraph pod ["kubernaut-console Pod"]
        OAuth["oauth2-proxy :4180"]
        Nginx["nginx :8080"]
    end
    Client[Browser] -->|HTTPS| OAuth
    OAuth -->|"X-Forwarded-Access-Token"| Nginx
    Nginx -->|static| SPA["React bundle"]
    Nginx -->|"/a2a, /mcp"| Backend["apifrontend :8443"]
```

| Container | Role | Port |
|-----------|------|------|
| oauth2-proxy | OIDC authentication gateway | 4180 (service-facing) |
| console (nginx) | Static file server + reverse proxy | 8080 (internal) |

## Data Flow

### Investigation Lifecycle

```mermaid
sequenceDiagram
    participant O as Operator
    participant C as Console
    participant AF as API Frontend
    participant KA as Kubernaut Agent

    O->>C: Send message (chat input)
    C->>AF: POST /a2a (JSON-RPC message/stream)
    AF->>KA: Invoke agent
    KA-->>AF: SSE events (thinking, status, artifacts)
    AF-->>C: Stream SSE events
    C->>O: Render thinking panel, RCA, workflows

    Note over O,C: User selects workflow
    O->>C: Click "Execute"
    C->>AF: POST /mcp (kubernaut_select_workflow)
    AF->>KA: Execute workflow
    KA-->>AF: execution_progress artifacts
    AF-->>C: SSE events (phase transitions)
    C->>O: Render verification timer + steps
```

### Event Types

| A2A Event | Console Handling |
|-----------|-----------------|
| `status-update` (type=reasoning) | ThinkingPanel — agent reasoning stream |
| `status-update` (type=status) | Phase transitions, banner updates |
| `status-update` (type=verification_step) | VerificationTimer activity log |
| `artifact-update` (type=execution_progress) | Timer data (stabilization_window, started_at) |
| `artifact-update` (type=rca) | RCACard — root cause analysis display |
| `artifact-update` (type=workflow_options) | WorkflowCards — remediation options |

### MCP Tool Calls (Console → Backend)

| Tool | Purpose | Trigger |
|------|---------|---------|
| `kubernaut_approve` | Approve remediation approval request | ApprovalCard "Approve" |
| `kubernaut_select_workflow` | Select workflow for execution | WorkflowCard "Execute" |
| `kubernaut_complete_no_action` | Dismiss or escalate investigation | "No action needed" / "Escalate" |

## Component Architecture

```mermaid
graph TD
    subgraph app ["React Application"]
        App[App.tsx]
        CC[ChatContainer]
        AB[AgentBubble]
        WC[WorkflowCards]
        AC[ApprovalCard]
        VT[VerificationTimer]
        RC[RCACard]
        IC[InvestigationContext]
        TP[ThinkingPanel]
    end

    subgraph hooks ["Hooks & Clients"]
        UC[useChat]
        UU[useUser]
        A2A[a2a-client]
        MCP[mcp-client]
    end

    App --> CC
    CC --> AB
    CC --> IC
    AB --> WC
    AB --> AC
    AB --> VT
    AB --> RC
    AB --> TP
    CC --> UC
    UC --> A2A
    CC --> MCP
    UC --> UU
```

## Authentication Flow

```mermaid
sequenceDiagram
    participant B as Browser
    participant OP as OAuth2 Proxy
    participant KC as Keycloak
    participant N as Nginx
    participant AF as API Frontend

    B->>OP: GET /
    OP->>B: 302 → Keycloak login
    B->>KC: Authenticate
    KC->>B: 302 → /oauth2/callback?code=...
    B->>OP: GET /oauth2/callback
    OP->>KC: Exchange code for tokens
    KC->>OP: Access token + ID token
    OP->>B: Set session cookie, 302 → /
    B->>OP: GET / (with cookie)
    OP->>N: Forward + X-Forwarded-Access-Token header
    N->>AF: Proxy with Authorization: Bearer <token>
```

## Key Design Decisions

See [ADRs](adr/) for detailed rationale. Summary:

1. **OAuth2 Proxy sidecar** over client-side OIDC — keeps secrets out of the browser
2. **SSE via fetch + ReadableStream** over EventSource — supports POST with body, custom headers
3. **MCP direct calls** for deterministic actions — avoids LLM round-trip for approve/dismiss/select
4. **Dual-container pod** — separation of concerns (auth vs serving), independent scaling
5. **Mock A2A mode** — enables frontend development without backend dependencies
