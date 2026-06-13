import { useState, useEffect, useCallback, useRef } from "react";
import type { WorkflowOption } from "../hooks/useChat";

interface Props {
  options: WorkflowOption[];
  onExecute?: (workflowId: string) => void;
  onDismiss?: () => void;
  onEscalate?: (reason: string) => void;
  recoverySignal?: "problem_resolved" | "alignment_check_failed" | null;
}

const COUNTDOWN_SECONDS = 10;

export function WorkflowCards({ options, onExecute, onDismiss, onEscalate, recoverySignal }: Props) {
  const recommended = options.find((o) => o.recommended);
  const ruledOut = options.filter((o) => !o.recommended);

  const [countdown, setCountdown] = useState<number | null>(null);
  const [executed, setExecuted] = useState(false);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const onExecuteRef = useRef(onExecute);
  useEffect(() => { onExecuteRef.current = onExecute; });

  useEffect(() => {
    if (countdown === null || countdown <= 0) return;
    const id = setInterval(() => {
      setCountdown((c) => {
        if (c === null) return null;
        if (c <= 1) {
          if (recommended) onExecuteRef.current?.(recommended.workflowId);
          setExecuted(true);
          return null;
        }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [countdown, recommended]);

  const handleExecute = useCallback(() => {
    setCountdown(COUNTDOWN_SECONDS);
  }, []);

  const handleCancel = useCallback(() => {
    setCountdown(null);
  }, []);

  const handleRuledOutClick = useCallback((workflowId: string) => {
    setConfirmingId(workflowId);
  }, []);

  const handleConfirmRuledOut = useCallback(() => {
    if (confirmingId) {
      onExecuteRef.current?.(confirmingId);
      setConfirmingId(null);
      setExecuted(true);
    }
  }, [confirmingId]);

  const handleCancelRuledOut = useCallback(() => {
    setConfirmingId(null);
  }, []);

  const highlightDismiss = recoverySignal === "problem_resolved";
  const highlightEscalate = recoverySignal === "alignment_check_failed";

  const [escalating, setEscalating] = useState(false);
  const [escalateReason, setEscalateReason] = useState("");
  const escalateInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (escalating) escalateInputRef.current?.focus();
  }, [escalating]);

  return (
    <div className="space-y-2 w-full animate-slide-up" role="group" aria-label="Remediation options">
      {/* Reactive signal banner */}
      {recoverySignal === "problem_resolved" && (
        <div className="rounded-lg bg-kubernaut-green-50 border border-kubernaut-green-200 px-3 py-2 text-xs text-kubernaut-green-700" role="status">
          Alert appears to have self-resolved. No remediation may be needed.
        </div>
      )}
      {recoverySignal === "alignment_check_failed" && (
        <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-700" role="status">
          Security concern detected during investigation. Manual review recommended.
        </div>
      )}

      {/* Recommended card (expanded) */}
      {recommended && (
        <div
          data-testid={`workflow-card-${recommended.workflowId}`}
          className="rounded-xl border-2 border-kubernaut-teal-600 bg-white shadow-sm overflow-hidden"
        >
          <div className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <span
                data-testid="checkmark-icon"
                className="flex h-4 w-4 items-center justify-center rounded-full bg-kubernaut-green-600"
                aria-hidden="true"
              >
                <svg className="w-2.5 h-2.5 text-white" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                  <path d="M3 6l2 2 4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
              <span className="text-xs font-bold text-text-primary">{recommended.name}</span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-kubernaut-teal-50 text-kubernaut-teal-600 border border-kubernaut-teal-600/30">
                Recommended
              </span>
            </div>
            <p className="text-[10px] font-mono text-text-dim mb-1 truncate" title={recommended.workflowId}>
              {recommended.workflowId}
            </p>

            {recommended.description && (
              <p className="text-xs text-text-secondary leading-relaxed mb-3">
                {recommended.description}
              </p>
            )}

            {recommended.parameters && (
              <div className="rounded bg-surface-secondary px-3 py-2 mb-3">
                <p className="text-[11px] font-mono text-text-muted leading-relaxed">
                  {Object.entries(recommended.parameters).map(([k, v]) => `${k}=${v}`).join("  ")}
                </p>
              </div>
            )}

            <div className="flex gap-2">
              {countdown === null ? (
                <button
                  type="button"
                  onClick={handleExecute}
                  disabled={executed}
                  className="flex-1 py-2 rounded-lg bg-kubernaut-teal-600 text-white text-xs font-semibold hover:bg-kubernaut-teal-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  aria-label={executed ? "Workflow executed" : `Execute ${recommended.name}`}
                >
                  {executed ? "Executed" : "Execute"}
                </button>
              ) : (
                <>
                  <div className="flex-1 relative">
                    <button
                      type="button"
                      onClick={() => {
                        setCountdown(null);
                        setExecuted(true);
                        if (recommended) onExecuteRef.current?.(recommended.workflowId);
                      }}
                      className="w-full py-2 rounded-lg bg-kubernaut-teal-600 text-white text-xs font-semibold hover:bg-kubernaut-teal-700 transition-colors cursor-pointer"
                      aria-label={`Execute now (${countdown}s remaining)`}
                    >
                      Executing in {countdown}s...
                    </button>
                    <div className="absolute bottom-0 left-0 h-1 rounded-b-lg bg-black/10 w-full">
                      <div className="h-full rounded-b-lg bg-white/50 countdown-bar" />
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

      {/* Ruled-out cards (clickable with confirmation) */}
      {ruledOut.map((opt) => (
        <div key={opt.workflowId}>
          <button
            type="button"
            data-testid={`workflow-card-${opt.workflowId}`}
            className={`rounded-xl border bg-white px-4 py-2.5 flex items-center gap-2 w-full text-left cursor-pointer transition-colors ${
              confirmingId === opt.workflowId ? "border-amber-400 bg-amber-50" : "border-border hover:border-gray-300 hover:bg-gray-50"
            }`}
            onClick={() => handleRuledOutClick(opt.workflowId)}
            aria-expanded={confirmingId === opt.workflowId}
            aria-label={`${opt.name} — ruled out${opt.ruledOutReason ? `: ${opt.ruledOutReason}` : ""}`}
          >
            <span
              data-testid="ruled-out-icon"
              className="flex h-4 w-4 items-center justify-center rounded-full bg-kubernaut-red-600"
              aria-hidden="true"
            >
              <svg className="w-2.5 h-2.5 text-white" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                <path d="M3 6h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </span>
            <span className="text-xs font-bold text-text-primary">{opt.name}</span>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-kubernaut-red-50 text-kubernaut-red-600">
              Ruled out
            </span>
            {opt.ruledOutReason && (
              <span className="text-[11px] text-text-dim">{opt.ruledOutReason}</span>
            )}
          </button>

          {/* Confirmation dialog */}
          {confirmingId === opt.workflowId && (
            <div className="mt-1 ml-6 p-3 rounded-lg border border-amber-300 bg-amber-50 text-xs">
              <p className="text-amber-800 font-medium mb-2">
                This workflow was ruled out: {opt.ruledOutReason || "No reason provided"}
              </p>
              <p className="text-amber-700 mb-3">Are you sure you want to proceed?</p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleConfirmRuledOut}
                  className="px-3 py-1.5 rounded-md bg-amber-600 text-white text-[11px] font-semibold hover:bg-amber-700 transition-colors"
                  aria-label="Proceed anyway"
                >
                  Proceed anyway
                </button>
                <button
                  type="button"
                  onClick={handleCancelRuledOut}
                  className="px-3 py-1.5 rounded-md border border-gray-300 text-text-secondary text-[11px] font-medium hover:bg-gray-50 transition-colors"
                  aria-label="Go back"
                >
                  Go back
                </button>
              </div>
            </div>
          )}
        </div>
      ))}

      {/* Escape hatch actions */}
      <div className={`flex gap-2 ${options.length > 0 ? "pt-2 border-t border-border mt-3" : ""}`}>
        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            disabled={executed}
            className={`flex-1 py-2 rounded-lg text-xs font-medium transition-colors ${
              executed
                ? "border border-gray-200 text-text-dim opacity-50 cursor-not-allowed"
                : highlightDismiss
                  ? "bg-kubernaut-green-600 text-white ring-2 ring-kubernaut-green-400 ring-offset-1 hover:bg-kubernaut-green-700"
                  : "border border-gray-300 text-text-secondary hover:bg-gray-50"
            }`}
            aria-label="No action needed"
          >
            No action needed
          </button>
        )}
        {onEscalate && !escalating && (
          <button
            type="button"
            onClick={() => setEscalating(true)}
            disabled={executed}
            className={`flex-1 py-2 rounded-lg text-xs font-medium transition-colors ${
              executed
                ? "border border-gray-200 text-text-dim opacity-50 cursor-not-allowed"
                : highlightEscalate
                  ? "bg-amber-600 text-white ring-2 ring-amber-400 ring-offset-1 hover:bg-amber-700"
                  : "border border-gray-300 text-text-secondary hover:bg-gray-50"
            }`}
            aria-label="Escalate to team"
          >
            Escalate to team
          </button>
        )}
      </div>

      {/* Inline escalation input */}
      {escalating && (
        <div className="flex items-center gap-2 mt-2 animate-fade-in">
          <input
            ref={escalateInputRef}
            type="text"
            value={escalateReason}
            onChange={(e) => setEscalateReason(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && escalateReason.trim()) {
                onEscalate?.(escalateReason.trim());
                setEscalating(false);
                setEscalateReason("");
              }
              if (e.key === "Escape") {
                setEscalating(false);
                setEscalateReason("");
              }
            }}
            placeholder="Escalation reason..."
            className="flex-1 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-text-primary placeholder:text-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-500"
            aria-label="Escalation reason"
          />
          <button
            type="button"
            onClick={() => {
              if (escalateReason.trim()) {
                onEscalate?.(escalateReason.trim());
                setEscalating(false);
                setEscalateReason("");
              }
            }}
            disabled={!escalateReason.trim()}
            className="px-3 py-2 rounded-lg bg-amber-600 text-white text-xs font-semibold hover:bg-amber-700 disabled:opacity-50 transition-colors shrink-0"
            aria-label="Submit escalation"
          >
            Send
          </button>
          <button
            type="button"
            onClick={() => { setEscalating(false); setEscalateReason(""); }}
            className="px-3 py-2 rounded-lg border border-border text-xs text-text-secondary hover:bg-surface-secondary transition-colors shrink-0"
            aria-label="Cancel escalation"
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}
