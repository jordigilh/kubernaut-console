import { useState, useEffect } from "react";
import type { ExecutionStep } from "./ExecutionProgress";

interface Props {
  steps: ExecutionStep[];
  stabilizationWindow?: number;
}

export function StickyExecutionBar({ steps, stabilizationWindow }: Props) {
  const [expanded, setExpanded] = useState(false);

  const runningStep = steps.find(s => s.state === "running");
  const doneCount = steps.filter(s => s.state === "done").length;
  const totalCount = steps.length;
  const isVerifying = runningStep?.label?.toLowerCase().includes("verif");

  return (
    <div
      className="border-t border-green-200 bg-kubernaut-green-50 px-4 py-2"
      data-testid="sticky-execution-bar"
    >
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2 text-xs"
        aria-expanded={expanded}
        aria-label="Toggle execution details"
      >
        <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse shrink-0" />
        <span className="text-kubernaut-green-800 font-medium truncate flex-1 text-left">
          {runningStep ? runningStep.label : "Executing..."}
        </span>
        <span className="text-kubernaut-green-600 tabular-nums shrink-0">
          {doneCount}/{totalCount}
        </span>
        <svg
          className={`w-3 h-3 text-kubernaut-green-600 transition-transform ${expanded ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {expanded && (
        <div className="mt-2 ml-4 space-y-1 border-t border-green-100 pt-2">
          {steps.map(step => (
            <div key={step.id} className="flex items-center gap-2 text-xs">
              <StepDot state={step.state} />
              <span className={
                step.state === "done" ? "text-green-700" :
                step.state === "running" ? "text-kubernaut-green-800 font-medium" :
                step.state === "failed" ? "text-red-600" :
                "text-gray-400"
              }>
                {step.label}
              </span>
            </div>
          ))}
        </div>
      )}

      {isVerifying && stabilizationWindow !== undefined && stabilizationWindow > 0 && (
        <VerificationCountdown seconds={stabilizationWindow} />
      )}
    </div>
  );
}

function StepDot({ state }: { state: ExecutionStep["state"] }) {
  if (state === "done") return <div className="w-2 h-2 rounded-full bg-green-500" />;
  if (state === "running") return <div className="w-2 h-2 rounded-full border border-green-500 border-t-transparent animate-spin" />;
  if (state === "failed") return <div className="w-2 h-2 rounded-full bg-red-500" />;
  return <div className="w-2 h-2 rounded-full border border-gray-300" />;
}

interface CountdownProps {
  seconds: number;
}

function VerificationCountdown({ seconds }: CountdownProps) {
  const [remaining, setRemaining] = useState(seconds);

  useEffect(() => {
    if (remaining <= 0) return;
    const id = setInterval(() => {
      setRemaining(prev => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => clearInterval(id);
  }, []);  // eslint-disable-line react-hooks/exhaustive-deps -- countdown starts once on mount

  const minutes = Math.floor(remaining / 60);
  const secs = remaining % 60;

  return (
    <div className="mt-1 flex items-center gap-2 text-xs text-kubernaut-green-700" data-testid="verification-countdown">
      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      <span className="tabular-nums">
        {remaining > 0
          ? `Verifying stability: ${minutes}:${secs.toString().padStart(2, "0")} remaining`
          : "Verification window elapsed"}
      </span>
    </div>
  );
}
