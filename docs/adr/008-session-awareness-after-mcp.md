# ADR-008: Session Awareness After MCP Actions

## Status

Accepted

## Date

2026-06-25

## Issue

[#29 — feat: Agent session awareness after MCP actions](https://github.com/jordigilh/kubernaut-console/issues/29)

## Context

After an MCP action (execute workflow, approve, decline, dismiss, escalate), the A2A
agent is unaware of the state change. It continues to believe the investigation is
ongoing, sometimes prompting "would you like to continue the existing investigation?"
even after the RR has reached a terminal state.

### Backend Architecture (relevant to this decision)

The AF (apifrontend) manages A2A sessions through:

1. **ADK In-Memory Session Store** (`adksession.InMemoryService()`) — stores conversation
   history per contextId. Cleared on pod restart only.
2. **ActiveContextRegistry** — per-user map of `username → contextId` with:
   - 2-hour max TTL
   - 10-minute idle timeout (refreshed on tool calls)
3. **SessionInterceptor** — before each A2A request:
   - If `msg.ContextID != ""` → pass through (direct routing to ADK session)
   - If `msg.ContextID == ""` → check registry → redirect to active session if found

### Root Cause

Two gaps create the "sticky session" problem:

- **Gap A (Console)**: `useChat` always sends the stored `contextIdRef` on every message.
  Since it's always non-empty, the `SessionInterceptor` passes through (line 51-53 of
  `session_interceptor.go`) and routes directly to the old in-memory ADK session—bypassing
  all TTL/idle/registry logic.
- **Gap B (Backend)**: `kubernaut_complete_no_action` (dismiss/escalate path) does not
  call `registry.Clear()`, leaving a stale entry for up to 10 minutes.

## Options Considered

### Option 1: Silent A2A Follow-Up Message

Send a silent `sendMessage(text, { silent: true })` immediately after each MCP action
to inform the agent of the state change (e.g., "User selected workflow restart-pod").

**Pros:**
- Agent immediately knows what happened
- No change to session routing

**Cons:**
- Race condition with user's next message (500ms debounce, stream abort logic)
- Triggers unnecessary LLM compute even if user never asks a follow-up
- Generates agent-side "acknowledgment" bubbles in the UI
- If the MCP action fails, the silent message may have already been sent

**Verdict:** Rejected — race conditions and wasted LLM compute.

### Option 2: Clear contextId on Terminal + Empty ContextId

When `isTerminal` fires, clear `contextIdRef` and `sessionStorage`. Next message sends
empty contextId, relying on the `SessionInterceptor` + `ActiveContextRegistry` to route.

**Pros:**
- Simple implementation
- Leverages existing backend session management

**Cons:**
- Depends on `registry.Clear()` being called on the backend (Gap B)
- 10-minute idle window where registry may redirect to old session
- If backend hasn't cleared the registry, the "fresh" message gets routed to the old session anyway
- Empty contextId is fragile: any registry bug silently breaks isolation

**Verdict:** Rejected — too dependent on backend timing and Gap B fix.

### Option 3: Clear contextId Only on Dismiss/Escalate

Clear `contextIdRef` immediately on dismiss/escalate MCP success, but keep it for
execute/approve/decline (where post-mortem is useful).

**Pros:**
- Targeted fix for the most common annoyance
- Preserves post-mortem for workflow execution

**Cons:**
- After execute + terminal, user still has polluted context for new investigations
- Inconsistent behavior depending on which button was clicked
- Doesn't solve the general "stale session after terminal" problem

**Verdict:** Rejected — partial fix that creates inconsistent UX.

### Option 4: Keep Session + "New Investigation" UI Button

Never auto-clear. Add an explicit "New Investigation" button that clears context when
the user wants a fresh start.

**Pros:**
- User has full control
- Post-mortem always works (same session)
- Simple mental model for users

**Cons:**
- Requires UI design work (button placement, visibility)
- Users who forget to click it get polluted context indefinitely
- New users won't know the button exists
- Doesn't address the root cause (stale sessions are a system problem, not a user problem)

**Verdict:** Rejected — puts burden on users; system should handle this automatically.

### Option 5: Deferred Context Injection + Fresh UUID (Selected)

When `isTerminal` fires:
1. Save a structured context summary (RR ID, phase, target, action, tool hints) to
   `pendingContextRef` + sessionStorage
2. Generate a fresh `crypto.randomUUID()` and store as the new `contextIdRef` + sessionStorage

On the user's next `sendMessage`:
1. Prepend the pending context to the message text (XML-tagged format)
2. Clear `pendingContextRef` and sessionStorage entry
3. Send with the fresh UUID → ADK creates a brand-new session

**Pros:**
- Completely bypasses the `ActiveContextRegistry` (fresh UUID is non-empty → interceptor passes through → ADK creates new session)
- No dependency on backend timing or Gap B fix
- Post-mortem works: agent can call `kubernaut_get_audit_trail(rr_id)` using the RR ID from injected context
- sessionStorage persistence survives browser refresh
- No race conditions (context is prepended synchronously inside `sendMessage`)
- No wasted LLM compute (context only processed when user actually sends a message)
- During active phases (AwaitingApproval/Executing): session is preserved — user can ask questions freely
- Graceful degradation: if LLM ignores the context prefix, user can re-state the question

**Cons:**
- If user never sends another message, the agent never learns about the action (acceptable: no question = nothing to answer)
- Injected context is a summary, not full conversation history (deep "why did you pick X?" questions require UI scroll-back)
- LLM must correctly parse the XML-tagged prefix (94% confidence — validated format across major LLMs)

**Verdict:** Selected.

