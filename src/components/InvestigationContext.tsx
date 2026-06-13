interface Props {
  alertName?: string;
  namespace?: string;
  resource?: string;
  cluster?: string;
  rrId?: string;
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

function truncateRrId(id: string): string {
  return id;
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 min-w-0">
      <span className="text-[9px] font-medium tracking-wide text-teal-300 uppercase">
        {label}
      </span>
      <span className="text-[11px] text-white truncate">{value}</span>
    </div>
  );
}

function Separator() {
  return <div className="w-px h-6 bg-teal-400/20 self-center" />;
}

export function InvestigationContext({ alertName, namespace, resource, cluster, rrId, phase }: Props) {
  const hasContent = alertName || namespace || resource || cluster || rrId || phase;
  if (!hasContent) return null;

  const phaseConfig = phase ? PHASE_CONFIG[phase] : null;

  return (
    <div
      data-testid="investigation-context"
      className="bg-teal-950 px-4 sm:px-6 py-2 flex items-center gap-4 border-b border-teal-800"
    >
      {rrId && (
        <>
          <div className="flex flex-col gap-0.5 min-w-0" title={rrId}>
            <span className="text-[9px] font-medium tracking-wide text-teal-300 uppercase">
              Remediation ID
            </span>
            <span className="text-[11px] font-semibold text-white truncate">
              {truncateRrId(rrId)}
            </span>
          </div>
          <Separator />
        </>
      )}

      {alertName && (
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

      {phaseConfig && (
        <div className="flex flex-col gap-0.5 ml-auto">
          <span className="text-[9px] font-medium tracking-wide text-teal-300 uppercase">
            Status
          </span>
          <div className="flex items-center gap-1.5" data-testid="phase-indicator">
            <span
              data-testid="phase-dot"
              className={`w-2 h-2 rounded-full ${phaseConfig.dotClass}`}
            />
            <span className="text-[11px] font-medium text-white">
              {phaseConfig.label}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
