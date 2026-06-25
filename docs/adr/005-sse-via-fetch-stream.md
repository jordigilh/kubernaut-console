# ADR-005: SSE via Fetch + ReadableStream

## Status

Accepted

## Context

The console streams real-time events from the API Frontend during investigations. Options:

1. **EventSource API** — native browser SSE, but limited to GET requests with no custom headers
2. **WebSocket** — full-duplex, but requires separate protocol handling and reconnect logic
3. **fetch + ReadableStream** — POST with body, custom headers, manual SSE parsing

## Decision

Use **fetch with ReadableStream** to consume SSE events from `POST /a2a/{task-id}`.

## Consequences

- **Positive**: Supports POST method with JSON-RPC body (required by A2A protocol)
- **Positive**: Custom `Authorization` header passed through naturally
- **Positive**: Full control over reconnection, backoff, and error handling
- **Negative**: Must manually parse SSE frame format (trivial: split on `\n\n`, extract `data:` lines)
- **Negative**: No automatic reconnection (implemented manually in `a2a-client.ts` with exponential backoff)
