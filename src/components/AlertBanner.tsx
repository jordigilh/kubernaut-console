import type { AlertInfo } from "../hooks/useAlerts";

interface Props {
  alerts: AlertInfo[];
  onSelect?: (alert: AlertInfo) => void;
}

const SEVERITY_BG: Record<string, string> = {
  critical: "bg-kubernaut-red-50 border-red-200",
  warning: "bg-amber-50 border-amber-200",
  info: "bg-blue-50 border-blue-200",
};

const SEVERITY_ICON: Record<string, string> = {
  critical: "bg-[#EE0000]",
  warning: "bg-amber-500",
  info: "bg-blue-500",
};

function AlertItem({ alert, onSelect }: { alert: AlertInfo; onSelect?: (a: AlertInfo) => void }) {
  return (
    <button
      type="button"
      role="alert"
      aria-live="polite"
      onClick={() => onSelect?.(alert)}
      className={`w-full text-left px-4 py-2.5 rounded-lg border flex items-start gap-3 animate-fade-in hover:ring-1 hover:ring-kubernaut-teal-600 transition-all cursor-pointer ${SEVERITY_BG[alert.severity] ?? SEVERITY_BG.info}`}
    >
      <div className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full ${SEVERITY_ICON[alert.severity] ?? SEVERITY_ICON.info} mt-0.5`}>
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
    </button>
  );
}

export function AlertBanner({ alerts, onSelect }: Props) {
  const activeAlerts = alerts.filter(a => a.active);
  if (activeAlerts.length === 0) return null;

  return (
    <div className="mx-4 mt-3 space-y-2">
      {activeAlerts.length > 1 && (
        <p className="text-[11px] text-text-muted font-medium px-1">
          {activeAlerts.length} active alerts — select one to investigate:
        </p>
      )}
      {activeAlerts.map((alert, idx) => (
        <AlertItem key={`${alert.summary}-${idx}`} alert={alert} onSelect={onSelect} />
      ))}
    </div>
  );
}
