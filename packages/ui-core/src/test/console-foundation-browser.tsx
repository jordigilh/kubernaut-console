// Test-only Vite entry. This is not imported by the standalone application.
import { createRoot } from "react-dom/client";
import { useState } from "react";
import { ConsoleShell, FixtureApprovalWorkspace, ReadStatePanel, type ReadStatus } from "../console/foundation";
import type { Topology } from "../console/registry";
import "../console/foundation.css";
import "../styles/approval-console.css";

const params = new URLSearchParams(location.search);
const topologyParam = params.get("topology");
const topology: Topology = topologyParam === "fleet" || topologyParam === "local" ? topologyParam : "unknown";
const theme = params.get("theme") === "dark" ? "dark" : "light";
const current = params.get("current") === "overview" ? "overview" : "approvals";

export function ReadStatesFixture() {
  const [status, setStatus] = useState<ReadStatus>("ready");
  const [retries, setRetries] = useState(0);
  const statuses: ReadStatus[] = ["loading", "ready", "empty", "partial", "stale", "unavailable", "forbidden", "missing"];
  return <main>
    <h1>Read state fixture</h1>
    <label>Read state<select value={status} onChange={(event) => setStatus(event.target.value as ReadStatus)}>{statuses.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
    <label>Unrelated draft<input /></label>
    <p>Retry count: {retries}</p>
    <ReadStatePanel state={{ status, provenance: { source: "Fixture source", observedAt: "2026-01-01" } }} label="Records" onRetry={() => setRetries((count) => count + 1)}>
      <p>Authorized fixture data</p>
    </ReadStatePanel>
  </main>;
}

createRoot(document.getElementById("root")!).render(
  params.get("view") === "read-states" ? <ReadStatesFixture /> : params.get("view") === "approvals" ? <FixtureApprovalWorkspace /> : (
    <ConsoleShell
      access={["approvals", "investigations", "overview", "workflows", "resources", "clusters", "policies", "administration"]}
      topology={topology}
      current={current}
      hrefs={{ approvals: "#approvals" }}
      theme={theme}
    >
      <h1>Fixture screen</h1>
      <button type="button">Outside navigation</button>
    </ConsoleShell>
  ),
);
