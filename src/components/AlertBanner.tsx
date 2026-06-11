import type { AlertInfo } from "../hooks/useAlerts";

interface Props {
  alert: AlertInfo | null;
}

export function AlertBanner({ alert }: Props) {
  if (!alert || !alert.active) return null;

  const severityClasses = {
    critical: "bg-kubernaut-red-50 border-red-200",
    warning: "bg-amber-50 border-amber-200",
    info: "bg-blue-50 border-blue-200",
  };

  const iconClasses = {
    critical: "bg-[#EE0000]",
    warning: "bg-amber-500",
    info: "bg-blue-500",
  };

  return (
    <div
      role="alert"
      aria-live="polite"
      className={`mx-4 mt-3 px-4 py-2.5 rounded-lg border flex items-start gap-3 animate-fade-in ${severityClasses[alert.severity]}`}
    >
      <div className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full ${iconClasses[alert.severity]} mt-0.5`}>
        <span className="text-white text-[9px] font-bold">!</span>
      </div>
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-kubernaut-red-900">{alert.summary}</span>
          <span className="text-[11px] text-text-muted">[{alert.severity}]</span>
        </div>
        <p className="text-[11px] text-red-800 mt-0.5">
          {alert.pod && `${alert.pod} `}
          {alert.namespace && `in namespace ${alert.namespace}`}
          {alert.detail && ` (${alert.detail})`}
        </p>
      </div>
    </div>
  );
}
