import { useState } from "react";
import { ConsoleShell, ReadStatePanel, type ReadStatus } from "./foundation";
import { findFixtureCase, findFixtureWorkspace, investigationFixtures, type FixtureCase, type FixtureScope } from "./investigation-fixtures";

type FixtureScreen = { screen: "investigations.list" } | { screen: "investigations.case"; caseId: string } | { screen: "investigations.workspace"; caseId: string; workspaceId: string };

export interface FixtureInvestigationsProps {
  /** Fixture dataset scope, not an authenticated identity. */
  scope?: string;
  initialScreen?: FixtureScreen;
  /** Synthetic read outcome. No request is performed. */
  status?: ReadStatus;
}

function ScopeFields({ label, scope }: { label: string; scope: FixtureScope }) {
  return <section><h3>{label}</h3><dl>
    <dt>Cluster</dt><dd>{scope.cluster ?? "Not captured"}</dd>
    <dt>Namespace</dt><dd>{scope.namespace ?? "Not captured"}</dd>
    <dt>Resource</dt><dd>{scope.resource ?? "Not captured"}</dd>
  </dl></section>;
}

function CaseFields({ record }: { record: FixtureCase }) {
  return <><p>RR ID: {record.id}</p><p>Recorded lifecycle: {record.lifecycle}</p>
    <ScopeFields label="Original Alert scope" scope={record.alert} />
    <ScopeFields label="RCA target scope" scope={record.target} />
  </>;
}

function FixtureView({ scope, initialScreen, status }: Required<FixtureInvestigationsProps>) {
  const [view, setView] = useState<FixtureScreen>(initialScreen);
  const data = investigationFixtures;
  const scopeMatches = Boolean(scope.trim()) && scope === data.sourceScope;
  const dataAvailable = status === "ready" || status === "partial" || status === "stale";
  const record = view.screen === "investigations.list" ? undefined : findFixtureCase(data, scope, view.caseId);
  const relationship = record && findFixtureWorkspace(data, scope, record.id);
  const exactWorkspace = view.screen !== "investigations.workspace" || (relationship && relationship.workspaceId === view.workspaceId);
  const effectiveStatus: ReadStatus = status === "forbidden" ? "forbidden" : !scopeMatches ? "missing" : !dataAvailable ? status : view.screen !== "investigations.list" && (!record || !exactWorkspace) ? "missing" : status;
  const list = data.cases.filter((item) => item.sourceScope === scope && findFixtureCase(data, scope, item.id));
  const readStatus = effectiveStatus === "ready" && view.screen === "investigations.list" && list.length === 0 ? "empty" : effectiveStatus;
  const provenance = { source: data.source, observedAt: data.observedAt };
  return <ConsoleShell access={["investigations"]} topology="unknown" current="investigations" hrefs={{}}>
    <div className="kn-investigation-fixture" data-fixture="true" data-screen={view.screen}>
      <p role="note">Synthetic fixture — read-only; no live investigation or chat</p>
      <h1>{view.screen === "investigations.list" ? "Recorded investigations" : view.screen === "investigations.case" ? "Recorded case" : "Recorded workspace context"}</h1>
      <ReadStatePanel state={{ status: readStatus, provenance }} label="Investigation">
        {view.screen === "investigations.list" ? <><p>Loaded cases: {list.length}</p><ul>{list.map((item) => {
          const link = findFixtureWorkspace(data, scope, item.id);
          return <li key={item.id}><span>{item.id} — {item.lifecycle}</span>{" "}<button type="button" onClick={() => setView({ screen: "investigations.case", caseId: item.id })}>Open case {item.id}</button>{link && <> <button type="button" onClick={() => setView({ screen: "investigations.workspace", caseId: item.id, workspaceId: link.workspaceId })}>Open existing workspace {item.id}</button></>}</li>;
        })}</ul></> : record && <>
          <button type="button" onClick={() => setView({ screen: "investigations.list" })}>Back to investigations</button>
          {view.screen === "investigations.workspace" && <button type="button" onClick={() => setView({ screen: "investigations.case", caseId: record.id })}>Back to case</button>}
          <CaseFields record={record} />
          {view.screen === "investigations.case" && relationship && <button type="button" onClick={() => setView({ screen: "investigations.workspace", caseId: record.id, workspaceId: relationship.workspaceId })}>Open existing workspace {record.id}</button>}
          {view.screen === "investigations.workspace" && <p>Recorded context only. Conversation, live status and driver are not available in this fixture.</p>}
        </>}
      </ReadStatePanel>
    </div>
  </ConsoleShell>;
}

/** Isolated synthetic presentation: it accepts no data source, adapter or action handlers. */
export function FixtureInvestigations({ scope = "fixture-scope-a", initialScreen = { screen: "investigations.list" }, status = "ready" }: FixtureInvestigationsProps) {
  return <FixtureView key={JSON.stringify([scope, initialScreen, status])} scope={scope} initialScreen={initialScreen} status={status} />;
}
