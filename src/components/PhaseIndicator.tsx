interface Props {
  phase?: "investigation" | "decision" | "remediation" | "verifying" | "failed" | "complete";
}

const PHASE_CONFIG: Record<string, { label: string; dotClass: string }> = {
  investigation: { label: "Investigating", dotClass: "bg-green-400 animate-pulse" },
  decision: { label: "Decision pending", dotClass: "bg-yellow-400" },
  remediation: { label: "Executing", dotClass: "bg-blue-400 animate-pulse" },
  verifying: { label: "Verifying", dotClass: "bg-purple-400 animate-pulse" },
  failed: { label: "Failed", dotClass: "bg-red-400" },
  complete: { label: "Complete", dotClass: "bg-green-400" },
};

export function PhaseIndicator({ phase }: Props) {
  if (!phase) return null;

  const config = PHASE_CONFIG[phase];
  if (!config) return null;

  return (
    <div data-testid="phase-indicator" className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/15">
      <span
        data-testid="phase-dot"
        className={`w-2 h-2 rounded-full ${config.dotClass}`}
      />
      <span className="text-white/90 text-[11px] font-medium">
        {config.label}
      </span>
    </div>
  );
}
