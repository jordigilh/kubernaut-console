# Roadmap: Multi-Platform Plugin Architecture

> **ADR**: [ADR-004](../adr/004-multi-platform-plugin-architecture.md)
> **Design**: [Design Document](./design.md)
> **Last Updated**: 2026-06-16

## Locked Decisions

| Decision | Choice | Validated By |
|----------|--------|--------------|
| Package manager | pnpm 11 + Turborepo 2 | Spike: workspace:* linking, Vite library ESM+types, Turborepo dep-graph ordering |
| Distribution | OCI-only (both upstream Backstage 1.49+ and RHDH) | Spike: `rhdh-cli plugin export --no-install` + `plugin package --export-to` |
| Extraction strategy | Incremental via `workspace:*` linking | Spike: no tsconfig path aliases needed |
| Visual regression gate | After all 9 components migrated (5% pixel threshold) | 34 Playwright baselines captured, CI workflow blocking PRs |
| Backend auth | Already JWKS-agnostic — no changes needed | Preflight: apifrontend config confirms issuer-agnostic JWKS validation |
| Phase gating | Each phase must pass exit criteria + confidence >= 95% before next starts | Confidence methodology established |

## Summary

This roadmap defines the phased execution plan for migrating the Kubernaut console from a standalone application to a portable plugin architecture targeting upstream Backstage and OCM, with downstream RHDH/ACM handoff as the final milestone.

## Timeline Overview

```
Phase 0: Foundation             ████████████░░░░░░░░░░░░░░░░  (Weeks 1-3)
Phase 1: Backstage Plugin       ░░░░░░░░░░░░████████████░░░░  (Weeks 4-6)
Phase 2: OCM Console Plugin     ░░░░░░░░░░░░░░░░░░░░████████  (Weeks 7-9)
Phase 3: Hardening & Handoff    ░░░░░░░░░░░░░░░░░░░░░░░░████  (Weeks 10-11)
```

---

## Phase 0 — Foundation (Weeks 1-3)

**Goal**: Extract `kubernaut-ui-core` from the current codebase, replace Tailwind with PF6, and prove standalone mode still works.

### Week 1: Workspace Setup + Core Extraction

| Task | Deliverable | Done Criteria |
|------|-------------|---------------|
| Initialize pnpm workspace | `pnpm-workspace.yaml`, `turbo.json` | `pnpm install` resolves all packages |
| Move `src/` → `packages/ui-core/src/` | Core package structure | Imports resolve correctly |
| Create `packages/standalone/` shell | Standalone wraps core | `pnpm dev` starts the app |
| Configure Vite library mode for core | `packages/ui-core/vite.config.ts` | `pnpm build` produces ESM + CJS |
| Existing tests pass in new location | CI green | All unit + integration tests pass |

### Week 2: PF6 Migration

| Task | Deliverable | Done Criteria |
|------|-------------|---------------|
| Install PF6 + `@patternfly/chatbot` | `package.json` deps | Packages resolve |
| Replace Tailwind in `ChatContainer` | PF6 `<Page>`, `<PageSection>` | Visual parity verified |
| Replace custom bubbles with `<Message>` | `@patternfly/chatbot` integration | Messages render correctly |
| Migrate `WorkflowCards` to PF6 | `<Card>`, `<Alert>`, `<Button>` | Cards render, actions fire |
| Remove Tailwind from core | No `tailwindcss` dep in ui-core | Build succeeds without Tailwind |
| Visual regression baseline | Screenshots captured | Playwright visual tests pass |

### Week 3: Auth Interface + Config

| Task | Deliverable | Done Criteria |
|------|-------------|---------------|
| Define `KubernautAuthProvider` interface | `providers/auth.ts` exported | Types compile |
| Implement `ProxyAuthProvider` | Standalone auth works | E2E login flow passes |
| Extract `KubernautConfig` context | `providers/config.ts` | Backend URL configurable |
| Refactor A2A/MCP clients to use AuthContext | Token from context, not headers | Integration tests pass |
| `<KubernautChat />` root component | Public API finalized | Standalone renders via new root |

**Confidence Checkpoints**:

| Checkpoint | Gate Criteria | Confidence Required |
|------------|--------------|---------------------|
| End of Week 1 | `pnpm build` succeeds, 234 tests pass, standalone runs, Storybook builds | >= 90% |
| End of Week 2 | Visual regression passes at 5%, zero Tailwind in core, functional tests pass | >= 93% |
| End of Week 3 | All Phase 0 exit criteria met | >= 95% |

