import { useState, useEffect, useCallback, useRef } from "react";
import type { WorkflowOption, AlignmentVerdict } from "../hooks/useChat";

interface Props {
  options: WorkflowOption[];
  onExecute?: (workflowId: string) => void;
  onDismiss?: () => void;
  onEscalate?: (reason: string) => void;
  recoverySignal?: "problem_resolved" | "alignment_check_failed" | null;
  alignmentVerdict?: AlignmentVerdict;
}

const COUNTDOWN_SECONDS = 10;

export function WorkflowCards({ options, onExecute, onDismiss, onEscalate, recoverySignal, alignmentVerdict }: Props) {
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

  if (alignmentVerdict) {
    return (
      <div className="space-y-2 w-full animate-slide-up" role="group" aria-label="Security findings">
        {/* Security alert banner */}
        <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-800 font-medium flex items-center gap-2" role="alert">
          <svg className="w-4 h-4 text-red-600 shrink-0" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
            <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.168 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 6a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 6zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
          </svg>
          <span>Shadow agent detected suspicious activity — remediation blocked</span>
        </div>

        {/* Verdict summary card */}
        <div className="rounded-xl border border-red-200 bg-white shadow-sm overflow-hidden">
          <div className="px-4 py-3 bg-red-50 border-b border-red-200">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-red-800">Alignment Verdict: {alignmentVerdict.result}</span>
              <span className="text-[10px] text-red-600 font-mono">{alignmentVerdict.flagged} of {alignmentVerdict.total} steps flagged</span>
            </div>
          </div>
          <div className="px-4 py-3">
            <p className="text-xs text-text-secondary leading-relaxed">{alignmentVerdict.summary}</p>
          </div>
        </div>

        {/* Individual findings */}
        {alignmentVerdict.findings.map((finding, i) => (
          <div key={i} className="rounded-xl border border-amber-200 bg-white shadow-sm overflow-hidden">
            <div className="px-4 py-3 bg-amber-50 border-b border-amber-200">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono text-amber-700">Step {finding.step_index}</span>
                <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-100 text-amber-800">{finding.step_kind}</span>
                {finding.tool && (
                  <span className="text-[10px] font-mono text-text-dim">{finding.tool}</span>
                )}
              </div>
            </div>
            <div className="px-4 py-3">
              <p className="text-xs text-text-secondary leading-relaxed">{finding.explanation}</p>
            </div>
          </div>
        ))}
      </div>
    );
  }

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
              <span
                className="ml-auto text-[10px] font-mono text-text-dim cursor-pointer hover:text-text-secondary"
                title={`Click to copy: ${recommended.workflowId}`}
                onClick={() => navigator.clipboard.writeText(recommended.workflowId)}
                role="button"
                aria-label={`Copy workflow ID ${recommended.workflowId}`}
              >
                ID: {recommended.workflowId.slice(0, 8)}
              </span>
            </div>

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
            <span
              className="ml-auto text-[10px] font-mono text-text-dim shrink-0"
              title={opt.workflowId}
            >
              ID: {opt.workflowId.slice(0, 8)}
            </span>
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
      {!escalating && (
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
          {onEscalate && (
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
      )}

      {/* Inline escalation input — replaces button row */}
      {escalating && (
        <div className={`flex items-center gap-2 animate-fade-in ${options.length > 0 ? "pt-2 border-t border-border mt-3" : ""}`}>
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
