import { render, screen } from "@testing-library/react";
import { ExecutionProgress, type ExecutionStep } from "./ExecutionProgress";

describe("ExecutionProgress", () => {
  const baseSteps: ExecutionStep[] = [
    { id: "s1", label: "Cloning GitOps repository", state: "done" },
    { id: "s2", label: "Reverting commit caa704e8", state: "running" },
    { id: "s3", label: "Pushing and verifying ArgoCD sync", state: "pending" },
  ];

  // IR-4: Remediation progress visibility for operator
  it("UT-CONSOLE-EXEC-001: renders all step labels", () => {
    render(<ExecutionProgress steps={baseSteps} completed={false} />);

    expect(screen.getByText("Cloning GitOps repository")).toBeInTheDocument();
    expect(screen.getByText("Reverting commit caa704e8")).toBeInTheDocument();
    expect(screen.getByText("Pushing and verifying ArgoCD sync")).toBeInTheDocument();
  });

  // IR-4: Operator can distinguish remediation state
  it("UT-CONSOLE-EXEC-002: shows 'Executing Remediation' when not completed", () => {
    render(<ExecutionProgress steps={baseSteps} completed={false} />);
    expect(screen.getByText("Executing Remediation")).toBeInTheDocument();
  });

  // IR-4: Operator knows when remediation is done
  it("UT-CONSOLE-EXEC-003: shows 'Remediation Complete' when completed", () => {
    const doneSteps: ExecutionStep[] = baseSteps.map((s) => ({ ...s, state: "done" }));
    render(<ExecutionProgress steps={doneSteps} completed={true} />);

    expect(screen.getByText("Remediation Complete")).toBeInTheDocument();
    expect(screen.getByText("All steps completed successfully.")).toBeInTheDocument();
  });

  // IR-4: State icons differentiate step progress
  it("UT-CONSOLE-EXEC-004: renders spinner for running state", () => {
    const runningSteps: ExecutionStep[] = [
      { id: "s1", label: "Running step", state: "running" },
    ];
    const { container } = render(<ExecutionProgress steps={runningSteps} completed={false} />);

    const spinner = container.querySelector(".animate-spin");
    expect(spinner).toBeInTheDocument();
  });

  it("UT-CONSOLE-EXEC-005: renders checkmark SVG for done state", () => {
    const doneSteps: ExecutionStep[] = [
      { id: "s1", label: "Done step", state: "done" },
    ];
    const { container } = render(<ExecutionProgress steps={doneSteps} completed={false} />);

    const svg = container.querySelector("svg.text-green-600");
    expect(svg).toBeInTheDocument();
  });

  it("UT-CONSOLE-EXEC-006: renders X SVG for failed state", () => {
    const failedSteps: ExecutionStep[] = [
      { id: "s1", label: "Failed step", state: "failed" },
    ];
    const { container } = render(<ExecutionProgress steps={failedSteps} completed={false} />);

    const svg = container.querySelector("svg.text-red-500");
    expect(svg).toBeInTheDocument();
  });

  it("UT-CONSOLE-EXEC-007: renders empty circle for pending state", () => {
    const pendingSteps: ExecutionStep[] = [
      { id: "s1", label: "Pending step", state: "pending" },
    ];
    const { container } = render(<ExecutionProgress steps={pendingSteps} completed={false} />);

    const circle = container.querySelector(".border-gray-300");
    expect(circle).toBeInTheDocument();
  });

  // IR-4: Text styling communicates step state
  it("UT-CONSOLE-EXEC-008: applies correct text colors per state", () => {
    render(<ExecutionProgress steps={baseSteps} completed={false} />);

    const doneLabel = screen.getByText("Cloning GitOps repository");
    expect(doneLabel).toHaveClass("text-green-700");

    const runningLabel = screen.getByText("Reverting commit caa704e8");
    expect(runningLabel).toHaveClass("text-kubernaut-green-800", "font-medium");

    const pendingLabel = screen.getByText("Pushing and verifying ArgoCD sync");
    expect(pendingLabel).toHaveClass("text-gray-400");
  });

  it("UT-CONSOLE-EXEC-009: does not show completion message when not completed", () => {
    render(<ExecutionProgress steps={baseSteps} completed={false} />);
    expect(screen.queryByText("All steps completed successfully.")).not.toBeInTheDocument();
  });
});
