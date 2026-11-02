import { useState } from "react";
import { ConsoleShell, ReadStatePanel, type ReadStatus } from "./foundation";
import { assessmentForExecution, findAssessment, findExecution, findWorkflow, workflowFixtures, type FixtureAssessment, type FixtureExecution, type WorkflowKey } from "./workflow-fixtures";

export type FixtureWorkflowScreen =
  | { screen: "workflows.catalog" }
  | { screen: "workflows.detail" | "workflows.executions"; workflow: WorkflowKey }
  | { screen: "executions.detail"; executionId: string }
  | { screen: "outcomes.verification"; assessmentId: string };
export interface FixtureWorkflowsProps { scope?: string; initialScreen?: FixtureWorkflowScreen; status?: ReadStatus }

function Field({ label, value }: { label: string; value?: string }) { return <p>{label}: {value || "Not recorded"}</p>; }
function Identity({ workflow }: { workflow: WorkflowKey }) { return <><Field label="Workflow ID" value={workflow.id} /><Field label="Workflow version" value={workflow.version} /></>; }
function Execution({ record }: { record: FixtureExecution }) {
  return <section><h2>Execution snapshot</h2><Identity workflow={record.workflow} /><Field label="Recorded workflow name" value={record.workflow.name} /><Field label="Phase" value={record.phase} /><Field label="Target" value={record.target} /><Field label="Source" value={record.source} /><Field label="Start" value={record.startedAt} /><Field label="End" value={record.endedAt} /><Field label="Duration" value={record.duration} /><Field label="Structured failure" value={record.failure} /></section>;
}
function Assessment({ record }: { record: FixtureAssessment }) {
  return <><section><h2>Application / outcome</h2><Field label="Application" value={record.application} /></section>
    <section><h2>Assessment / verification</h2><Field label="Assessment ID" value={record.id} /><Field label="Lifecycle" value={record.lifecycle} /><Field label="Completeness" value={record.completeness} /><Field label="Reason" value={record.reason} /><Field label="Components" value={record.components} /></section>
    <section><h2>Effectiveness</h2><Field label="Recorded score" value={record.effectiveness} /></section>
    <section><h2>Signal</h2><Field label="Recorded signal" value={record.signal} /></section>
    <section><h2>Recovery</h2><Field label="Recorded recovery" value={record.recovery} /></section></>;
}

