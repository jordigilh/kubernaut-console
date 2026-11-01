# Stage 5 — scope and registry fixture presentation

`FixtureScope` is an isolated, in-memory, read-only presentation of `overview`,
`resources.list`, `resources.detail`, `clusters.list`, and `clusters.detail`.
It is not mounted in standalone. It has no router, API, network, storage,
authorization, action handler, or live topology discovery. Import the existing
console foundation stylesheet. The synthetic access, scope and topology flags
are not production security or deployment evidence.

The separate fixture model records exact identity and authored managed-boundary
results, namespace inheritance and exclusions, registry classification, scoped
attention and read provenance. Duplicate, missing or mismatched identities and
invalid cluster filters fail closed; no case or RAR relationships are supplied,
so no related-record links are offered. A cluster-filtered inventory is the same
fixture inventory, not a new source. Registry identities do not establish health,
provider, version, nodes, last-seen or operational status. All eight read states
are available; inaccessible and mismatched direct views withhold data and source.

This wave does not implement Policies & Audit or Administration/settings; those
remain later Stage 5 waves. Live Stage 3 remains blocked on #2564/#2565, reviewed
binding/evidence, auth, ownership, logout and concurrency. G1–G5, NAV, RAR,
investigation/ownership and deployed/browser/device/AT acceptance stay open.
Parameter editing, workflow overrides, #2570 and V8 remain on hold. Fixture
tests establish only synthetic presentation, not a live source or release gate.
