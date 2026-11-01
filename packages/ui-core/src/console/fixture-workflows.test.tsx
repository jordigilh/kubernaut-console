import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FixtureWorkflows, type FixtureWorkflowScreen } from "./fixture-workflows";
import { assessmentForExecution, findAssessment, findExecution, findWorkflow, workflowFixtures } from "./workflow-fixtures";

const scope = "fixture-scope-a";
const workflow = { id: "wf-fixture-01", version: "1.0.7" };

describe("synthetic workflow identities", () => {
  it("requires an exact unique ID and version in scope", () => {
    expect(findWorkflow(workflowFixtures, scope, workflow)?.version).toBe("1.0.7");
    for (const key of [{ ...workflow, version: "" }, { ...workflow, version: "1.0.8" }, { ...workflow, id: "" }]) expect(findWorkflow(workflowFixtures, scope, key)).toBeUndefined();
    expect(findWorkflow(workflowFixtures, "other", workflow)).toBeUndefined();
    const duplicate = { ...workflowFixtures, workflows: [...workflowFixtures.workflows, { ...workflowFixtures.workflows[0], sourceScope: "other" }] };
    expect(findWorkflow(duplicate, scope, workflow)).toBeUndefined();
  });
  it("rejects missing, duplicated and mismatched execution and assessment relationships", () => {
    const execution = workflowFixtures.executions[0];
    const assessment = workflowFixtures.assessments[0];
    expect(findExecution(workflowFixtures, scope, execution.id)).toBe(execution);
    expect(findAssessment(workflowFixtures, scope, assessment.id)).toBe(assessment);
    expect(findExecution({ ...workflowFixtures, executions: [execution, execution] }, scope, execution.id)).toBeUndefined();
    expect(findExecution(workflowFixtures, "other", execution.id)).toBeUndefined();
    expect(findExecution(workflowFixtures, scope, "missing")).toBeUndefined();
    for (const assessments of [[], [assessment, assessment], [{ ...assessment, sourceScope: "other" }], [{ ...assessment, workflow: { ...workflow, version: "1.0.0" } }], [{ ...assessment, executionId: "missing" }]]) {
      const data = { ...workflowFixtures, assessments };
      expect(findAssessment(data, scope, assessment.id)).toBeUndefined();
      expect(assessmentForExecution(data, scope, execution.id)).toBeUndefined();
    }
  });
});

describe("fixture workflow presentation", () => {
  const direct: FixtureWorkflowScreen = { screen: "outcomes.verification", assessmentId: "ea-fixture-01" };
  it.each([["loading", "Loading"], ["empty", "No results"], ["unavailable", "Unavailable"], ["forbidden", "Access denied"], ["missing", "Missing or out of scope"]] as const)("withholds records and provenance for %s", (status, text) => {
    render(<FixtureWorkflows initialScreen={direct} status={status} />);
    expect(screen.getByText(new RegExp(text))).toBeInTheDocument();
    expect(screen.queryByText(/wf-fixture|we-fixture|ea-fixture|Synthetic workflow fixture|Fixture source scope|Loaded executions/)).not.toBeInTheDocument();
  });
  it.each(["ready", "partial", "stale"] as const)("shows provenance with %s", (status) => {
    render(<FixtureWorkflows initialScreen={direct} status={status} />);
    expect(screen.getByText(/Source: Synthetic workflow fixture/)).toHaveTextContent("2026-01-01T00:00:00Z");
    expect(screen.getByText("Fixture source scope: fixture-scope-a")).toBeInTheDocument();
    if (status !== "ready") expect(screen.getByText(new RegExp(`Workflow read: ${status}`, "i"))).toBeInTheDocument();
  });
  it("keeps execution, application, assessment, score, signal and recovery separate", () => {
    render(<FixtureWorkflows initialScreen={direct} />);
    for (const [heading, text] of [["Execution snapshot", "Phase: Completed"], ["Application / outcome", "Application: Confirmed"], ["Assessment / verification", "Completeness: Full"], ["Effectiveness", "Recorded score: 0.00"], ["Signal", "Recorded signal: Unresolved"], ["Recovery", "Recorded recovery: Not established"]]) {
      expect(within(screen.getByRole("heading", { name: heading }).parentElement!).getByText(text)).toBeInTheDocument();
    }
    expect(screen.getByText("Duration: Not recorded")).toBeInTheDocument();
  });
  it("rejects invalid IDs, versions, scopes and hides prior content on denial", () => {
    const { rerender } = render(<FixtureWorkflows initialScreen={direct} />);
    for (const props of [{ scope: "other", initialScreen: direct }, { initialScreen: { screen: "workflows.detail", workflow: { ...workflow, version: "unknown" } } as FixtureWorkflowScreen }, { initialScreen: { screen: "executions.detail", executionId: "missing" } as FixtureWorkflowScreen }, { initialScreen: { screen: "outcomes.verification", assessmentId: "missing" } as FixtureWorkflowScreen }, { status: "forbidden" as const, initialScreen: direct }]) {
      rerender(<FixtureWorkflows {...props} />);
      expect(screen.queryByText(/Recorded score: 0.00|Synthetic workflow fixture|Fixture source scope/)).not.toBeInTheDocument();
      expect(screen.getByRole("alert")).toBeInTheDocument();
    }
  });
  it("navigates exact fixture records without network, storage or mutation controls", () => {
    const fetch = vi.spyOn(globalThis, "fetch");
    const storage = vi.spyOn(Storage.prototype, "setItem");
    render(<FixtureWorkflows />);
    fireEvent.click(screen.getByRole("button", { name: "Open workflow wf-fixture-01 version 1.0.7" }));
    expect(screen.getByText("Workflow version: 1.0.7")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "View recorded executions" }));
    fireEvent.click(screen.getByRole("button", { name: "Open execution we-fixture-01" }));
    fireEvent.click(screen.getByRole("button", { name: "Open recorded assessment ea-fixture-01" }));
    expect(screen.getByText("Recorded score: 0.00")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /run|select|retry|edit|delete|override|execute/i })).not.toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled(); expect(storage).not.toHaveBeenCalled();
    fetch.mockRestore(); storage.mockRestore();
  });
  it("shows successful empty for an exact version without executions", () => {
    render(<FixtureWorkflows initialScreen={{ screen: "workflows.executions", workflow: { ...workflow, version: "1.0.0" } }} />);
    expect(screen.getByText(/No results/)).toBeInTheDocument();
    expect(screen.queryByText(/we-fixture-01/)).not.toBeInTheDocument();
  });
});
