import type { AlertInfo } from "../hooks/useAlerts";

interface Props {
  alert: AlertInfo | null;
}

export function AlertBanner({ alert }: Props) {
  if (!alert || !alert.active) return null;

  const severityClasses = {
    critical: "bg-kubernaut-red-50 text-kubernaut-red-900",
    warning: "bg-amber-50 text-amber-900",
    info: "bg-blue-50 text-blue-900",
  };

  const dotClasses = {
    critical: "bg-kubernaut-red-600",
    warning: "bg-amber-500",
    info: "bg-blue-500",
  };

  return (
    <div
      role="alert"
      aria-live="polite"
      className={`mx-4 mt-3 px-4 py-2 rounded-md flex items-center gap-2 animate-fade-in ${severityClasses[alert.severity]}`}
    >
      <div className={`w-3 h-3 rounded-full ${dotClasses[alert.severity]} animate-pulse`} />
      <span className="text-xs font-semibold uppercase">{alert.severity}</span>
      <span className="text-xs">
        {alert.summary}
        {alert.namespace && ` in namespace ${alert.namespace}`}
      </span>
    </div>
  );
}
