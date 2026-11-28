# Issue #180 — separate RCA and workflow confidence display test plan

## Scope

The approval review surface now displays RCA confidence and
workflow-selection confidence as distinct, separately labeled values per the
kubernaut #2586 / PR#2610 approval contract: `workflow_confidence` (required
0–1 number), `rca_confidence` (optional 0–1 number; omitted means unknown,
`0` is an explicit zero) and `confidence_level` (qualitative, qualifies
workflow-selection confidence). Legacy `confidence` aliases are removed
upstream and backward compatibility is not required. This plan covers the
`ApprovalReviewPage` fixture slice, the shared `ApprovalConfidencePanel` and
`ApprovalCard` display components, and the mocked console-foundation browser
lane. It does not cover the chat event/MCP producer wiring in
`useChat.ts`/`ChatContainer.tsx`/`AgentBubble.tsx`: those chat-owner files
belong to parallel issue #167, which will rewire the producers and remove
ApprovalCard's legacy confidence labels. The live-lane e2e (`e2e/live/**`)
belongs to #184.

Semantics guarded (BR-KA-016 lineage): the two confidences are never merged
or borrowed; missing RCA confidence renders as unknown, never 0%; an explicit
zero renders as 0%; the qualitative level qualifies workflow selection only;
the browser never computes a score — it only rounds a supplied 0–1 fraction
for display, and non-finite or out-of-range values surface as unknown rather
than being coerced. A partial read that omits the required workflow
confidence blocks Approve/Reject with a dedicated guard message; a missing
optional RCA confidence alone never blocks a decision. The
`ApprovalDecisionSnapshot`/confirmation dialog intentionally does not
duplicate the confidence values: the decision snapshot records identity and
reason, and the review panel is the pre-decision evidence surface.

## Pyramid invariant

| Tier | Test IDs | Business behavior |
| --- | --- | --- |
| Unit | `UT-CONSOLE-CONF-001`–`005` | `ApprovalConfidencePanel` keeps the two confidences separately labeled; unknown ≠ 0%; level qualifies workflow selection; a partially-read missing workflow confidence surfaces as unknown; policy-evaluation explainer copy renders. |
| Unit | `UT-CONSOLE-APPROVAL-013`–`015` | `ApprovalCard` renders labeled `RCA:`/`Workflow:` values replacing (not supplementing) the legacy unlabeled score when a breakdown is supplied; unknown vs zero stay distinct; legacy rendering unchanged when absent. |
| Unit | confidence-formatting cases in `approval-review.test.ts` | `formatConfidenceScore` pins the 0–1 scale contract: null/negative/>1/NaN → `Unknown`, `0` → `0%`, `0.999`/`1` → `100%`; the four fixture reviews carry the contract cases (high/high, low-RCA/high-workflow, missing, explicit zero). |
| Component integration | `ApprovalReviewPage confidence display (#180)` describe | Page-level: low RCA + high workflow shown separately on rar-demo-02; missing RCA as Unknown on rar-demo-03 with decisions still available; explicit zero as 0% on rar-demo-04; a partial read missing `workflowConfidence` blocks decisions with the dedicated guard; the recorded approval rationale is presented on the review surface. |
| Synthetic browser | `e2e/console-foundation/approval-confidence.spec.ts` | Real Chromium against the fixture page with the agreed backend contract: separate labels, unknown-vs-zero distinctness and the policy-evaluation note, with zero backend requests. |

## Unit coverage

Measured per file over the approval review suites (fixture adapter, page,
console, card, panel, confirmation):

| File | Statements | Branches | Functions | Lines |
| --- | ---: | ---: | ---: | ---: |
| `ApprovalConfidencePanel.tsx` (new) | 100% | 100% | 100% | 100% |
| `approval-review.ts` | 88.88% | 74.28% | 100% | 94.28% |
| `ApprovalCard.tsx` | 91.42% | 87.5% | 91.66% | 92.59% |
| `ApprovalReviewPage.tsx` | 85.82% | 81.64% | 97.61% | 91.22% |

