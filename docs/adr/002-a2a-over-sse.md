# ADR-002: A2A Protocol over SSE

## Status

Accepted

## Context

The console needs to receive real-time streaming output from the Kubernaut Agent (KA) during investigations that can last several minutes. We need to decide on the transport mechanism.

### Options Considered

1. **WebSocket** — Full-duplex, persistent connection
2. **Server-Sent Events (SSE)** — Unidirectional server-to-client stream over HTTP
3. **Long polling** — Repeated HTTP requests with held responses
4. **gRPC-Web** — Binary streaming over HTTP/2

## Decision

Use **A2A protocol over Server-Sent Events (SSE)** with JSON-RPC 2.0 encoding.

The client sends a single HTTP POST with the user message. The server responds with an SSE stream containing status updates and artifact events.

## Rationale

- **HTTP/1.1 compatible**: Works through all proxies, load balancers, and CDNs without special configuration
- **Unidirectional sufficiency**: Agent communication is inherently request-response — user sends message, agent streams back. No server-initiated messages needed outside of a user turn.
- **Automatic reconnection**: The `EventSource` API (and our custom implementation) handles reconnection natively
- **OAuth2 Proxy compatible**: Standard HTTP request with Bearer token — no WebSocket upgrade negotiation needed through the proxy
- **JSON-RPC alignment**: A2A protocol uses JSON-RPC 2.0, which maps cleanly to SSE `data:` frames
- **Nginx proxy support**: `proxy_buffering off` is sufficient — no WebSocket-specific configuration

### Trade-offs

- **No server push outside request**: Cannot push events without an active request (handled by keepalive events)
- **Single direction**: User messages require a new HTTP request (acceptable for chat interaction model)
- **Connection limits**: Browsers limit concurrent SSE connections per domain (~6) — not an issue for single-conversation UI

## Consequences

- `src/lib/a2a-client.ts` implements a custom SSE parser using `ReadableStream` (not native `EventSource`, which doesn't support POST)
- Each user message creates a new streaming connection
- The connection stays open until the agent completes its turn (`final: true` or `onComplete`)
- Keepalive events maintain the connection and deliver metadata during long investigations
- Long-lived connections require 3600s proxy timeouts in nginx configuration
