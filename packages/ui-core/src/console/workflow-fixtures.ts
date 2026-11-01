/** Synthetic presentation records, not API schemas or authorization evidence. */
export interface WorkflowKey { id: string; version: string }
interface Scoped { sourceScope: string }
export interface FixtureWorkflow extends Scoped, WorkflowKey { name: string; description?: string; applicability?: string; action?: string; engine?: string; placement?: string; preconditions?: string; schema?: string }
export interface FixtureExecution extends Scoped { id: string; workflow: WorkflowKey & { name: string }; phase: string; target?: string; source?: string; startedAt?: string; endedAt?: string; duration?: string; failure?: string }
export interface FixtureAssessment extends Scoped { id: string; executionId: string; workflow: WorkflowKey; lifecycle: string; completeness?: string; reason?: string; components?: string; application?: string; effectiveness?: string; signal?: string; recovery?: string }
export interface FixtureWorkflowData { sourceScope: string; source: string; observedAt: string; workflows: readonly FixtureWorkflow[]; executions: readonly FixtureExecution[]; assessments: readonly FixtureAssessment[] }

export const workflowFixtures: FixtureWorkflowData = {
  sourceScope: "fixture-scope-a", source: "Synthetic workflow fixture", observedAt: "2026-01-01T00:00:00Z",
  workflows: [
    { sourceScope: "fixture-scope-a", id: "wf-fixture-01", version: "1.0.7", name: "Recorded workflow", description: "Synthetic definition", applicability: "Fixture example", action: "Recorded action" },
    { sourceScope: "fixture-scope-a", id: "wf-fixture-01", version: "1.0.0", name: "Earlier workflow", description: "Earlier synthetic definition" },
  ],
  executions: [{ sourceScope: "fixture-scope-a", id: "we-fixture-01", workflow: { id: "wf-fixture-01", version: "1.0.7", name: "Recorded execution snapshot" }, phase: "Completed", target: "Synthetic target" }],
  assessments: [{ sourceScope: "fixture-scope-a", id: "ea-fixture-01", executionId: "we-fixture-01", workflow: { id: "wf-fixture-01", version: "1.0.7" }, lifecycle: "Completed", completeness: "Full", application: "Confirmed", effectiveness: "0.00", signal: "Unresolved", recovery: "Not established" }],
};

const valid = (value: string) => Boolean(value && value.trim());
const same = (a: WorkflowKey, b: WorkflowKey) => a.id === b.id && a.version === b.version;
const inScope = (data: FixtureWorkflowData, scope: string) => valid(scope) && scope === data.sourceScope;

/** Every identity must be exact and unique, including across conflicting scopes. */
export function findWorkflow(data: FixtureWorkflowData, scope: string, key: WorkflowKey): FixtureWorkflow | undefined {
  if (!inScope(data, scope) || !valid(key.id) || !valid(key.version)) return undefined;
  const matches = data.workflows.filter((item) => same(item, key));
  return matches.length === 1 && matches[0].sourceScope === scope ? matches[0] : undefined;
}
export function findExecution(data: FixtureWorkflowData, scope: string, id: string): FixtureExecution | undefined {
  if (!inScope(data, scope) || !valid(id)) return undefined;
  const matches = data.executions.filter((item) => item.id === id);
  const record = matches.length === 1 ? matches[0] : undefined;
  return record && record.sourceScope === scope && valid(record.workflow.id) && valid(record.workflow.version) ? record : undefined;
}
export function findAssessment(data: FixtureWorkflowData, scope: string, id: string): FixtureAssessment | undefined {
  if (!inScope(data, scope) || !valid(id)) return undefined;
  const matches = data.assessments.filter((item) => item.id === id);
  const record = matches.length === 1 ? matches[0] : undefined;
  const execution = record && findExecution(data, scope, record.executionId);
  return record && record.sourceScope === scope && execution && same(record.workflow, execution.workflow) ? record : undefined;
}
/** Only an explicitly recorded unique assessment relationship can be opened. */
export function assessmentForExecution(data: FixtureWorkflowData, scope: string, executionId: string): FixtureAssessment | undefined {
  if (!findExecution(data, scope, executionId)) return undefined;
  const matches = data.assessments.filter((item) => item.executionId === executionId);
  return matches.length === 1 ? findAssessment(data, scope, matches[0].id) : undefined;
}
