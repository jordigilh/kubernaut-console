# ADR-006: MCP Direct Calls for Deterministic Actions

## Status

Accepted

## Context

User actions like "approve", "dismiss", "escalate", and "select workflow" are deterministic — no LLM reasoning is needed. Originally, all user interactions went through the A2A chat interface (send a text message, agent interprets it, agent calls a tool).

Problems with the A2A-only approach:
- Extra LLM turn for deterministic actions (token cost + 3-5s latency)
- Fragile text interpretation ("Use workflow-id-123" must be parsed correctly)
- Agent "thinking" narration adds noise, not value

## Decision

Use **MCP direct tool calls** (`POST /mcp`) for deterministic actions. The console calls the backend tool directly via JSON-RPC without involving the LLM agent.

Actions using MCP-direct:
- `kubernaut_approve` — approve/decline RAR
- `kubernaut_complete_no_action` — dismiss/escalate
- `kubernaut_select_workflow` — select workflow for execution

Actions still using A2A:
- Free-form user messages (require LLM interpretation)
- Investigation initiation

## Consequences

- **Positive**: Eliminates unnecessary LLM turns (saves ~$0.01-0.05 per action + 3-5s latency)
- **Positive**: Deterministic — no risk of LLM misinterpreting the user's intent
- **Positive**: Consistent pattern for all "button click → backend action" flows
- **Negative**: Requires MCP session management (initialize handshake)
- **Negative**: Must handle SSE-wrapped responses from the MCP endpoint
- **Lesson learned**: MCP `notifications/initialized` must be sent without a JSON-RPC `id` field (it's a notification, not a request)
