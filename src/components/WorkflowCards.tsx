import { useState, useEffect, useCallback } from "react";
import type { WorkflowOption } from "../hooks/useChat";

interface Props {
  options: WorkflowOption[];
  onExecute?: (workflowId: string) => void;
  onCancel?: () => void;
}

const COUNTDOWN_SECONDS = 10;

export function WorkflowCards({ options, onExecute, onCancel }: Props) {
  const recommended = options.find((o) => o.recommended);
  const ruledOut = options.filter((o) => !o.recommended);

  const [countdown, setCountdown] = useState<number | null>(null);

  useEffect(() => {
    if (countdown === null || countdown <= 0) return;
    const id = setInterval(() => {
      setCountdown((c) => (c !== null ? c - 1 : null));
    }, 1000);
    return () => clearInterval(id);
  }, [countdown]);

  useEffect(() => {
    if (countdown === 0 && recommended) {
      onExecute?.(recommended.workflowId);
    }
  }, [countdown, recommended, onExecute]);

  const handleExecute = useCallback(() => {
    setCountdown(COUNTDOWN_SECONDS);
  }, []);

  const handleCancel = useCallback(() => {
    setCountdown(null);
    onCancel?.();
  }, [onCancel]);

  return (
    <div className="space-y-2 w-full animate-slide-up" role="group" aria-label="Remediation options">
      {/* Recommended card (expanded) */}
      {recommended && (
        <div
          data-testid={`workflow-card-${recommended.workflowId}`}
          className="rounded-xl border-2 border-kubernaut-teal-600 bg-white shadow-sm overflow-hidden"
        >
          <div className="p-4">
            {/* Header */}
            <div className="flex items-center gap-2 mb-2">
              <span
                data-testid="checkmark-icon"
                className="flex h-4 w-4 items-center justify-center rounded-full bg-kubernaut-green-600"
              >
                <svg className="w-2.5 h-2.5 text-white" viewBox="0 0 12 12" fill="none">
                  <path d="M3 6l2 2 4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
              <span className="text-xs font-bold text-text-primary">{recommended.name}</span>
              <span className="px-2 py-0.5 rounded-full text-[9px] font-semibold bg-kubernaut-teal-50 text-kubernaut-teal-600 border border-kubernaut-teal-600/30">
                Recommended
              </span>
            </div>

            {/* Description */}
            {recommended.description && (
              <p className="text-[11px] text-text-secondary leading-relaxed mb-3">
                {recommended.description}
              </p>
            )}

            {/* Parameters */}
            {recommended.parameters && (
              <div className="rounded bg-surface-secondary px-3 py-2 mb-3">
                <p className="text-[11px] font-mono text-text-muted leading-relaxed">
                  {Object.entries(recommended.parameters).map(([k, v]) => `${k}=${v}`).join("  ")}
                </p>
              </div>
            )}

            {/* Action buttons */}
            <div className="flex gap-2">
              {countdown === null ? (
                <button
                  type="button"
                  onClick={handleExecute}
                  className="flex-1 py-2 rounded-lg bg-kubernaut-teal-600 text-white text-xs font-semibold hover:bg-kubernaut-teal-700 transition-colors"
                  aria-label={`Execute ${recommended.name}`}
                >
                  Execute
                </button>
              ) : (
                <>
                  <div className="flex-1 relative">
                    <button
                      type="button"
                      className="w-full py-2 rounded-lg bg-kubernaut-teal-600 text-white text-xs font-semibold"
                      aria-label={`Executing in ${countdown} seconds`}
                    >
                      Executing in {countdown}s...
                    </button>
                    <div className="absolute bottom-0 left-0 h-1 rounded-b-lg bg-black/10 w-full">
                      <div
                        className="h-full rounded-b-lg bg-white/50 countdown-bar"
                      />
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleCancel}
                    className="flex-1 py-2 rounded-lg border border-border bg-white text-text-muted text-xs font-medium hover:bg-gray-50 transition-colors"
                    aria-label="Cancel execution"
                  >
                    Cancel
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Ruled-out cards (collapsed) */}
      {ruledOut.map((opt) => (
        <div
          key={opt.workflowId}
          data-testid={`workflow-card-${opt.workflowId}`}
          className="rounded-xl border border-border bg-white px-4 py-2.5 flex items-center gap-2 opacity-50"
        >
          <span
            data-testid="ruled-out-icon"
            className="flex h-4 w-4 items-center justify-center rounded-full bg-kubernaut-red-600"
          >
            <svg className="w-2.5 h-2.5 text-white" viewBox="0 0 12 12" fill="none">
              <path d="M3 6h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </span>
          <span className="text-xs font-bold text-text-muted">{opt.name}</span>
          <span className="px-2 py-0.5 rounded-full text-[9px] font-semibold bg-kubernaut-red-50 text-kubernaut-red-600">
            Ruled out
          </span>
          {opt.ruledOutReason && (
            <span className="text-[11px] text-text-dim">{opt.ruledOutReason}</span>
          )}
        </div>
      ))}
    </div>
  );
}
