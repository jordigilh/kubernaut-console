import { useState, useEffect, useRef } from "react";

export interface AlertInfo {
  severity: "critical" | "warning" | "info";
  summary: string;
  namespace?: string;
  pod?: string;
  active: boolean;
}

const POLL_INTERVAL = 15000;

export function useAlerts(baseUrl?: string) {
  const [alert, setAlert] = useState<AlertInfo | null>(null);
  const baseUrlRef = useRef(baseUrl);

  useEffect(() => {
    baseUrlRef.current = baseUrl;
  }, [baseUrl]);

  useEffect(() => {
    let active = true;

    async function poll() {
      try {
        const url = `${baseUrlRef.current || ""}/a2a/alerts`;
        const resp = await fetch(url, { credentials: "include" });
        if (!resp.ok || !active) return;
        const data = await resp.json();
        if (!active) return;
        if (data.alerts && data.alerts.length > 0) {
          const top = data.alerts[0];
          setAlert({
            severity: top.severity || "critical",
            summary: top.summary || top.labels?.alertname || "Unknown alert",
            namespace: top.labels?.namespace,
            pod: top.labels?.pod,
            active: true,
          });
        } else {
          setAlert(null);
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

  return alert;
}
