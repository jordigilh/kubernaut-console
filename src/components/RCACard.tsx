import type { RCAData } from "../hooks/useChat";

interface Props {
  rca: RCAData;
}

interface ParsedSummary {
  intro: string;
  steps: string[];
  conclusion: string;
}

function parseSummary(text: string): ParsedSummary {
  const stepPattern = /\s(?=\d+\.\s)/;
  const firstStepMatch = text.match(/\s(1\.\s)/);

  if (!firstStepMatch || firstStepMatch.index === undefined) {
    return { intro: text, steps: [], conclusion: "" };
  }

  const intro = text.slice(0, firstStepMatch.index + 1).trim();
  const rest = text.slice(firstStepMatch.index + 1);

  const parts = rest.split(stepPattern).filter(Boolean);
  const steps: string[] = [];
  let conclusion = "";

  for (const part of parts) {
    const stepMatch = part.match(/^(\d+)\.\s(.+)/s);
    if (stepMatch) {
      steps.push(stepMatch[2].trim());
    } else {
      conclusion = part.trim();
    }
  }

  if (steps.length > 0) {
    const lastStep = steps[steps.length - 1];
    const sentenceEnd = lastStep.match(/\.\s+(?=[A-Z](?![a-z]*\/))/);
    if (sentenceEnd && sentenceEnd.index !== undefined) {
      const boundary = sentenceEnd.index + 1;
      conclusion = lastStep.slice(boundary).trim();
      steps[steps.length - 1] = lastStep.slice(0, boundary).trim();
    }
  }

  return { intro, steps, conclusion };
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

  const hasExplicitChain = rca.causalChain.length > 0;
  const parsed = hasExplicitChain ? null : parseSummary(rca.summary);
  const chainSteps = hasExplicitChain ? rca.causalChain : (parsed?.steps ?? []);

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
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${badgeClass}`}>
            {rca.severity}
          </span>
        </div>

        {/* Summary intro */}
        <p className="text-xs text-text-secondary leading-relaxed mb-2">
          {hasExplicitChain ? rca.summary : (parsed?.intro || rca.summary)}
        </p>

        {/* Causal chain */}
        {chainSteps.length > 0 && (
          <>
            <p className="text-[11px] font-medium text-text-muted mb-1.5">Causal chain:</p>
            <ol
              data-testid="causal-chain"
              className="max-h-[180px] overflow-y-auto scrollbar-thin list-decimal pl-4 space-y-1.5 mb-2"
            >
              {chainSteps.map((entry, idx) => {
                const { label, text } = parseCausalEntry(entry);
                return (
                  <li key={idx} className="text-xs leading-relaxed text-text-secondary">
                    {label && <span className="font-medium text-text-muted">{label} </span>}
                    {text}
                  </li>
                );
              })}
            </ol>
          </>
        )}

        {/* Conclusion (from parsed summary) */}
        {parsed?.conclusion && (
          <p className="text-xs text-text-secondary leading-relaxed mb-2 font-medium">
            {parsed.conclusion}
          </p>
        )}

        {/* Separator */}
        <hr className="border-border mb-3" />

        {/* Metadata */}
        <p className="text-[11px] text-text-muted">
          {rca.rrId && <>RR: {rca.rrId} | </>}
          Target: {rca.target} | Confidence: {rca.confidence} | {rca.toolCallsCount} tool calls, {rca.llmTurns} LLM turns
        </p>
      </div>
    </div>
  );
}