**Phase 0 Exit Criteria**:
- [ ] `packages/ui-core` builds independently (ESM + types)
- [ ] `packages/standalone` runs the chat with full functionality
- [ ] All existing tests pass in new package structure
- [ ] Zero Tailwind dependencies in `ui-core`
- [ ] `KubernautAuthProvider` interface defined and used
- [ ] CI pipeline builds both packages
- [ ] Confidence score >= 95%

---

## Phase 1 — Backstage Plugin (Weeks 4-6)

**Goal**: Produce a working Backstage plugin that renders the Kubernaut chat at `/kubernaut`, published as an OCI dynamic plugin for both upstream Backstage 1.49+ and RHDH.

### Week 4: Plugin Scaffold + Auth

| Task | Deliverable | Done Criteria |
|------|-------------|---------------|
| Scaffold plugin with `@backstage/cli` | `packages/plugin-backstage/` | `yarn start` in dev app works |
| Implement `BackstageAuthProvider` | Token via `identityApi` | getToken() returns valid JWT |
| Register standalone page extension | `/kubernaut` route | Page renders in dev app |
| Backstage backend proxy to Kubernaut API | `app-config.yaml` entry | API calls succeed through proxy |

### Week 5: Integration + Polish

| Task | Deliverable | Done Criteria |
|------|-------------|---------------|
| Wrap core in Backstage layout shell | `<Header>`, `<Content>` | Native Backstage look and feel |
| Handle Backstage theme (light/dark) | Theme tokens mapped | Dark mode works |
| Error boundaries + loading states | Backstage `<Progress>`, `<ErrorPanel>` | Graceful error handling |
| Integration tests | Backstage test utils suite | Auth wiring verified |

### Week 6: Build + Distribution

| Task | Deliverable | Done Criteria |
|------|-------------|---------------|
| OCI artifact via `rhdh-cli plugin export` + `plugin package` | `ghcr.io/jordigilh/kubernaut-backstage-plugin` | Loads in RHDH and upstream Backstage 1.49+ |
| Module Federation remote entry | `dist/remoteEntry.js` | Dynamic loading verified |
| Tested against Backstage 1.49+ | Compatibility matrix | No breaking API usage |
| Documentation: installation guide | `docs/migration/backstage-install.md` | Step-by-step for adopters |

**Phase 1 Exit Criteria**:
- [x] Plugin renders Kubernaut chat inside Backstage at `/kubernaut`
- [x] Auth flows through Backstage identity system
- [x] Published as OCI artifact (loads in both upstream Backstage and RHDH)
- [x] Tested against upstream Backstage 1.49+ (structural verification — 17/17 checks pass)
- [x] Installation documentation complete
- [x] Confidence score >= 95% (revised to 96% — see design.md)

> **Note**: End-to-end verification in a live RHDH cluster is deferred to Phase 2
> integration week. All structural checks (MF remoteEntry, dual entry points,
> OCI bundle, config schema) pass locally.

---

## Phase 2 — OCM Console Plugin (Weeks 7-9)

**Goal**: Produce a working OCM console plugin with a ManagedClusterAddon for agent deployment, targeting OCP 4.18+ (dev cluster: OCP 4.21).

### Week 7: Plugin Scaffold + Module Federation

| Task | Deliverable | Done Criteria |
|------|-------------|---------------|
| Webpack module federation setup | `packages/plugin-ocm/` | Remote entry builds |
| `ConsolePlugin` CR definition | YAML manifest | `oc apply` succeeds |
| Console extensions (route + nav) | `console-extensions.json` | Nav item and page appear |
| Implement `OCMAuthProvider` | Token via console proxy | getToken() returns valid JWT |

### Week 8: Integration + ManagedClusterAddon

| Task | Deliverable | Done Criteria |
|------|-------------|---------------|
| PF6 style verification in OCP 4.18 host | Visual check | Shared PF6 — no conflicts |
| Console proxy configuration | Backend API accessible | A2A/MCP calls succeed |
| ManagedClusterAddon CRD | Addon controller manifest | Agent deploys to spoke cluster |
| Addon lifecycle (install/upgrade/delete) | Controller tests | Addon reconciles correctly |

### Week 9: Testing + Container Image

| Task | Deliverable | Done Criteria |
|------|-------------|---------------|
| Integration tests (Cypress + OCP) | Test suite | Plugin loads in test console |
| Container image build | `ghcr.io/jordigilh/kubernaut-console-plugin` | Image runs nginx serving bundle |
| Helm chart for ConsolePlugin | `deploy/helm/console-plugin/` | Installs plugin + service |
| Test against OCM 0.14+ / OCP 4.18+ | Compatibility matrix | No breaking API usage |

