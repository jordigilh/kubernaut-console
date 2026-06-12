interface Props {
  alertName?: string;
  namespace?: string;
  pod?: string;
  cluster?: string;
  rrId?: string;
}

export function InvestigationContext({ alertName, namespace, pod, cluster, rrId }: Props) {
  const hasContent = alertName || namespace || pod || cluster || rrId;
  if (!hasContent) return null;

  return (
    <div
      data-testid="investigation-context"
      className="mx-4 mt-2 px-3 py-1.5 rounded-md bg-gray-50 border border-gray-100 flex items-center gap-3 flex-wrap text-[11px] text-text-muted"
    >
      {rrId && (
        <span className="font-mono">
          <span className="text-text-dim">RR:</span> {rrId}
        </span>
      )}
      {cluster && (
        <span className="font-mono">
          <span className="text-text-dim">Cluster:</span> {cluster.slice(0, 8)}
        </span>
      )}
      {alertName && (
        <span>
          <span className="text-text-dim">Alert:</span> {alertName}
        </span>
      )}
      {namespace && (
        <span>
          <span className="text-text-dim">NS:</span> {namespace}
        </span>
      )}
      {pod && (
        <span className="font-mono truncate max-w-[200px]">
          <span className="text-text-dim">Pod:</span> {pod}
        </span>
      )}
    </div>
  );
}
