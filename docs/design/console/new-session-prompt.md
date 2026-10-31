# Implementation handover prompt

Paste this into a new session in a checkout of `kubernaut-console`. The accompanying user request—not this preserved document—authorizes the selected implementation slice.

```text
Use docs/design/console/README.md as the authoritative handoff entry. Read decisions.md, design-and-navigation.md, the relevant screen-contracts.md sections, implementation-readiness.md and acceptance-and-delivery.md. Inspect screen-inventory.json, design-tokens.json and visual-index.json; open mockups/console/navigation-demo.html and navigation-investigation.html locally. Run python3 scripts/check-console-design.py before relying on the reference set.

Recall project methodology through Engram MCP when available and inspect current source across the overall Kubernaut family. Prefer exact symbol/reference navigation. Verify current source revisions, requirements and applicable repository instructions; do not assume a backend feature branch or historical screenshot represents current main/deployment.

For decision-safety, auth/logout, browser-state ownership or driver-recovery implementation, obtain the relevant maintainer-held private companion evidence first. It contains important findings/reproductions omitted from this public reference. If it is unavailable, ask for it and keep the affected gate open; do not assume the public summary closes it. Do not publish the companion or its access links.

Accepted design is not a redesign prompt: <=699 permitted direct Approvals/Investigations +More; secondary Explore/Manage (two columns>=360, one below); >699 grouped sidebar. Clusters follows authoritative fleet mode, not visible cluster count, and approval-only remains independent. Written current contracts override historical pending-navigation, old menu/layout/palette metadata.

Preserve the permanent adjustable right summary above699 and full-width top summary/conversation at<=699; RR ID-only display and independent Alert/RCA scopes; open compact RCA/evidence initially collapsed; workflows outside with mandatory ID/version, genuine parameters and no RCA-derived TARGET_RESOURCE input rows; honest same-snapshot metrics; Alert severity; human-right/AI-left containers with left text. Keep independent RAR discovery/events/reasons/decisions outside conversations, including generic RAR narration. No raw reasoning, invented progress or recovery ETA.

The standalone layout is a review aid, not a real relationship between rr-layout, rr-demo-02 or historical goldens; do not fabricate a workspace or persistence/driver recovery claim to connect the HTML examples. Implement the intended behavior with qualified adapters/owners, not mock DOM or disabled controls.

First delivery remains independent RAR inbox -> recorded review -> explicit Approved/Rejected decision for operator B without operator A's chat, LLM call or investigative privilege. Optional evidence failure does not gate an otherwise valid decision. Qualify authoritative evidence/permission/conditional-decision contracts and exact workflow version; no workflow/parameter overrides. G1-G5 and live/AT/browser ownership readiness remain explicit gates, not completed because a prototype works.

Reuse A2A/MCP/SSE/auth/fetch/public consumers with stable operational owners, captured trusted source/auth/session scope and logout fencing. Browser history/drafts need bounded validated snapshots; cached text is not a live driver. No transcript backend, automatic prompt/action replay or invented resume API. Response Stop is not RR Cancel; view changes must not initiate either.

Before editing, confirm the user's authorized slice and current branch/status; preserve unrelated work and ask before worktree movement. No auth/credential/RBAC/CR/deployment/cluster/scenario changes, dependency installation, Figma work or parameter/#2570/V8 work is implied. Keep private security reports out of public changes and follow SECURITY.md.

Start with a concise source/authorization preflight, unresolved gates and the smallest test-first plan for the authorized slice. Cite decision IDs/screen IDs/gates for clarification rather than asking the user to reconstruct prior discussions. Do not reopen accepted visual decisions or claim production readiness from mockup checks.
```
