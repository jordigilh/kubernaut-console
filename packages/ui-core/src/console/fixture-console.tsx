import { useEffect, useRef, useState } from "react";
import { ConsoleShell, FixtureApprovalWorkspace } from "./foundation";
import { FixtureInvestigations } from "./fixture-investigations";
import { FixtureWorkflows } from "./fixture-workflows";
import { FixtureScope } from "./fixture-scope";
import { FixtureGovernance } from "./fixture-governance";
import type { NavigationId, Topology } from "./registry";

const sections: NavigationId[] = ["approvals", "investigations", "overview", "workflows", "resources", "clusters", "policies", "administration"];
const hrefs = Object.fromEntries(sections.map((section) => [section, `#fixture/${section}`])) as Record<NavigationId, string>;

function sectionFromHash(hash: string): NavigationId | null {
  if (!hash || hash === "#") return "approvals";
  return sections.find((section) => hrefs[section] === hash) ?? null;
}

/** Isolated synthetic browser preview; hashes are not production routes or access controls. */
export function FixtureConsole({ topology = "fleet", theme = "light" }: { topology?: Topology; theme?: "light" | "dark" }) {
  const [hash, setHash] = useState(() => window.location.hash);
  const [previewTheme, setPreviewTheme] = useState(theme);
  const routeContent = useRef<HTMLDivElement>(null);
  const previousHash = useRef(hash);
  useEffect(() => {
    const onHashChange = () => setHash(window.location.hash);
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);
  useEffect(() => {
    if (previousHash.current !== hash) routeContent.current?.focus();
    previousHash.current = hash;
  }, [hash]);
  const section = sectionFromHash(hash);
  const unavailableCluster = section === "clusters" && topology !== "fleet";
  let content;
  if (!section) content = <section role="alert"><h1>Fixture route not found</h1><p>No synthetic screen matches this address.</p></section>;
  else if (unavailableCluster) content = <section role="alert"><h1>Clusters unavailable</h1><p>Clusters is only available in the fleet fixture.</p></section>;
  else switch (section) {
    case "approvals": content = <FixtureApprovalWorkspace embedded />; break;
    case "investigations": content = <FixtureInvestigations embedded />; break;
    case "workflows": content = <FixtureWorkflows embedded />; break;
    case "overview": content = <FixtureScope embedded topology={topology} initialScreen={{ screen: "overview" }} />; break;
    case "resources": content = <FixtureScope embedded topology={topology} initialScreen={{ screen: "resources.list" }} />; break;
    case "clusters": content = <FixtureScope embedded topology={topology} initialScreen={{ screen: "clusters.list" }} />; break;
    case "policies": content = <FixtureGovernance embedded theme={previewTheme} onThemeChange={setPreviewTheme} initialScreen={{ screen: "governance.policies" }} />; break;
    case "administration": content = <FixtureGovernance embedded theme={previewTheme} onThemeChange={setPreviewTheme} initialScreen={{ screen: "administration" }} />; break;
  }
  return <ConsoleShell access={sections} topology={topology} current={section ?? undefined} hrefs={hrefs} theme={previewTheme} fixtureNavigation>
    <p role="note">Fixture-only preview — synthetic data; not connected to the standalone application or live services.</p>
    <div ref={routeContent} tabIndex={-1} aria-label="Fixture section">{content}</div>
  </ConsoleShell>;
}