The new file and all changed files meet the 90% line threshold. The
whole-file branch figures below 90% are pre-existing on `main`
(approval-review 71.87%, ApprovalCard 88.88%, page 80% at baseline) and are
not lowered by this change; the newly added branches are exercised by the
tests above. No tests were added solely to inflate whole-file figures.

```sh
pnpm --filter @kubernaut/ui-core exec vitest run --coverage \
  --coverage.include=src/lib/approval-review.ts \
  --coverage.include=src/components/ApprovalConfidencePanel.tsx \
  --coverage.include=src/components/ApprovalCard.tsx \
  --coverage.include=src/pages/ApprovalReviewPage.tsx \
  src/lib/approval-review.test.ts src/components/ApprovalConfidencePanel.test.tsx \
  src/components/ApprovalCard.test.tsx src/pages/ApprovalReviewPage.test.tsx \
  src/components/ApprovalConsole.test.tsx src/pages/ApprovalsPage.test.tsx \
  src/components/ApprovalDecisionConfirmation.test.tsx src/console
pnpm exec playwright test --config playwright.console-foundation.config.ts
```

## Control-objective crosswalk

These tests provide scoped engineering evidence, not FedRAMP authorization,
SOC 2 attestation or OWASP ASVS certification.

| Business outcome | FedRAMP/NIST SP 800-53 Rev. 5 | SOC 2 TSC | OWASP ASVS 5.0.0 | Evidence and limit |
| --- | --- | --- | --- | --- |
| A reviewer can distinguish RCA certainty from workflow fit before approving; the two scores are never merged or borrowed | AC-3, AU-6 | CC4.1 | V8 authorization objective (policy-decision evidence completeness) | Panel/card/page tests and browser spec above. Fixture-contract evidence only; the live approval-request read is #184/#167 follow-up. |
| Missing RCA confidence is unknown, never 0%; an explicit zero stays 0%; the browser computes no score | AU-6, SI-10 | CC4.1 | V8 objective; anti-fabrication | `formatConfidenceScore` boundary cases, `UT-CONSOLE-CONF-002`, `UT-CONSOLE-APPROVAL-014`, page missing/zero cases, browser unknown-vs-zero spec. Not a backend data-quality claim. |
| A partial read missing the required workflow confidence blocks the decision with a dedicated guard; missing optional RCA confidence alone does not | AC-3, SI-10 | CC4.1, CC6.1 | V8 objective (fail closed on missing required decision input) | Page partial-state test. Fixture adapter partial states only, not a live MCP partial-read qualification. |
| A partial read marking `rcaConfidence` missing renders Unknown, never the retained stale value | AU-6, SI-10 | CC4.1 | V8 objective (no stale decision evidence) | Page partial-state test (missingFields `["rcaConfidence"]` with retained 0.42 data renders Unknown). Fixture adapter only. |
| The surface states that interactive selection does not bypass policy evaluation | AC-3 | CC4.1 | V8 objective | `UT-CONSOLE-CONF-005` and the browser policy-note spec assert the copy. Static explainer; not proof of the deployed Rego policy. |

## Regression and remaining gates

- Full UI-core suite, mocked console-foundation browser suite, UI-core build
  and targeted lint run separately before the PR.
- Known decisions: the card's `RCA:`/`Workflow:` value Labels render grey on
  purpose — threshold-based coloring would be browser-side score
  interpretation; the qualitative level Label carries a
  "Qualifies workflow-selection confidence" title and screen-reader suffix.
  Out-of-range or non-finite confidence values surface as unknown (never
  coerced); distinguishing them from contract-omitted values is a backend
  data-quality concern, not a console fabrication risk.
- UI-core `tsc --noEmit` baseline: 94 diagnostics on `main`, 91 with this
  change (all pre-existing, in #167-owned chat test files); none added here.
- Chat producer wiring of `workflowConfidence`/`rcaConfidence` event fields
  and removal of ApprovalCard's legacy confidence labels are #167 follow-up,
  tracked in the PR body; live-lane validation against a real cluster belongs
  to #184.
