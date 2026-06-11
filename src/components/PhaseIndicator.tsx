interface Props {
  phase?: "investigation" | "decision" | "remediation" | "complete";
}

const PHASE_LABELS: Record<string, string> = {
  investigation: "Investigating",
  decision: "Decision pending",
  remediation: "Executing",
  complete: "Complete",
};

export function PhaseIndicator({ phase }: Props) {
  if (!phase) return null;

  return (
    <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/15">
      <span
        data-testid="phase-dot"
        className="w-2 h-2 rounded-full bg-green-400"
      />
      <span className="text-white/90 text-[11px] font-medium">
        {PHASE_LABELS[phase]}
      </span>
    </div>
  );
}
