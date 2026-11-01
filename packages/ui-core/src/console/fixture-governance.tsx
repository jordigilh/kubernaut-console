import { useState } from "react";
import { ConsoleShell, ReadStatePanel, type ReadStatus } from "./foundation";
import { findGovernanceCase, findGovernanceEvent, findGovernancePolicy, findGovernanceRule, findGovernanceSetting, governanceFixtures, type GovernanceEvent } from "./governance-fixtures";

export type FixtureGovernanceScreen =
  | { screen: "governance.policies" | "policies.scope" | "administration" | "settings.console" }
  | { screen: "policies.approval"; policyId: string }
  | { screen: "governance.audit"; caseId?: string }
  | { screen: "audit.event"; eventId: string; caseId?: string }
  | { screen: "settings.platform" | "settings.access"; settingId: string };
export type FixtureGovernanceCapability = "policy" | "audit" | "administration";
export interface FixtureGovernanceProps {
  scope?: string; initialScreen?: FixtureGovernanceScreen; status?: ReadStatus;
  access?: readonly FixtureGovernanceCapability[];
}

function Field({ label, value }: { label: string; value?: string }) { return <p>{label}: {value || "Unknown"}</p>; }
function EventFields({ event }: { event: GovernanceEvent }) {
  return <><Field label="Event ID" value={event.id} /><Field label="Event version" value={event.version} /><Field label="Time" value={event.time} /><Field label="Category" value={event.category} /><Field label="Action" value={event.action} /><Field label="Outcome" value={event.outcome} /><Field label="Actor kind" value={event.actor.kind} /><Field label="Actor" value={event.actor.name} /><Field label="Case ID" value={event.caseId} /><Field label="Related resource" value={event.resource} /></>;
}
function FixtureView({ scope, initialScreen, status, access }: Required<FixtureGovernanceProps>) {
  const [view, setView] = useState(initialScreen);
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [search, setSearch] = useState("");
  const [outcome, setOutcome] = useState("");
  const data = governanceFixtures;
  const audit = view.screen === "governance.audit" || view.screen === "audit.event";
  const admin = view.screen === "administration" || view.screen.startsWith("settings.");
  const capability = admin ? "administration" : audit ? "audit" : "policy";
  const caseId = "caseId" in view ? view.caseId : undefined;
  const policy = view.screen === "policies.approval" ? findGovernancePolicy(data, scope, view.policyId) : undefined;
  const setting = view.screen === "settings.platform" || view.screen === "settings.access" ? findGovernanceSetting(data, scope, view.settingId) : undefined;
  const event = view.screen === "audit.event" ? findGovernanceEvent(data, scope, view.eventId, caseId) : undefined;
  const badSetting = (view.screen === "settings.platform" && setting?.id !== "platform-fixture") || (view.screen === "settings.access" && setting?.id !== "access-fixture");
  const missing = (caseId !== undefined && !findGovernanceCase(data, scope, caseId)) || (view.screen === "policies.approval" && !policy) || (view.screen === "audit.event" && !event) || badSetting;
  const hasData = status === "ready" || status === "partial" || status === "stale";
  const events = data.events.filter((item) => findGovernanceEvent(data, scope, item.id, caseId) === item).slice().sort((a, b) => b.time.localeCompare(a.time));
  const visibleEvents = events.filter((item) => (!outcome || item.outcome === outcome) && [item.id, item.version, item.time, item.category, item.action, item.actor.kind, item.actor.name, item.outcome, item.caseId, item.resource || ""].some((value) => value.toLowerCase().includes(search.toLowerCase())));
  const rules = data.rules.filter((item) => findGovernanceRule(data, scope, item.id) === item);
  const readStatus: ReadStatus = status === "forbidden" || !access.includes(capability) ? "forbidden" : !scope.trim() || scope !== data.scope ? "missing" : !hasData ? status : missing ? "missing" : status === "ready" && ((view.screen === "governance.audit" && !events.length) || (view.screen === "policies.scope" && !rules.length)) ? "empty" : status;
  const title = { "governance.policies": "Policies & audit", "policies.approval": "Approval policy", "policies.scope": "Scope policy", "governance.audit": "Audit trail", "audit.event": "Audit event", administration: "Administration", "settings.console": "Console settings", "settings.platform": "Platform settings", "settings.access": "Access context" }[view.screen];
  const navAccess = [...(access.includes("policy") || access.includes("audit") ? ["policies" as const] : []), ...(access.includes("administration") ? ["administration" as const] : [])];
  return <ConsoleShell access={navAccess} topology="unknown" current={admin ? "administration" : "policies"} hrefs={{}} theme={theme}><div className="kn-investigation-fixture" data-fixture="true" data-screen={view.screen}>
    <p role="note">Synthetic fixture — read-only; not live data or authorization.</p><h1>{title}</h1>
    <ReadStatePanel label="Fixture read" state={{ status: readStatus, provenance: { source: data.source, observedAt: data.observedAt } }}>
      <Field label="Completeness" value={data.completeness} />
      {view.screen === "governance.policies" && <><p>Policy ownership and scope context are separate from audit access.</p><Field label="Approval policy owner" value={findGovernancePolicy(data, scope, "approval-fixture")?.owner} /><p>Scope ownership: Unknown</p><button type="button" onClick={() => setView({ screen: "policies.approval", policyId: "approval-fixture" })}>Open approval policy</button><button type="button" onClick={() => setView({ screen: "policies.scope" })}>Open scope policy</button>{access.includes("audit") && <button type="button" onClick={() => setView({ screen: "governance.audit" })}>Open audit trail</button>}</>}
      {view.screen === "policies.approval" && policy && <><button type="button" onClick={() => setView({ screen: "governance.policies" })}>Back to policies</button><Field label="Policy ID" value={policy.id} /><Field label="Owner" value={policy.owner} /><Field label="Configuration reference" value={policy.configReference} /><h2>Recorded historical evaluation</h2><Field label="Recorded revision" value={policy.historical.revision} /><Field label="Recorded hash" value={policy.historical.hash} /><Field label="Recorded rules" value={policy.historical.rules} /><Field label="Recorded decision" value={policy.historical.decision} /><h2>Current effective policy</h2><Field label="Current revision" value={policy.currentRevision} /><Field label="Current threshold" value={policy.currentThreshold} /></>}
      {view.screen === "policies.scope" && <><button type="button" onClick={() => setView({ screen: "governance.policies" })}>Back to policies</button><p>Effective scope and precedence are supplied by the fixture, not computed here.</p><ul>{rules.map((rule) => <li key={rule.id}><Field label="Resource" value={rule.resource} /><Field label="Namespace" value={rule.namespace ?? "Not applicable — cluster-scoped"} /><Field label="Resource label" value={rule.resourceLabel === undefined ? undefined : String(rule.resourceLabel)} /><Field label="Namespace label" value={rule.namespace === null ? "Not applicable — no inheritance" : rule.namespaceLabel === undefined ? undefined : String(rule.namespaceLabel)} /><Field label="Effective scope" value={rule.effective} /><Field label="Provenance" value={rule.provenance} /></li>)}</ul></>}
      {view.screen === "governance.audit" && <><Field label="Retention" value={data.retention} /><p>Loaded records only; no global audit entitlement.</p>{caseId !== undefined && <Field label="Case filter" value={caseId} />}<label>Search loaded events <input value={search} onChange={(e) => setSearch(e.target.value)} /></label><label>Outcome <select value={outcome} onChange={(e) => setOutcome(e.target.value)}><option value="">All loaded outcomes</option>{Array.from(new Set(events.map((item) => item.outcome))).map((value) => <option key={value} value={value}>{value}</option>)}</select></label>{visibleEvents.length === 0 && <p>No matching loaded events.</p>}<ul>{visibleEvents.map((item) => <li key={item.id}><EventFields event={item} /><button type="button" onClick={() => setView({ screen: "audit.event", eventId: item.id, caseId })}>Open event {item.id}</button></li>)}</ul></>}
      {view.screen === "audit.event" && event && <><button type="button" onClick={() => setView({ screen: "governance.audit", caseId })}>Back to audit trail</button><EventFields event={event} /><Field label="Initiator" value={event.initiator} /><Field label="Reviewer" value={event.reviewer} />{event.reason && <Field label="Reason" value={event.reason} />}{event.policy && <Field label="Policy" value={event.policy} />}</>}
      {view.screen === "administration" && <><p>Browser preferences, operator/platform configuration and trusted access context have separate owners.</p><button type="button" onClick={() => setView({ screen: "settings.console" })}>Open console settings</button><button type="button" onClick={() => setView({ screen: "settings.platform", settingId: "platform-fixture" })}>Open platform settings</button><button type="button" onClick={() => setView({ screen: "settings.access", settingId: "access-fixture" })}>Open access context</button></>}
      {view.screen === "settings.console" && <><button type="button" onClick={() => setView({ screen: "administration" })}>Back to administration</button><p>Browser-only preview; no persistence policy is assumed.</p><p>Theme preview: {theme}</p><button type="button" onClick={() => setTheme(theme === "light" ? "dark" : "light")}>Preview {theme === "light" ? "dark" : "light"} theme</button><p>UTC and reduced-motion preferences: not recorded.</p></>}
      {view.screen === "settings.platform" && setting && <><button type="button" onClick={() => setView({ screen: "administration" })}>Back to administration</button><Field label="Setting ID" value={setting.id} /><Field label="Ownership source" value={setting.owner} /><Field label="Effective sanitized value" value={setting.value} /></>}
      {view.screen === "settings.access" && setting && <><button type="button" onClick={() => setView({ screen: "administration" })}>Back to administration</button><Field label="Ownership source" value={setting.owner} /><p>Trusted principal: Unknown</p><p>Trusted capabilities: Unknown</p><p>Display name, avatar and email are not trusted identity or capability evidence.</p><p>Authentication and logout behavior are not implemented by this fixture.</p></>}
    </ReadStatePanel>
  </div></ConsoleShell>;
}

/** Isolated in-memory presentation; fixture access is not authorization. */
export function FixtureGovernance({ scope = "fixture-scope-a", initialScreen = { screen: "governance.policies" }, status = "ready", access = ["policy", "audit", "administration"] }: FixtureGovernanceProps) {
  return <FixtureView key={JSON.stringify([scope, initialScreen, status, access])} scope={scope} initialScreen={initialScreen} status={status} access={access} />;
}
