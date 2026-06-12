import { useState, useEffect, useRef } from "react";

export interface AlertInfo {
  severity: "critical" | "warning" | "info";
  summary: string;
  namespace?: string;
  pod?: string;
  detail?: string;
  active: boolean;
}

const POLL_INTERVAL = 15000;
const USE_MOCK = import.meta.env.VITE_MOCK_A2A === "true";

const MOCK_ALERTS: AlertInfo[] = [
  {
    severity: "critical",
    summary: "KubePodCrashLooping",
    namespace: "demo-webui",
    pod: "web-frontend-c8dc85956-qm7hq",
    detail: "4 restarts, CrashLoopBackOff",
    active: true,
  },
];

export function useAlerts(baseUrl?: string) {
  const [alerts, setAlerts] = useState<AlertInfo[]>(USE_MOCK ? MOCK_ALERTS : []);
  const baseUrlRef = useRef(baseUrl);

  useEffect(() => {
    baseUrlRef.current = baseUrl;
  }, [baseUrl]);

  useEffect(() => {
    if (USE_MOCK) return;

    let active = true;

    async function poll() {
      try {
        const url = `${baseUrlRef.current || ""}/a2a/alerts`;
        const resp = await fetch(url, { credentials: "include" });
        if (!resp.ok || !active) return;
        const data = await resp.json();
        if (!active) return;
        if (data.alerts && data.alerts.length > 0) {
          setAlerts(
            data.alerts.map((a: Record<string, unknown>) => ({
              severity: (a.severity as string) || "critical",
              summary: (a.summary as string) || (a.labels as Record<string, string>)?.alertname || "Unknown alert",
              namespace: (a.labels as Record<string, string>)?.namespace,
              pod: (a.labels as Record<string, string>)?.pod,
              active: true,
            }))
          );
        } else {
          setAlerts([]);
        }
      } catch {
        // Silently ignore — alert banner is non-critical
      }
    }

    poll();
    const id = setInterval(poll, POLL_INTERVAL);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, []);

  return alerts;
}