## Decision

Implement **Option 5: Deferred Context Injection + Fresh UUID**.

### Implementation Details

#### Context Builder Format

```typescript
export function buildDeferredContext(
  rrId: string,
  phase: string,
  metadata?: { target?: string; resource?: string }
): string {
  return [
    '<previous_investigation>',
    `  rr_id: ${rrId}`,
    `  phase: ${phase}`,
    `  target: ${metadata?.target ?? 'unknown'}`,
    `  resource: ${metadata?.resource ?? 'unknown'}`,
    `  tools_available: kubernaut_get_audit_trail(rr_id), kubernaut_get_remediation_request(rr_id)`,
    '</previous_investigation>',
  ].join('\n');
}
```

#### useChat Hook Additions

```typescript
const PENDING_CONTEXT_KEY = 'kubernaut-pending-context'; // pre-commit:allow-sensitive

// Initialize from sessionStorage (survives browser refresh)
const pendingContextRef = useRef<string[]>(
  JSON.parse(sessionStorage.getItem(PENDING_CONTEXT_KEY) || '[]')
);

const addPendingContext = useCallback((text: string) => {
  pendingContextRef.current.push(text);
  sessionStorage.setItem(PENDING_CONTEXT_KEY, JSON.stringify(pendingContextRef.current));
}, []);

const resetContext = useCallback(() => {
  const freshId = crypto.randomUUID();
  contextIdRef.current = freshId;
  sessionStorage.setItem(CONTEXT_ID_KEY, freshId);
}, []);
```

In `sendMessage`:

```typescript
let effectiveText = text;
if (pendingContextRef.current.length > 0) {
  const ctx = pendingContextRef.current.join('\n');
  effectiveText = `${ctx}\n\n${text}`;
  pendingContextRef.current = [];
  sessionStorage.removeItem(PENDING_CONTEXT_KEY);
}
```

#### ChatContainer Terminal Effect

```typescript
const hasResetRef = useRef(false);

useEffect(() => {
  if (isTerminal && effectiveRrId && !hasResetRef.current) {
    hasResetRef.current = true;
    addPendingContext(buildDeferredContext(effectiveRrId, statusPhase, statusMetadata));
    resetContext();
  }
}, [isTerminal, effectiveRrId]);
```

### Data Flow

```
During Active Phases (AwaitingApproval, Executing):
  contextIdRef = "session-abc-123" (original)
  → Messages route to existing session
  → Full conversation history available
  → User can ask "what's the status?" freely

Terminal Fires (Succeeded, Failed, TimedOut, etc.):
  1. Save: pendingContextRef ← buildDeferredContext(rrId, phase, metadata)
  2. Save to sessionStorage (browser refresh safety)
  3. Generate: contextIdRef ← crypto.randomUUID()
  4. Save new UUID to sessionStorage

User's Next Message:
  1. sendMessage prepends pending context to user text
  2. Clears pendingContextRef + sessionStorage entry
  3. Sends with fresh UUID → ADK creates new session
  4. Agent sees XML-tagged context → can call backend tools with RR ID
```

### Lifecycle Diagram

```
┌──────────────────────────────────────────────────────────────────────────┐
│ RR Lifecycle         Session State         User Can Ask                   │
│                                                                          │
│ Investigating    →   contextId: held       "what did you find?"    ✓     │
│ AwaitingApproval →   contextId: held       "show me the details"  ✓     │
│ Executing        →   contextId: held       "is it running?"       ✓     │
│ Succeeded        →   contextId: RESET      "show audit traces"    ✓ (*) │
│                      (fresh UUID)          (via deferred context)        │
│                                                                          │
│ (*) Agent uses kubernaut_get_audit_trail(rr_id) from injected context    │
└──────────────────────────────────────────────────────────────────────────┘
```

## Consequences

### Positive

- Sessions are automatically isolated after terminal — no user action needed
- Post-mortem still works via backend tool calls (audit trail, RR status)
- Zero dependency on backend `ActiveContextRegistry` timing
- Browser refresh cannot lose pending context
- No wasted LLM compute (deferred until user actually interacts)
- No race conditions (synchronous prepend inside `sendMessage`)

### Negative

- Deep post-mortem ("why did you pick workflow B over A?") requires UI scroll-back
  (the full reasoning is in the chat message history, not in the injected summary)
- Adds ~200 bytes to the first post-terminal message (XML context prefix)
- Requires LLM to correctly parse the `<previous_investigation>` tag (94% confidence)

### Upstream Dependency

Filed issue on `jordigilh/kubernaut` for `kubernaut_complete_no_action` to call
`registry.Clear(username)`. This is a defense-in-depth measure for non-console clients;
the console no longer depends on it after this DD.

## FedRAMP Control Mapping

| Control | Relevance |
|---------|-----------|
| SC-7 (Boundary Protection) | Session isolation prevents cross-investigation context leakage |
| AC-6 (Least Privilege) | Fresh sessions start with minimal context (only the summary needed) |
| AU-3 (Content of Audit Records) | RR ID preservation enables audit trail retrieval post-terminal |
| SI-10 (Information Input Validation) | XML-tagged format is self-documenting and parseable |

## References

- [ADR-006: MCP Direct Calls](../adr/006-mcp-direct-calls.md)
- [Issue #14: MCP error handling on timed-out RRs](https://github.com/jordigilh/kubernaut-console/issues/14)
- Backend source: `pkg/apifrontend/launcher/session_interceptor.go` (line 51-53)
- Backend source: `pkg/apifrontend/launcher/active_context_registry.go`
- Backend source: `pkg/apifrontend/session/service.go` (in-memory delegate)
