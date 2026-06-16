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
    navigator.clipboard.writeText(value).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      },
      () => {
        setCopied(false);
      }
    );
    setTimeout(() => setShowPopover(false), 2000);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") setShowPopover(false);
  };

  return (
    <div className="relative flex flex-col gap-0.5 min-w-0 shrink">
      <span className="text-[9px] font-medium tracking-wide text-kubernaut-teal-200 uppercase whitespace-nowrap">
        {label}
      </span>
      <button
        type="button"
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        className="text-xs text-white truncate text-left hover:text-kubernaut-teal-200 transition-colors cursor-pointer max-w-[180px]"
        aria-label={`${label}: ${value} — click to copy`}
        title="Click to copy"
      >
        {value}
      </button>
      {showPopover && (
        <div
          role="tooltip"
          aria-live="polite"
          className="absolute top-full left-0 mt-1 z-50 px-2 py-1 rounded bg-white text-text-primary text-[11px] shadow-lg border border-border max-w-[280px] break-words"
        >
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

  // Strip redundant namespace from resource if already shown in the namespace field
  // e.g. "Deployment/worker (demo-storefront)" → "Deployment/worker" when namespace is "demo-storefront"
  let displayResource = resource;
  if (resource && namespace) {
    displayResource = resource.replace(` (${namespace})`, "").replace(`(${namespace})`, "");
  }

  return (
    <div
      data-testid="investigation-context"
      className="bg-kubernaut-teal-900 px-4 sm:px-6 py-2 h-10 flex items-center gap-3 border-b border-kubernaut-teal-700 overflow-hidden"
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
