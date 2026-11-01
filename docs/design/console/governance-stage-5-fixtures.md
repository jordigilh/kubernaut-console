# Stage 5 — governance and administration fixtures

`FixtureGovernance` is an isolated in-memory presentation for
`governance.policies`, `policies.approval`, `policies.scope`,
`governance.audit`, `audit.event`, `administration`, `settings.console`,
`settings.platform`, and `settings.access`. It does not mount in standalone.
Its records and capabilities are synthetic, not upstream schemas, reads or
authorization. The foundation stylesheet is required. There is no router,
adapter, network, persistence, operational action or identity implementation.

The private fixture model separates historical evaluation and current policy,
supplied effective scope and provenance, sanitized events and their case
relationships, and platform and access ownership. Lookups require exact unique
IDs and scope; a duplicate or mismatched case prevents its events from resolving.
Audit and policy capabilities are independent. Audit search and outcome filters
apply only to loaded scoped events, and the case filter survives detail/return.
The shared read panel represents all eight states; denied or missing reads do not
show records or provenance. Theme preview is local only. The scope policy has
no cross-fixture inventory link because no shared fixture navigation contract
is provided; the separate `FixtureScope` inventory remains independently scoped.

Fixtures establish neither source redaction nor actual permissions, identity,
logout behavior, paging, freshness, owner isolation or browser/AT acceptance.
Live Stage 3 remains parked on upstream #2564/#2565, decision/evidence,
authorization, ownership, logout and concurrency evidence. G1–G5, NAV, RAR,
investigation/ownership and deployed acceptance remain open. Parameter editing,
workflow overrides, #2570 and V8 remain on hold. Stage 5 fixture coverage is
not release readiness or a claim of production screen implementation.
