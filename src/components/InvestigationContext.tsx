import { useState } from "react";

interface Props {
  alertName?: string;
  namespace?: string;
  resource?: string;
  cluster?: string;
  rrId?: string;
  phase?: "investigation" | "decision" | "remediation" | "verifying" | "failed" | "timed_out" | "complete";
}

const PHASE_CONFIG: Record<string, { label: string; dotClass: string }> = {
  investigation: { label: "Investigating", dotClass: "bg-kubernaut-green-400 animate-pulse" },
  decision: { label: "Decision pending", dotClass: "bg-amber-400" },
  remediation: { label: "Executing", dotClass: "bg-kubernaut-teal-400 animate-pulse" },
  verifying: { label: "Verifying", dotClass: "bg-kubernaut-teal-300 animate-pulse" },
  failed: { label: "Failed", dotClass: "bg-kubernaut-red-400" },
  timed_out: { label: "Timed Out", dotClass: "bg-kubernaut-red-400" },
  complete: { label: "Complete", dotClass: "bg-kubernaut-green-400" },
};

function Field({ label, value }: { label: string; value: string }) {
  const [showPopover, setShowPopover] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleClick = () => {
    setShowPopover(true);
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
    setTimeout(() => setShowPopover(false), 2000);
  };

  return (
    <div className="relative flex flex-col gap-0.5 min-w-0 shrink">
      <span className="text-[9px] font-medium tracking-wide text-kubernaut-teal-200 uppercase whitespace-nowrap">
        {label}
      </span>
      <button
        type="button"
        onClick={handleClick}
        className="text-xs text-white truncate break-words text-left hover:text-kubernaut-teal-200 transition-colors cursor-pointer max-w-[180px]"
        title="Click to copy"
      >
        {value}
      </button>
      {showPopover && (
        <div className="absolute top-full left-0 mt-1 z-50 px-2 py-1 rounded bg-white text-text-primary text-[11px] shadow-lg border border-border whitespace-nowrap">
          {copied ? "Copied!" : value}
        </div>
      )}
    </div>
  );
}

function Separator() {
  return <div className="w-px h-6 bg-kubernaut-teal-600/30 self-center shrink-0" aria-hidden="true" />;
}

export function InvestigationContext({ alertName, namespace, resource, cluster, rrId, phase }: Props) {
  const phaseConfig = phase ? PHASE_CONFIG[phase] : { label: "Ready", dotClass: "bg-kubernaut-green-400" };

  return (
    <div
      data-testid="investigation-context"
      className="bg-kubernaut-teal-900 px-4 sm:px-6 py-2 h-10 flex items-center gap-3 border-b border-kubernaut-teal-700 overflow-hidden"
      role="region"
      aria-label="Investigation context"
    >
      {rrId && (
        <>
          <div className="flex flex-col gap-0.5 min-w-0 shrink-0" title={rrId}>
            <span className="text-[9px] font-medium tracking-wide text-kubernaut-teal-200 uppercase">
              Remediation ID
            </span>
            <span className="text-xs font-semibold text-white truncate max-w-[180px]">
              {rrId}
            </span>
          </div>
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

      {resource && (
        <>
          <Field label="Resource" value={resource} />
          <Separator />
        </>
      )}

      {cluster && (
        <>
          <Field label="Cluster" value={cluster} />
          <Separator />
        </>
      )}

      <div className="flex items-center gap-1.5 ml-auto shrink-0" role="status" aria-live="polite" data-testid="phase-indicator">
        <span
          data-testid="phase-dot"
          className={`w-2 h-2 rounded-full ${phaseConfig.dotClass}`}
          aria-hidden="true"
        />
        <span className="text-xs font-medium text-white">
          {phaseConfig.label}
        </span>
      </div>
    </div>
  );
}
