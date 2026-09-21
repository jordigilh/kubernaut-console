# Implementation and Test Plan: Issue #137

## Objective

Make the Console Cancel investigation action terminate the authoritative
interactive investigation session through the API Frontend MCP contract.

Business outcome: an authorized operator can stop an active investigation, the
backend records the session as cancelled, and the Console only presents the
investigation as closed after the backend confirms success. A rejected or
failed cancellation must leave the investigation actionable and surface the
failure to the operator.

## Confirmed Root Cause

`ChatContainer.tsx` currently calls:

```json
{"name":"kubernaut_investigate","arguments":{"rr_id":"<rr-id>","action":"cancel"}}
```

The API Frontend exposes cancellation as `kubernaut_cancel`, whose
`InteractiveActionArgs` accepts `rr_id` (and optional message/context hints).
The API Frontend maps that tool to the backend `cancel` action and finalizes
the session as `Cancelled`. `action` is not part of the
`kubernaut_investigate` API Frontend schema, so validation rejects the current
request before cancellation runs.

The upstream contract was verified against the current `kubernaut` main-line
source through Engram. No backend implementation change is required for this
issue.

## Scope

### In scope

- Change the Console call to `kubernaut_cancel` with `{ rr_id }`.
- Preserve the existing success and failure state transitions.
- Update unit and component integration expectations to the API Frontend
  contract.
- Run the real authenticated cancellation E2E scenario.
- Correct the stale API example in `docs/tests/84/TEST_PLAN.md`.

### Out of scope

- Backend/API Frontend changes.
- Automatic cancellation on browser close or navigation.
- Client-side audit event generation. Cancellation auditability belongs to the
  API Frontend/Kubernaut Agent server path.
- Changes to generic MCP session initialization or retry behavior.

## Spike Results

### S1: MCP contract verification - complete

The API Frontend registers `kubernaut_cancel` with `InteractiveActionArgs` and
dispatches it as the `cancel` action. The investigation tool and cancellation
tool are separate contracts. This is a completed contract spike; no design
alternative remains.

### S2: Live backend termination - required during implementation

Run the existing live cancellation scenario against a fresh fixture and
confirm that the backend session is terminal/cancelled, not merely that the
browser stream stopped. If the environment cannot expose backend state, retain
the existing UI assertion and record the limitation rather than treating the
test as proof of server-side termination.

## Pyramid Invariant

Unit tests prove isolated request construction/transport behavior. Integration
tests prove the real `ChatContainer` component wiring and business state
transitions with external transports mocked. Live E2E proves the authenticated
operator journey and server-side session outcome. No tier substitutes for
another.

| Tier | Test | Business behavior | Expected change |
|---|---|---|---|
| UT | `UT-CONSOLE-MCP-026` in `packages/ui-core/src/lib/mcp-client.test.ts` | The cancellation request sent to `/mcp` names the supported cancellation tool and contains only the supported RR identifier | Expect `kubernaut_cancel` and `{ rr_id }` |
| IT | `IT-CONSOLE-CANCEL-001` in `ChatContainer.status-stream.test.tsx` | A successful backend cancellation closes the local investigation and removes the Cancel action | Expect the canonical tool call and terminal UI |
| IT | `IT-CONSOLE-CANCEL-002` in `ChatContainer.status-stream.test.tsx` | A permission/backend failure does not falsely close the investigation | Preserve the Cancel action and show the error |
| E2E | Interactive cancellation in `e2e/live/cancellation.spec.ts` | An authenticated operator can terminate an active investigation through the real API Frontend path | Confirm backend cancellation and terminal UI state |

`IT-CONSOLE-CANCEL-002` is the fail-closed authorization case. The upstream
API Frontend integration test `IT-AF-1234-W04` separately proves that
`kubernaut_cancel` dispatches the backend `cancel` action.

## Control-Objective Crosswalk

These are business-level evidence claims for this behavior, not a claim that
the Console alone provides certification for any framework.

| Business behavior | FedRAMP / NIST 800-53 | SOC 2 TSC crosswalk | OWASP ASVS 5.0 | Evidence |
|---|---|---|---|---|
| An authorized operator can terminate an active investigation, and the UI does not claim success before backend confirmation | AC-12, SC-23 | CC6.1, CC6.3 | V7.2.1, V3.3 | `IT-CONSOLE-CANCEL-001`, live E2E |
| A non-authorized or non-active driver cannot terminate the investigation, and local state remains active on denial | AC-3, AC-6, AC-24 | CC6.1, CC6.3 | V8 | `IT-CONSOLE-CANCEL-002`, upstream authorization/integration coverage |
| The cancellation request is schema-valid and rejects the unsupported `action` field on the wrong tool path | SI-10 | CC6.1 | V5 | `UT-CONSOLE-MCP-026`, upstream MCP validation |
| The cancellation travels through the server-owned path that records actor, RR, action, result, and session outcome | AU-3, AU-12 | CC7.2, CC7.3 | V16 | upstream API Frontend/Kubernaut Agent audit evidence and live E2E |

