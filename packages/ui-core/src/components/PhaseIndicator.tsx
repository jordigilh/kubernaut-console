import { useState, useEffect, useRef } from "react";

export type Phase = "investigation" | "decision" | "remediation" | "verifying" | "failed" | "timed_out" | "complete";

interface Props {
  phase?: Phase;
  phaseMetadata?: Record<string, unknown>;
  isActive?: boolean;
}

const PHASE_CONFIG: Record<string, { label: string; dotColor: string; pulse: boolean }> = {
  investigation: { label: "Investigating", dotColor: "var(--kn-green-400)", pulse: true },
  decision: { label: "Decision pending", dotColor: "#fbbf24", pulse: false },
  remediation: { label: "Executing", dotColor: "var(--kn-teal-400)", pulse: true },
  verifying: { label: "Verifying", dotColor: "var(--kn-teal-300)", pulse: true },
  failed: { label: "Failed", dotColor: "var(--kn-red-400)", pulse: false },
  timed_out: { label: "Timed Out", dotColor: "var(--kn-red-400)", pulse: false },
  complete: { label: "Complete", dotColor: "var(--kn-green-400)", pulse: false },
};

function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function usePhaseTimer(phase: string | undefined, isActive: boolean): string | undefined {
  const phaseStartRef = useRef<{ phase: string; time: number } | null>(null);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!phase || phase === "complete" || phase === "failed" || phase === "timed_out") {
      phaseStartRef.current = null;
      setElapsed(0);
      return;
    }

    if (!phaseStartRef.current || phaseStartRef.current.phase !== phase) {
      phaseStartRef.current = { phase, time: Date.now() };
      setElapsed(0);
    }

    if (!isActive) return;

    const id = setInterval(() => {
      if (phaseStartRef.current) {
        setElapsed(Math.floor((Date.now() - phaseStartRef.current.time) / 1000));
      }
    }, 1000);

    return () => clearInterval(id);
  }, [phase, isActive]);

  if (!phase || phase === "complete" || phase === "failed" || phase === "timed_out") return undefined;
  if (elapsed === 0) return undefined;
  return formatElapsed(elapsed);
}

function parseDuration(deadline: string, startedAt: string | undefined, now: number): { elapsed: number; total: number } | undefined {
  const end = new Date(deadline).getTime();
  const start = startedAt ? new Date(startedAt).getTime() : undefined;
  if (isNaN(end)) return undefined;
  const total = start && !isNaN(start) ? Math.round((end - start) / 1000) : undefined;
  if (!total || total <= 0) return undefined;
  const elapsed = Math.max(0, Math.round((now - (start ?? now)) / 1000));
  return { elapsed: Math.min(elapsed, total), total };
}

function formatSubStatus(phase: string | undefined, metadata: Record<string, unknown> | undefined, elapsedStr: string | undefined): string | undefined {
  if (metadata && phase === "verifying") {
    const eaPhase = metadata.ea_phase as string | undefined;
    if (eaPhase) {
      const deadline = metadata.stabilization_deadline as string | undefined;
      const startedAt = metadata.started_at as string | undefined;
      if (deadline) {
        const dur = parseDuration(deadline, startedAt, Date.now());
        if (dur) {
          return `${eaPhase} · ${formatElapsed(dur.elapsed)} / ${formatElapsed(dur.total)}`;
        }
      }
      return elapsedStr ? `${eaPhase} · ${elapsedStr}` : eaPhase;
    }
  }
  return elapsedStr;
}

export function PhaseIndicator({ phase, phaseMetadata, isActive = true }: Props) {
  const phaseConfig = phase ? PHASE_CONFIG[phase] : undefined;
  const elapsedStr = usePhaseTimer(phase, isActive);
  const subStatus = formatSubStatus(phase, phaseMetadata, elapsedStr);

  if (!phase || !phaseConfig) return null;

  return (
    <div className="kn-phase-indicator" role="status" aria-live="polite" data-testid="phase-indicator">
      <span
        data-testid="phase-dot"
        className={`kn-phase-dot ${phaseConfig.pulse ? "kn-pulse" : ""}`}
        style={{ background: phaseConfig.dotColor }}
        aria-hidden="true"
      />
      <span className="kn-phase-label">{phaseConfig.label}</span>
      {subStatus && <span className="kn-phase-substatus" data-testid="phase-substatus"> · {subStatus}</span>}
    </div>
  );
}