function FixtureView({ scope, initialScreen, status }: Required<FixtureWorkflowsProps>) {
  const [view, setView] = useState(initialScreen);
  const data = workflowFixtures;
  const scoped = Boolean(scope.trim()) && scope === data.sourceScope;
  const hasData = status === "ready" || status === "partial" || status === "stale";
  const workflow = "workflow" in view ? findWorkflow(data, scope, view.workflow) : undefined;
  const execution = view.screen === "executions.detail" ? findExecution(data, scope, view.executionId) : view.screen === "outcomes.verification" ? (() => { const assessment = findAssessment(data, scope, view.assessmentId); return assessment && findExecution(data, scope, assessment.executionId); })() : undefined;
  const assessment = view.screen === "outcomes.verification" ? findAssessment(data, scope, view.assessmentId) : execution && assessmentForExecution(data, scope, execution.id);
  const workflows = data.workflows.filter((item) => findWorkflow(data, scope, item) === item);
  const executions = view.screen === "workflows.executions" && workflow ? data.executions.filter((item) => item.workflow.id === workflow.id && item.workflow.version === workflow.version && findExecution(data, scope, item.id) === item) : [];
  const missing = (view.screen === "workflows.detail" || view.screen === "workflows.executions") ? !workflow : view.screen === "executions.detail" ? !execution : view.screen === "outcomes.verification" ? !assessment || !execution : false;
  const readStatus: ReadStatus = status === "forbidden" ? "forbidden" : !scoped ? "missing" : !hasData ? status : missing ? "missing" : status === "ready" && ((view.screen === "workflows.catalog" && workflows.length === 0) || (view.screen === "workflows.executions" && executions.length === 0)) ? "empty" : status;
  const title = { "workflows.catalog": "Workflow catalog", "workflows.detail": "Workflow version", "workflows.executions": "Recorded executions", "executions.detail": "Execution detail", "outcomes.verification": "Verification and outcome" }[view.screen];
  return <ConsoleShell access={["workflows"]} topology="unknown" current="workflows" hrefs={{}}><div className="kn-investigation-fixture" data-fixture="true" data-screen={view.screen}>
    <p role="note">Synthetic fixture — read-only; not live data or authorization. Catalog access does not grant execution or general audit access.</p><h1>{title}</h1>
    {view.screen === "workflows.executions" && workflow && (readStatus === "ready" || readStatus === "empty" || readStatus === "partial" || readStatus === "stale") && <button type="button" onClick={() => setView({ screen: "workflows.detail", workflow: view.workflow })}>Back to workflow</button>}
    <ReadStatePanel label="Workflow read" state={{ status: readStatus, provenance: { source: data.source, observedAt: data.observedAt } }}>
      <p>Fixture source scope: {data.sourceScope}</p>
      {view.screen === "workflows.catalog" && <><p>Loaded workflow versions: {workflows.length}</p><ul>{workflows.map((item) => <li key={`${item.id}/${item.version}`}><strong>{item.name}</strong><Identity workflow={item} /><Field label="Description" value={item.description} /><Field label="Applicability" value={item.applicability} /><button type="button" onClick={() => setView({ screen: "workflows.detail", workflow: { id: item.id, version: item.version } })}>Open workflow {item.id} version {item.version}</button></li>)}</ul></>}
      {view.screen === "workflows.detail" && workflow && <><button type="button" onClick={() => setView({ screen: "workflows.catalog" })}>Back to catalog</button><section><h2>Definition</h2><Identity workflow={workflow} /><Field label="Name" value={workflow.name} /><Field label="Description" value={workflow.description} /><Field label="Applicability" value={workflow.applicability} /><Field label="Action" value={workflow.action} /><Field label="Engine" value={workflow.engine} /><Field label="Placement" value={workflow.placement} /><Field label="Schema" value={workflow.schema} /><Field label="Preconditions" value={workflow.preconditions} /></section><button type="button" onClick={() => setView({ screen: "workflows.executions", workflow: { id: workflow.id, version: workflow.version } })}>View recorded executions</button></>}
      {view.screen === "workflows.executions" && workflow && <><Identity workflow={workflow} /><p>Loaded executions: {executions.length}</p><ul>{executions.map((item) => { const related = assessmentForExecution(data, scope, item.id); return <li key={item.id}><p>Execution ID: {item.id}</p><Execution record={item} />{related ? <Assessment record={related} /> : <p>Recorded assessment relationship: Not available or ambiguous</p>}<button type="button" onClick={() => setView({ screen: "executions.detail", executionId: item.id })}>Open execution {item.id}</button></li>; })}</ul></>}
      {view.screen === "executions.detail" && execution && <><button type="button" onClick={() => setView({ screen: "workflows.executions", workflow: { id: execution.workflow.id, version: execution.workflow.version } })}>Back to recorded executions</button><Execution record={execution} /><p>Execution ID: {execution.id}</p>{assessment ? <button type="button" onClick={() => setView({ screen: "outcomes.verification", assessmentId: assessment.id })}>Open recorded assessment {assessment.id}</button> : <p>Recorded assessment relationship: Not available or ambiguous</p>}</>}
      {view.screen === "outcomes.verification" && assessment && execution && <><button type="button" onClick={() => setView({ screen: "executions.detail", executionId: execution.id })}>Back to execution</button><Execution record={execution} /><p>Execution ID: {execution.id}</p><Assessment record={assessment} /></>}
    </ReadStatePanel>
  </div></ConsoleShell>;
}
/** In-memory fixture only; accepts no source, transport, or operational handlers. */
export function FixtureWorkflows({ scope = "fixture-scope-a", initialScreen = { screen: "workflows.catalog" }, status = "ready" }: FixtureWorkflowsProps) {
  return <FixtureView key={JSON.stringify([scope, initialScreen, status])} scope={scope} initialScreen={initialScreen} status={status} />;
}
