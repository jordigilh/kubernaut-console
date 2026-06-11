# Kubernaut Demo Console

A standalone web console for demonstrating [Kubernaut](https://github.com/jordigilh/kubernaut)'s A2A (Agent-to-Agent) capabilities. This application connects to Kubernaut's API Frontend over the A2A protocol and provides a chat-based interface for interactive incident remediation.

## Features

- **A2A SSE streaming** — Real-time streaming via `fetch()` + `ReadableStream` (JSON-RPC `message/stream`)
- **Cursor-style thinking panel** — Collapsible mini-frame showing reasoning, status, and investigation events
- **Workflow cards** — Structured decision rendering with RECOMMENDED badge from `present_decision` tool
- **Execution progress** — Green-tinted block with step indicators during remediation
- **Markdown rendering** — Full GFM support for agent responses
- **OAuth2 Proxy auth** — OIDC authentication via Dex, no client-side auth code needed

## Architecture

```
Browser → OAuth2 Proxy (Kind pod, port 4180)
           ├── Static files → Nginx sidecar (Console SPA)
           ├── /a2a/*       → API Frontend (Bearer token injected)
           └── /oauth2/*    → OIDC flow with Dex
```

## Quick Start (Local Development)

```bash
npm install
npm run dev
```

The Vite dev server proxies `/a2a/*` and `/.well-known/*` to `localhost:8443` (API Frontend). Use `kubectl port-forward` to expose AF locally.

## Kind Demo Deployment

### Prerequisites

1. A running Kind cluster with Kubernaut deployed (use [kubernaut-demo-scenarios](https://github.com/jordigilh/kubernaut-demo-scenarios))
2. Dex and API Frontend running in the cluster

### Steps

```bash
# 1. Build the Console SPA
npm run build

# 2. Deploy Console + OAuth2 Proxy into Kind
./deploy/deploy-console.sh

# 3. Open the Console
open http://localhost:4180
# Login: e2e-user@kubernaut.ai
```

## Project Structure

```
src/
  lib/           A2A types and SSE client
  hooks/         React hooks (useChat)
  components/    UI components
    ChatContainer.tsx     Main chat frame
    ThinkingPanel.tsx     Cursor-style collapsible thinking
    WorkflowCards.tsx     Decision card grid
    ExecutionProgress.tsx Remediation progress block
    AgentBubble.tsx       Agent message bubble
    UserBubble.tsx        User message bubble
    MarkdownContent.tsx   Markdown renderer
deploy/
  oauth2-proxy.yaml       Deployment + Service + ConfigMap
  dex-redirect-patch.yaml Dex callback URI patch
  kind-config.yaml        Kind cluster port mappings
  deploy-console.sh       One-command deployment script
```

## Tech Stack

- [Vite](https://vite.dev) + [React](https://react.dev) + TypeScript
- [Tailwind CSS](https://tailwindcss.com) v4
- [react-markdown](https://github.com/remarkjs/react-markdown) + remark-gfm
- [OAuth2 Proxy](https://oauth2-proxy.github.io/oauth2-proxy/) for authentication
