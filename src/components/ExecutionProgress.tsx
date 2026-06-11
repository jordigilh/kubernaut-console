export interface ExecutionStep {
  id: string;
  label: string;
  state: "pending" | "running" | "done" | "failed";
}

interface Props {
  steps: ExecutionStep[];
  completed: boolean;
}

export function ExecutionProgress({ steps, completed }: Props) {
  return (
    <div className="bg-kubernaut-green-50 border border-green-200 rounded-xl px-4 py-3 animate-slide-up">
      <div className="flex items-center gap-2 mb-2">
        <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
        <span className="text-xs font-semibold text-kubernaut-green-800">
          {completed ? "Remediation Complete" : "Executing Remediation"}
        </span>
      </div>

      <div className="space-y-1.5 ml-4">
        {steps.map((step) => (
          <div key={step.id} className="flex items-center gap-2 text-xs">
            <StepIcon state={step.state} />
            <span
              className={
                step.state === "done"
                  ? "text-green-700"
                  : step.state === "failed"
                  ? "text-red-600"
                  : step.state === "running"
                  ? "text-kubernaut-green-800 font-medium"
                  : "text-gray-400"
              }
            >
              {step.label}
            </span>
          </div>
        ))}
      </div>

      {completed && (
        <div className="mt-3 pt-2 border-t border-green-200 text-xs text-kubernaut-green-800 font-medium">
          All steps completed successfully.
        </div>
      )}
    </div>
  );
}

function StepIcon({ state }: { state: ExecutionStep["state"] }) {
  if (state === "done") {
    return (
      <svg className="w-3.5 h-3.5 text-green-600" fill="currentColor" viewBox="0 0 20 20">
        <path
          fillRule="evenodd"
          d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
          clipRule="evenodd"
        />
      </svg>
    );
  }
  if (state === "running") {
    return <div className="w-3.5 h-3.5 rounded-full border-2 border-green-500 border-t-transparent animate-spin" />;
  }
  if (state === "failed") {
    return (
      <svg className="w-3.5 h-3.5 text-red-500" fill="currentColor" viewBox="0 0 20 20">
        <path
          fillRule="evenodd"
          d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
          clipRule="evenodd"
        />
      </svg>
    );
  }
  return <div className="w-3.5 h-3.5 rounded-full border border-gray-300" />;
}
