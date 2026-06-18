import { useState } from "react";

interface Props {
  alertName?: string;
  namespace?: string;
  resource?: string;
  cluster?: string;
  rrId?: string;
  phase?: "investigation" | "decision" | "remediation" | "verifying" | "failed" | "timed_out" | "complete";
  phaseMetadata?: Record<string, unknown>;
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

function formatSubStatus(phase: string | undefined, metadata: Record<string, unknown> | undefined): string | undefined {
  if (!metadata || phase !== "verifying") return undefined;
  const eaPhase = metadata.ea_phase as string | undefined;
  if (!eaPhase) return undefined;
  const deadline = metadata.stabilization_deadline as string | undefined;
  if (deadline) {
    const remaining = Math.max(0, Math.round((new Date(deadline).getTime() - Date.now()) / 1000));
    if (remaining > 0) return `${eaPhase} (${remaining}s)`;
  }
  return eaPhase;
}

export function InvestigationContext({ alertName, namespace, resource, cluster, rrId, phase, phaseMetadata }: Props) {
  const phaseConfig = phase ? PHASE_CONFIG[phase] : { label: "Ready", dotColor: "var(--kn-green-400)", pulse: false };
  const subStatus = formatSubStatus(phase, phaseMetadata);

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
          <Separator />
        </>
      )}

      {cluster && (
        <>
          <Field label="Cluster" value={cluster} />
          <Separator />
        </>
      )}

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
  );
}