SOC 2 is not currently the repository's primary control catalog. The CC
references above are an explicit supporting crosswalk; they must not be
reported as independently verified SOC 2 compliance without the corresponding
server-side authorization, monitoring, and audit evidence.

## RED

1. Change `UT-CONSOLE-MCP-026` to expect `kubernaut_cancel` with `{ rr_id }`.
2. Change `IT-CONSOLE-CANCEL-001` to expect the same canonical tool and
   arguments.
3. Run the targeted tests and confirm they fail against the current
   `ChatContainer.tsx` implementation, proving the regression is real.
4. Confirm the live cancellation test is meaningful against a fresh fixture;
   do not convert a backend failure into a skipped test without recording why.

## Checkpoint W

Do not enter GREEN until all of the following are true:

- The upstream API Frontend contract is recorded and no backend change is
  needed.
- UT, IT success, and IT failure coverage are present.
- The IT failure case proves no local false-success state transition.
- The E2E evidence plan distinguishes stream abort from server session
  cancellation.
- Every control mapping describes an observable business outcome.
- Any unavailable E2E/backend evidence has a written limitation and is not
  silently waived.

## GREEN Implementation

1. In `packages/ui-core/src/components/ChatContainer.tsx`, replace the
   `callMcpTool` invocation in `handleCancelInvestigation` with:

   ```ts
   callMcpTool("kubernaut_cancel", { rr_id: effectiveRrId }, mcpOptions)
   ```

2. Keep the existing ordering: only after a successful response should the
   Console call `cancelStream()`, mark the investigation cancelled, move the
   phase to `complete`, and clear the in-flight flag.
3. Keep the existing error ordering: on failure, set the error, clear only the
   in-flight flag, and leave the active investigation/cancel action intact.
4. Update the two existing test expectations and the stale Issue #84 plan.
5. Strengthen the live scenario only as far as the environment can prove the
   backend session outcome; use a fresh target to avoid reattachment to a
   prior session.

## Verification

Run from the repository root:

```bash
pnpm --filter @kubernaut/ui-core exec vitest run \
  src/lib/mcp-client.test.ts \
  src/components/ChatContainer.status-stream.test.tsx
pnpm --filter @kubernaut/ui-core test
pnpm --filter @kubernaut/ui-core lint
pnpm --filter @kubernaut/ui-core build
pnpm exec playwright test e2e/live/cancellation.spec.ts \
  --config=playwright.live.config.ts
```

Pass criteria:

- The corrected UT and both cancellation IT cases pass.
- The full `ui-core` suite remains green.
- Lint has no new errors; existing warnings are tracked separately.
- The package build succeeds.
- Live cancellation proves server-side termination, or the limitation is
  explicitly recorded and the upstream integration evidence remains required.
- No unrelated dirty-worktree files are included in the implementation.

## Files and Ownership

| File | Planned change |
|---|---|
| `packages/ui-core/src/components/ChatContainer.tsx` | Correct tool name and argument shape |
| `packages/ui-core/src/lib/mcp-client.test.ts` | Assert the supported cancellation MCP payload |
| `packages/ui-core/src/components/ChatContainer.status-stream.test.tsx` | Assert canonical tool wiring and success/failure business behavior |
| `e2e/live/cancellation.spec.ts` | Verify real authenticated cancellation outcome |
| `docs/tests/84/TEST_PLAN.md` | Remove the stale `kubernaut_investigate(action=cancel)` contract |
| `docs/tests/137/TEST_PLAN.md` | This implementation/test plan and control evidence contract |

## Risks and Mitigations

- Dirty worktree includes unrelated issue-133/135 changes, including
  `ChatContainer.tsx`; implement only the cancellation hunk and preserve all
  existing work.
- A stale live fixture can make a valid cancellation look like reattachment;
  use a unique namespace/target and clean up after the run.
- Upstream MCP schemas can drift; re-run the Engram/source contract check if
  the API Frontend version changes before implementation.
- Client-side completion is not proof of backend cancellation; require the
  API Frontend integration evidence and live backend signal before claiming
  AC-12/SOC 2 audit outcomes.

## Confidence

**0.93 (high confidence).**

Rationale: the issue reproduces from an exact source-level contract mismatch,
the fix is isolated to one call site, and the required UT/IT tests already
exist. The remaining uncertainty is limited to live-cluster/backend-state
evidence and safely applying the small change on top of the unrelated dirty
`ChatContainer.tsx` work.
