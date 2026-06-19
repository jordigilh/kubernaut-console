import { useState, useEffect, useRef } from "react";

interface Props {
  alertName?: string;
  namespace?: string;
  resource?: string;
  cluster?: string;
  rrId?: string;
  phase?: "investigation" | "decision" | "remediation" | "verifying" | "failed" | "timed_out" | "complete";
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

function Field({ label, value }: { label: string; value: string }) {
  const [showPopover, setShowPopover] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleClick = () => {
    setShowPopover(true);
    navigator.clipboard.writeText(value).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      },
      () => { setCopied(false); }
    );
    setTimeout(() => setShowPopover(false), 2000);
  };

  return (
    <div className="kn-context-field">
      <span className="kn-context-label">{label}</span>
      <button
        type="button"
        onClick={handleClick}
        className="kn-context-value"
        aria-label={`${label}: ${value} — click to copy`}
        title="Click to copy"
      >
        {value}
      </button>
      {showPopover && (
        <div
          role="tooltip"
          aria-live="polite"
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            marginTop: "0.25rem",
            zIndex: 50,
            padding: "0.25rem 0.5rem",
            borderRadius: "0.25rem",
            background: "#fff",
            color: "var(--kn-text-primary)",
            fontSize: "0.6875rem",
            boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
            border: "1px solid var(--kn-border)",
            maxWidth: "17.5rem",
            wordBreak: "break-word",
          }}
        >
          {copied ? "Copied!" : value}
        </div>
      )}
    </div>
  );
}

function Separator() {
  return <div className="kn-context-separator" aria-hidden="true" />;
}

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

export function InvestigationContext({ alertName, namespace, resource, cluster, rrId, phase, phaseMetadata, isActive = true }: Props) {
  const phaseConfig = phase ? PHASE_CONFIG[phase] : { label: "Ready", dotColor: "var(--kn-green-400)", pulse: false };
  const elapsedStr = usePhaseTimer(phase, isActive);
  const subStatus = formatSubStatus(phase, phaseMetadata, elapsedStr);

  let displayResource = resource;
  if (resource && namespace) {
    const escaped = namespace.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    displayResource = resource
      .replace(` (${namespace})`, "")
      .replace(`(${namespace})`, "")
      .replace(new RegExp(`\\s+in\\s+${escaped}$`), "")
      .replace(new RegExp(`\\s+in\\s+${escaped}[\\s,.]`), " ");
  }

  return (
    <div
      data-testid="investigation-context"
      className="kn-context-bar"
      role="region"
      aria-label="Investigation context"
    >
      {rrId && (
        <>
          <Field label="Remediation ID" value={rrId} />
          <Separator />
        </>
      )}

      {alertName && alertName !== "unknown" && (
        <>
          <Field label="Alert" value={alertName} />
          <Separator />
        </>
      )}

      {namespace && (
        <>
          <Field label="Namespace" value={namespace} />
          <Separator />
        </>
      )}

      {displayResource && (
        <>
          <Field label="Resource" value={displayResource} />
        </>
      )}

      {cluster && (
        <>
          <Field label="Cluster" value={cluster} />
        </>
      )}

      {phase && (
        <div className="kn-context-phase-group">
          <Separator />
          <div className="kn-context-phase" role="status" aria-live="polite" data-testid="phase-indicator">
            <span
              data-testid="phase-dot"
              className={`kn-phase-dot ${phaseConfig.pulse ? "kn-pulse" : ""}`}
              style={{ background: phaseConfig.dotColor }}
              aria-hidden="true"
            />
            <span className="kn-phase-label">{phaseConfig.label}</span>
            {subStatus && <span className="kn-phase-substatus" data-testid="phase-substatus"> · {subStatus}</span>}
          </div>
        </div>
      )}
    </div>
  );
}
