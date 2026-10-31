# Operational console mockups

These are static design studies, **not production application code, live API contracts or an authentication system**. The authoritative DD/specification is [docs/design/console](../../docs/design/console/README.md).

Open locally:

- [Menu/approval study](navigation-demo.html): all menu areas and synthetic approval/workflow journeys; recorded golden excerpts remain separately selected and labelled.
- [Investigation layout study](navigation-investigation.html): current summary/conversation/activity layout with the accepted navigation.
- [Visual gallery](gallery.html):147 indexed captures; six current navigation/layout views followed by historical state references.
- [Status key](status-key.html): semantic color/shape/text reference.

No backend, installation or preview server is needed to open these files. Operational buttons remain inert where the study says so. External preview controls select synthetic examples, not real roles/topology/settings. Optional external video/provenance links are not runtime dependencies.

The GitOps layout document is separate from the inherited `rr-demo-02` relationship fixture and recorded golden cases. Its review link is not a production case/workspace mapping, cross-document draft persistence, live stream or recovered driver. Do not add replay/storage to make that boundary look implemented.

Current source assets, exact logo and paired colors are retained from the accepted study; `tokens.json` changes only portable provenance/authority metadata and the status guide returns to the current menu entry. Historical screenshots may show superseded chrome: follow the current written navigation/layout/decision contracts. The fixture projections are allowlisted synthetic/historical facts, not raw reasoning, tool payloads, secrets, private reports or current operational reads.

PR review corrections keep disclosure state on navigation buttons (with a data-only sidebar styling hook), refresh newly introduced notification-fixture deadlines on the same demo clock, and include capture state in gallery search. These are offline-study repairs, not new permissions, a live notification source or changes to the accepted navigation/layout. The notification store still deduplicates both sources and refuses to reopen terminal records; changing scope establishes a quiet baseline.

Within a scope, a fixture receives its deadline only on first introduction; repeated investigation or queue detections reuse it rather than extending expiry. That same record projects the displayed inbox/review deadline and immutable confirmation source. A newly projected deadline invalidates any open confirmation for that request without clearing the reason draft. This remains synthetic presentation, not an authoritative live decision/expiry implementation.

## Checks

From repository root:

```sh
python3 scripts/check-console-design.py
node scripts/check-console-design.mjs
```

The Python check is standard-library-only and read-only. The optional browser check requires the repository's existing Playwright and a preinstalled Chromium; it does not install anything, start a server or contact a backend. For an isolated worktree without dependencies, `DESIGN_TOOLING_PACKAGE_JSON` may point to another installed checkout's package.json. `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` may name an existing browser. Browser profiles and evidence use a fresh owned temporary directory; the result reports its scope and cleanup, not independent/full UX/runtime acceptance.

CI runs the Python verifier in build-and-test and the browser regressions in the E2E job after its existing Playwright installation. Notification regressions advance a controlled browser clock rather than waiting nineteen real minutes; they also check source deduplication, terminal-record guards and a quiet scope baseline. Failure evidence is uploaded separately from application E2E results.

Do not run old private exporters or copy their machine-dependent tests into this reference set. Changes should update the DDs, visual/source metadata and manifest together, retain honest fixture boundaries, and be verified against the actual changed bytes.
