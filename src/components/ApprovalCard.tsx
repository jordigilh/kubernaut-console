import { useState, useEffect } from "react";
import type { ApprovalRequest, ApprovalResolution } from "../hooks/useChat";

interface Props {
  request: ApprovalRequest;
  resolution?: ApprovalResolution;
  onApprove: () => void;
  onDecline: () => void;
}

const CONFIDENCE_COLORS: Record<string, string> = {
  High: "bg-kubernaut-green-50 text-kubernaut-green-700",
  Medium: "bg-yellow-50 text-yellow-700",
  Low: "bg-kubernaut-red-50 text-kubernaut-red-600",
};

function formatTimeRemaining(ms: number): string {
  if (ms <= 0) return "expired";
  const minutes = Math.floor(ms / 60_000);
  const hours = Math.floor(minutes / 60);
  if (hours > 0) return `${hours}h ${minutes % 60}m remaining`;
  if (minutes > 0) return `${minutes}m remaining`;
  return `${Math.ceil(ms / 1000)}s remaining`;
}

export function ApprovalCard({ request, resolution, onApprove, onDecline }: Props) {
  const [timeRemaining, setTimeRemaining] = useState<number>(() => {
    return new Date(request.requiredBy).getTime() - Date.now();
  });

  useEffect(() => {
    const interval = setInterval(() => {
      setTimeRemaining(new Date(request.requiredBy).getTime() - Date.now());
    }, 1000);
    return () => clearInterval(interval);
  }, [request.requiredBy]);

  const isExpired = timeRemaining <= 0;
  const isResolved = !!resolution;
  const confidenceClass = CONFIDENCE_COLORS[request.confidenceLevel] ?? "bg-gray-100 text-gray-600";
  const confidencePercent = `${Math.round(request.confidence * 100)}%`;

  return (
    <div className="relative rounded-xl border border-border bg-white shadow-sm overflow-hidden animate-fade-in">
      <div className="absolute left-0 top-2 bottom-2 w-1 rounded-r bg-amber-500" />

      <div className="pl-5 pr-4 py-4">
        {/* Header */}
        <div className="flex items-center gap-2 mb-3">
          <h3 className="text-sm font-bold text-text-primary font-display">
            Approval Required
          </h3>
          <span className={`px-2 py-0.5 rounded-full text-[9px] font-semibold ${confidenceClass}`}>
            {request.confidenceLevel}
          </span>
          <span className="px-2 py-0.5 rounded-full text-[9px] font-semibold bg-gray-100 text-gray-600">
            {confidencePercent}
          </span>
        </div>

        {/* Reason */}
        <p className="text-xs text-text-secondary leading-relaxed mb-2">
          {request.reason}
        </p>

        {/* Investigation summary */}
        {request.investigationSummary && (
          <p className="text-[11px] text-text-muted mb-2 italic">
            {request.investigationSummary}
          </p>
        )}

        {/* Evidence */}
        {request.evidenceCollected && request.evidenceCollected.length > 0 && (
          <div className="mb-3">
            <p className="text-[11px] font-medium text-text-muted mb-1">Evidence:</p>
            <ul className="space-y-0.5">
              {request.evidenceCollected.map((item, idx) => (
                <li key={idx} className="text-[11px] text-text-secondary pl-2 border-l-2 border-gray-200">
                  {item}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Policy evaluation */}
        {request.policyEvaluation && (
          <div className="mb-3 p-2 bg-gray-50 rounded-lg">
            <p className="text-[11px] font-medium text-text-muted mb-1">
              Policy: {request.policyEvaluation.policyName}
            </p>
            <div className="flex flex-wrap gap-1">
              {request.policyEvaluation.matchedRules.map((rule, idx) => (
                <span key={idx} className="px-1.5 py-0.5 text-[10px] bg-amber-50 text-amber-700 rounded">
                  {rule}
                </span>
              ))}
            </div>
          </div>
        )}

        <hr className="border-border mb-3" />

        {/* Countdown + actions */}
        <div className="flex items-center justify-between">
          <span
            data-testid="approval-countdown"
            className={`text-[11px] font-medium ${isExpired ? "text-kubernaut-red-600" : "text-text-muted"}`}
          >
            {formatTimeRemaining(timeRemaining)}
          </span>

          {isResolved && (
            <span className="text-[11px] text-text-secondary">
              {resolution.decision} by {resolution.decidedBy}
            </span>
          )}

          <div className="flex gap-2">
            <button
              onClick={onDecline}
              disabled={isResolved || isExpired}
              className="px-3 py-1.5 text-[11px] font-medium rounded-lg border border-gray-300 text-text-secondary hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Decline
            </button>
            <button
              onClick={onApprove}
              disabled={isResolved || isExpired}
              className="px-3 py-1.5 text-[11px] font-medium rounded-lg bg-kubernaut-green-700 text-white hover:bg-kubernaut-green-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Approve
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