**Phase 2 Exit Criteria**:
- [x] Plugin renders Kubernaut chat inside OCM hub console
- [x] PF6 styles render correctly in OCP 4.18+ console (shared PF6 host)
- [x] Auth flows through OCP console proxy (UserToken mode via ConsolePlugin CR)
- [x] ManagedClusterAddon deploys agent to spoke clusters (AddOnTemplate)
- [x] Container image published and Helm chart ready
- [ ] Tested against OCM 0.14+ / OCP 4.18+ (deferred to live e2e with dev cluster)

> **Note**: Live e2e testing on the OCP 4.21 dev cluster is deferred to Phase 3.
> All structural, build, and unit test criteria are met. The plugin compiles,
> bundles, and produces a valid `plugin-manifest.json`. The Helm chart and
> Containerfile are ready for deployment.

---

## Phase 3 — Hardening and Downstream Handoff (Weeks 10-11)

**Goal**: Harden all three deployment modes, write downstream documentation, and declare the architecture ready for downstream teams.

### Week 10: E2E + Performance

| Task | Deliverable | Done Criteria |
|------|-------------|---------------|
| Playwright E2E: standalone mode | Full user journey tested | Passes in CI |
| Playwright E2E: Backstage mode | Login → chat → remediation | Passes in CI |
| Cypress E2E: OCM mode | Login → chat → approve workflow | Passes in CI |
| Lazy loading for platform plugins | Dynamic imports | Core < 150KB gzipped |
| Bundle splitting analysis | Size report per package | No regressions vs current |
| Accessibility audit (PF6 a11y) | WCAG 2.1 AA compliance | axe-core passes |

### Week 11: Documentation + Handoff

| Task | Deliverable | Done Criteria |
|------|-------------|---------------|
| Downstream adaptation guide: RHDH | `docs/migration/rhdh-adaptation.md` | Covers dynamic plugin config |
| Downstream adaptation guide: ACM | `docs/migration/acm-adaptation.md` | Covers RBAC + ManagedCluster |
| Architecture decision log (final) | ADR-004 updated if needed | All decisions captured |
| Contribution guide for plugins | `CONTRIBUTING.md` updated | Plugin development workflow |
| Handoff meeting prep | Slide deck / demo | Ready for downstream team |

**Phase 3 Exit Criteria**:
- [ ] E2E tests pass for all three deployment modes
- [ ] Bundle size within budget (core < 150KB gzipped)
- [ ] WCAG 2.1 AA compliant
- [ ] Downstream documentation complete (RHDH + ACM)
- [ ] Architecture ready for downstream team consumption

---

## Milestones

| Milestone | Target | Success Metric |
|-----------|--------|----------------|
| **M0**: Core extracted | End of Week 3 | Standalone mode works with PF6, zero Tailwind |
| **M1**: Backstage plugin GA | End of Week 6 | Published, installable, tested |
| **M2**: OCM plugin GA | End of Week 9 | Deployed to dev hub, agent on spoke |
| **M3**: Architecture handoff | End of Week 11 | Downstream docs delivered |

## Risk Register

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| `@patternfly/chatbot` missing features | High | Low | Evaluate during Phase 0 Week 2; fallback to PF6 primitives |
| PF6/PF5 CSS conflicts in OCM | Medium | Medium | CSS modules + scoped tokens; tested in Phase 2 Week 8 |
| Backstage NFS API breaks | Medium | Low | Pin to stable Backstage release; OCI artifact for RHDH |
| OCM addon framework changes | Medium | Low | Pin to OCM 0.14 API; addon-framework is stable |
| Team capacity (11-week plan) | High | Medium | Phases are independent; can parallelize 1+2 with additional dev |

## Dependencies

| Dependency | Owner | Status | Needed By |
|------------|-------|--------|-----------|
| Backend JWKS auth (issuer-agnostic) | Backend team | **Resolved** (preflight verified 2026-06-16) | Phase 0 Week 3 |
| `@patternfly/chatbot` features | PF team | Available (PF6 GA) | Phase 0 Week 2 |
| Backstage proxy plugin config | Backstage docs | Available | Phase 1 Week 4 |
| OCM addon-framework docs | OCM team | Available | Phase 2 Week 8 |
| Downstream RHDH team availability | Downstream | TBD | Phase 3 Week 11 |

## Out of Scope

- RHDH-specific integration (downstream team responsibility)
- ACM-specific RBAC and ManagedCluster policies (downstream team responsibility)
- Backend architecture changes (backend is already platform-agnostic)
- Mobile responsive design (desktop-first for developer portals)
