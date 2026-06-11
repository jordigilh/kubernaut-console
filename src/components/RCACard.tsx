import type { RCAData } from "../hooks/useChat";

interface Props {
  rca: RCAData;
}

const SEVERITY_ACCENT: Record<string, string> = {
  critical: "bg-kubernaut-red-600",
  high: "bg-amber-500",
  medium: "bg-yellow-500",
  low: "bg-kubernaut-green-700",
};

const SEVERITY_BADGE_BG: Record<string, string> = {
  critical: "bg-kubernaut-red-50 text-kubernaut-red-600",
  high: "bg-amber-50 text-amber-700",
  medium: "bg-yellow-50 text-yellow-700",
  low: "bg-kubernaut-green-50 text-kubernaut-green-700",
};

function parseCausalEntry(entry: string): { label: string; text: string } {
  const colonIdx = entry.indexOf(":");
  if (colonIdx > 0 && colonIdx < 15) {
    return { label: entry.slice(0, colonIdx + 1), text: entry.slice(colonIdx + 1).trim() };
  }
  return { label: "", text: entry };
}

export function RCACard({ rca }: Props) {
  const accentClass = SEVERITY_ACCENT[rca.severity] ?? "bg-gray-400";
  const badgeClass = SEVERITY_BADGE_BG[rca.severity] ?? "bg-gray-100 text-gray-600";

  return (
    <div className="relative rounded-xl border border-border bg-white shadow-sm overflow-hidden animate-fade-in">
      {/* Severity accent bar */}
      <div
        data-testid="severity-accent"
        className={`absolute left-0 top-2 bottom-2 w-1 rounded-r ${accentClass}`}
      />

      <div className="pl-5 pr-4 py-4">
        {/* Header */}
        <div className="flex items-center gap-2 mb-3">
          <h3 className="text-sm font-bold text-text-primary font-display">
            Root Cause Analysis
          </h3>
          <span className={`px-2 py-0.5 rounded-full text-[9px] font-semibold ${badgeClass}`}>
            {rca.severity}
          </span>
        </div>

        {/* Summary */}
        <p className="text-xs text-text-secondary leading-relaxed mb-2">
          {rca.summary}
        </p>

        {/* Metadata */}
        <p className="text-[11px] text-text-muted mb-3">
          Target: {rca.target} | Confidence: {rca.confidence} | {rca.toolCallsCount} tool calls, {rca.llmTurns} LLM turns
        </p>

        {/* Separator */}
        <hr className="border-border mb-3" />

        {/* Causal chain */}
        <p className="text-[11px] font-medium text-text-muted mb-1.5">Causal chain:</p>
        <div
          data-testid="causal-chain"
          className="max-h-[120px] overflow-y-auto scrollbar-thin space-y-1"
        >
          {rca.causalChain.map((entry, idx) => {
            const { label, text } = parseCausalEntry(entry);
            return (
              <div key={idx} className="text-[11px] leading-relaxed">
                {label && <span className="text-text-muted">{label} </span>}
                <span className="text-text-secondary">{text}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
