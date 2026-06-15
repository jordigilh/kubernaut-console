import { useState, useEffect, useRef } from "react";
import type { VerificationStep } from "../hooks/useChat";

interface Props {
  stabilizationWindow: number;
  startedAt?: number;
  steps?: VerificationStep[];
}

const STEP_LABELS: Record<string, string> = {
  stabilization_elapsed: "Stabilization window",
  spec_hash_computed: "Spec hash verification",
  alert_check: "Alert decay check",
  health_check: "Health assessment",
};

function StepIcon({ status }: { status: string }) {
  if (status === "completed") {
    return (
      <svg className="w-3.5 h-3.5 text-kubernaut-green-600 shrink-0" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
        <path fillRule="evenodd" d="M8 15A7 7 0 108 1a7 7 0 000 14zm3.354-8.354a.5.5 0 00-.708-.708L7 9.586 5.354 7.94a.5.5 0 10-.708.708l2 2a.5.5 0 00.708 0l4-4z" />
      </svg>
    );
  }
  if (status === "failed") {
    return (
      <svg className="w-3.5 h-3.5 text-kubernaut-red-600 shrink-0" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
        <path fillRule="evenodd" d="M8 15A7 7 0 108 1a7 7 0 000 14zm2.354-9.354a.5.5 0 010 .708L8.707 8l1.647 1.646a.5.5 0 01-.708.708L8 8.707l-1.646 1.647a.5.5 0 01-.708-.708L7.293 8 5.646 6.354a.5.5 0 01.708-.708L8 7.293l1.646-1.647a.5.5 0 01.708 0z" />
      </svg>
    );
  }
  return (
    <span className="w-3.5 h-3.5 flex items-center justify-center shrink-0" aria-hidden="true">
      <span className="w-2 h-2 rounded-full bg-kubernaut-teal-400 animate-pulse" />
    </span>
  );
}

export function VerificationTimer({ stabilizationWindow, startedAt, steps }: Props) {
  const startRef = useRef<number>(0);
  const [remaining, setRemaining] = useState(stabilizationWindow);

  useEffect(() => {
    startRef.current = startedAt ?? Date.now();
    const elapsed = Math.floor((Date.now() - startRef.current) / 1000);
    setRemaining(Math.max(0, stabilizationWindow - elapsed));
  }, [startedAt, stabilizationWindow]);

  useEffect(() => {
    const interval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startRef.current) / 1000);
      setRemaining(Math.max(0, stabilizationWindow - elapsed));
    }, 1000);
    return () => clearInterval(interval);
  }, [stabilizationWindow]);

  const progress = stabilizationWindow > 0
    ? ((stabilizationWindow - remaining) / stabilizationWindow) * 100
    : 100;

  function formatTime(seconds: number): string {
    if (seconds <= 0) return "completing...";
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    if (m > 0) return `${m}m ${s}s remaining`;
    return `${s}s remaining`;
  }

  return (
    <div
      data-testid="verification-timer"
      className="rounded-xl border border-kubernaut-teal-200 bg-kubernaut-teal-50 p-3 motion-safe:animate-fade-in"
      role="status"
      aria-live="polite"
    >
      <div className="flex items-center gap-2 mb-2">
        <span className="w-2 h-2 rounded-full bg-kubernaut-teal-400 motion-safe:animate-pulse" aria-hidden="true" />
        <span className="text-xs font-semibold text-kubernaut-teal-900">
          Verifying stability
        </span>
        <span className="ml-auto text-[11px] text-kubernaut-teal-600 font-medium" aria-live="polite">
          {formatTime(remaining)}
        </span>
      </div>

      <div
        className="w-full h-1.5 rounded-full bg-kubernaut-teal-200 overflow-hidden mb-2"
        role="progressbar"
        aria-valuenow={Math.round(progress)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`Verification progress: ${formatTime(remaining)}`}
      >
        <div
          className="h-full rounded-full bg-kubernaut-teal-500 transition-all duration-1000 ease-linear motion-reduce:transition-none"
          style={{ width: `${progress}%` }}
        />
      </div>

      {steps && steps.length > 0 && (
        <div data-testid="verification-steps" className="space-y-1.5 pt-1 border-t border-kubernaut-teal-200">
          {steps.map((s) => (
            <div key={s.step} className="flex items-start gap-2">
              <StepIcon status={s.status} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className={`text-[11px] font-medium ${s.status === "completed" ? "text-kubernaut-green-700" : s.status === "failed" ? "text-kubernaut-red-600" : "text-kubernaut-teal-800"}`}>
                    {STEP_LABELS[s.step] ?? s.step}
                  </span>
                  {s.retryCount && s.retryCount > 1 && (
                    <span className="text-[10px] text-kubernaut-teal-500 font-medium">
                      (retry {s.retryCount})
                    </span>
                  )}
                  {s.elapsedSeconds !== undefined && (
                    <span className="text-[10px] text-kubernaut-teal-500 ml-auto shrink-0">
                      +{s.elapsedSeconds}s
                    </span>
                  )}
                </div>
                {s.detail && (
                  <p className="text-[10px] text-kubernaut-teal-600 truncate">
                    {s.detail}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
