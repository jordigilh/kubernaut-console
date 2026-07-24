# Test Plan: Redaction-Aware Placeholder for Captured Reasoning Content

> **IEEE 829 Test Plan** for kubernaut-console#32 (scope item 1 only — items 2 and 3 already shipped in `0070752`)
> **Upstream dependency**: kubernaut#1716 (design sign-off given, **not yet merged**)
> **Status**: Active
> **Last Updated**: 2026-07-23

## 1. Test Plan Identifier

TP-CONSOLE-32

## 2. Introduction

`kubernaut-console#32`'s remaining scope item is a placeholder for turns where
the provider's captured reasoning was redacted (e.g. Anthropic's
`redacted_thinking` blocks) — today `ThinkingPanel` has no signal to key such
a placeholder off of, because the AF relay is a full no-op on redacted turns
(traced through `event_bridge.go`'s `EmitReasoningContent`/`emitWithLimit` in
the prior comment thread on #32).

Upstream proposed a concrete wire contract on
[kubernaut#1716](https://github.com/jordigilh/kubernaut/issues/1716), which
the Console team [signed off on](https://github.com/jordigilh/kubernaut/issues/1716#issuecomment-5063464032)
with no changes requested:

```json
{
  "metadata": { "type": "reasoning_content", "redacted": true },
  "status": { "message": { "parts": [{ "text": "" }] } }
}
```

- Reuses the existing `metadata.type: "reasoning_content"` SSE channel — no new event type.
- `metadata.redacted` is present and `=== true` **only** on a redacted turn; **absent** (not `false`) on every normal turn. Console must check the value, not key presence.
- `status.message.parts[].text` is always empty on a redacted event — no opaque/replay content ever reaches the wire. Boolean-only signal.
- Purely additive; no other event fields change shape.

**Residual risk (non-blocking for implementation, blocking for closing #32):**
`kubernaut#1716` has design sign-off but has **not yet merged**. This plan
implements and tests Console's side against the agreed contract now (the
new code path is unreachable/dead until the backend ships it, so shipping
this to `main` ahead of the dependency is harmless). `kubernaut-console#32`
stays open/`blocked` — and this change should not be presented as closing
it — until #1716 actually lands and we can confirm real end-to-end behavior
against a live backend.

## 3. Test Items

| Item | File | Lines (current) | Description |
|------|------|-------|-------------|
| Type def | `packages/ui-core/src/hooks/useChat.ts` | 35-39 | Add `redacted?: boolean` to `ThinkingEntry` |
| Parse | `packages/ui-core/src/hooks/useChat.ts` | ~757-819 (`reasoning_content` branch of the combined status-metadata handler) | Special-case `metadata.redacted === true` to push a `ThinkingEntry` with `redacted: true` and empty text *before* the existing `if (text.trim())` guard would otherwise silently drop it; never merge a redacted entry into an adjacent same-type entry |
| Render | `packages/ui-core/src/components/ThinkingPanel.tsx` | ~89-103 | Branch on `entry.redacted` to render a "Reasoning hidden by provider" placeholder instead of `<MarkdownContent text={entry.text} />` |
| Style | `packages/ui-core/src/styles/kubernaut-chat.css` | after `.kn-reasoning-content-label` (~622) | Add `.kn-reasoning-redacted-placeholder` (italic/dimmed, mirrors existing `kn-text-dim` treatment used elsewhere in the panel) |

## 4. Features to be Tested

- A `reasoning_content` status-update with `metadata.redacted === true` produces a distinct `ThinkingEntry` (not silently dropped by the empty-text guard, not merged into an adjacent entry)
- `ThinkingPanel` renders a "Reasoning hidden by provider" placeholder for `redacted` entries
- Normal (non-redacted) `reasoning_content` entries are visually unaffected — no regression to `0070752`'s narration-vs-reasoning distinction (`UT-CONSOLE-THINK-014/015/016`, `IT-CONSOLE-REASONING-001`)
- End-to-end wiring: a redacted SSE event reaches the DOM through `ChatContainer -> useChat -> AgentBubble -> ThinkingPanel`

## 5. Features Not Tested

- Real end-to-end behavior against a live backend once `kubernaut#1716` actually ships (tracked as the residual risk in section 2; this plan mocks the agreed contract)
- Any change to the `Redacted`/`Signature` capture logic itself in `kubernaut` (KA/AF, out of scope for Console)
- Any other `metaType` in the combined status-metadata handler (`reasoning`, `status`, `investigation`, `preflight`, `tool_call`) — unaffected, guarded by existing regression tests

## 6. Approach

Pyramid Invariant: Unit Tests prove parse logic and render branch in isolation; the Integration Test proves the wiring point between `useChat` and `ThinkingPanel` is actually connected.

### 6.1 Unit Tests (UT) — Parse Logic (`useChat.test.ts`)

| Test ID | Input | Expected | FedRAMP |
|---------|-------|----------|---------|
| UT-CONSOLE-CHAT-053 | `reasoning_content` status-update, `metadata.redacted: true`, empty text | A `ThinkingEntry` with `type: "reasoning_content"`, `redacted: true` is pushed despite empty text | AU-3, IR-4, SI-10 |
| UT-CONSOLE-CHAT-054 | A redacted event arrives immediately after a normal `reasoning_content` entry of the same type | The redacted event creates a **new**, separate `ThinkingEntry` — not merged into the preceding entry's text | SI-10 |

### 6.2 Unit Tests (UT) — Render Logic (`ThinkingPanel.test.tsx`)

| Test ID | Input | Expected | FedRAMP |
|---------|-------|----------|---------|
| UT-CONSOLE-THINK-017 | `ThinkingEntry` with `redacted: true` | Renders "Reasoning hidden by provider" placeholder text | AU-3, IR-4 |
| UT-CONSOLE-THINK-018 | Normal `reasoning_content` entry (`redacted` absent) | Does NOT render the placeholder; existing text/label rendering unaffected (regression guard alongside `UT-CONSOLE-THINK-015`) | SI-10 |

### 6.3 Integration Test (IT) — Wiring (`ChatContainer.integration.test.tsx`)

| Test ID | Input | Expected | FedRAMP |
|---------|-------|----------|---------|
| IT-CONSOLE-REASONING-002 | `reasoning_content` SSE event with `metadata.redacted: true` streamed through the full dispatch path | `thinking-body` testid renders the "Reasoning hidden by provider" placeholder in the DOM | AU-3, IR-4 |

## 7. Pass/Fail Criteria

- All tests in section 6 pass
- No existing tests regress (`UT-CONSOLE-THINK-014/015/016`, `IT-CONSOLE-REASONING-001`, `UT-CONSOLE-CHAT-046/047`)
- `pnpm build` clean across all packages
- `pnpm test` full suite green

## 8. FedRAMP Control Mapping

| Control | Description | Tests |
|---------|-------------|-------|
| AU-3 (Audit Content) | Operator sees an explicit signal that reasoning occurred but was withheld, rather than a silent gap that reads as a bug | CHAT-053, THINK-017, REASONING-002 |
| IR-4 (Incident Handling) | Operator awareness of provider redaction during, not only after, an active investigation | CHAT-053, THINK-017, REASONING-002 |
| SI-10 (Input Validation) | Never renders opaque/replay (`Signature`) content; treats the signal as boolean-only; redacted entries never silently merge into or get mistaken for visible-text entries | CHAT-053, CHAT-054, THINK-018 |

## 9. Test Deliverables

- This test plan document
- Updated `ThinkingEntry` type (`useChat.ts`)
- New test cases in `useChat.test.ts` (`UT-CONSOLE-CHAT-053`, `054`)
- New test cases in `ThinkingPanel.test.tsx` (`UT-CONSOLE-THINK-017`, `018`)
- New test case in `ChatContainer.integration.test.tsx` (`IT-CONSOLE-REASONING-002`)

## 10. Open Item (Blocking for issue closure, non-blocking for this implementation)

Do not close `kubernaut-console#32` off the back of this change alone —
`kubernaut#1716` must actually merge first so the contract can be verified
against a live backend. This plan's tests mock the signed-off contract
shape; if upstream implementation deviates from what was signed off,
Console-side tests will need updating to match reality at that point.
