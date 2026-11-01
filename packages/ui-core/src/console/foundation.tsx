import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { ApprovalsPage } from "../pages/ApprovalsPage";
import { ApprovalReviewPage } from "../pages/ApprovalReviewPage";
import { createApprovalFixtureAdapter, FIXTURE_REVIEWER } from "../lib/approval-review";
import { navigationFor, type NavigationId, type NavigationItem, type Topology } from "./registry";

export type ReadStatus = "loading" | "ready" | "empty" | "partial" | "stale" | "unavailable" | "forbidden" | "missing";
export interface ReadProvenance { source?: string; observedAt?: string; }
export interface ConsoleReadState { status: ReadStatus; provenance?: ReadProvenance; message?: string; }

/** Callers supply only safe, already-authorized data. No request or retry is automatic. */
export function ReadStatePanel({ state, label, onRetry, children }: { state: ConsoleReadState; label: string; onRetry?: () => void; children?: ReactNode }) {
  const hasData = state.status === "ready" || state.status === "partial" || state.status === "stale";
  const text: Record<ReadStatus, string> = { loading: "Loading", ready: "Ready", empty: "No results", partial: "Partial", stale: "Stale", unavailable: "Unavailable", forbidden: "Access denied", missing: "Missing or out of scope" };
  return <section className="kn-foundation-read" data-read-state={state.status}>
    {state.status !== "ready" && <div role={state.status === "unavailable" || state.status === "forbidden" || state.status === "missing" ? "alert" : "status"}><strong>{label}: {text[state.status]}</strong>{state.message && <p>{state.message}</p>}</div>}
    {state.provenance && hasData && <p>Source: {state.provenance.source || "Unknown"} · Observed: {state.provenance.observedAt || "Unknown"}</p>}
    {hasData && children}
    {state.status === "unavailable" && onRetry && <button type="button" onClick={onRetry}>Retry {label}</button>}
  </section>;
}

export interface ConsoleShellProps {
  access: readonly NavigationId[];
  topology: Topology;
  current: NavigationId;
  /** Host-supplied URLs; no production URL scheme is assumed. */
  hrefs: Partial<Record<NavigationId, string>>;
  theme?: "light" | "dark";
  children: ReactNode;
}

export function ConsoleShell({ access, topology, current, hrefs, theme = "light", children }: ConsoleShellProps) {
  const [open, setOpen] = useState(false);
  const more = useRef<HTMLButtonElement>(null);
  const nav = useRef<HTMLElement>(null);
  const id = useId();
  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => { if (!nav.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, [open]);
  const items = navigationFor(access, topology);
  const secondary = items.filter((item) => item.group !== "Operate");
  function renderItem(item: NavigationItem) {
    const href = item.availability === "available" ? hrefs[item.id] : undefined;
    return href ? <a key={item.id} href={href} aria-current={current === item.id ? "page" : undefined} onClick={(event) => { if (!event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey && event.button === 0) setOpen(false); }}>{item.label}</a> : <span key={item.id} className="kn-foundation-deferred">{item.label}<small>{item.availability === "topology-unknown" ? "Topology unavailable" : "Deferred"}</small></span>;
  }
  return <div className="kn-foundation" data-theme={theme}>
    <header className="kn-foundation-header"><img src="/logo.svg" alt="Kubernaut" /><strong>Kubernaut</strong></header>
    <div className="kn-foundation-layout">
      <nav ref={nav} aria-label="Console navigation" className="kn-foundation-nav" onKeyDown={(event) => { if (event.key === "Escape" && open) { event.preventDefault(); setOpen(false); more.current?.focus(); } }} onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}>
        <div className="kn-foundation-priority"><h2>Operate</h2>{items.filter((item) => item.group === "Operate").map(renderItem)}</div>
        {secondary.length > 0 && <><button ref={more} type="button" className="kn-foundation-more" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}>More</button>
          <div id={id} className="kn-foundation-secondary" data-open={open}>{(["Explore", "Manage"] as const).map((group) => { const groupItems = secondary.filter((item) => item.group === group); return groupItems.length ? <section key={group}><h2>{group}</h2>{groupItems.map(renderItem)}</section> : null; })}</div></>}
      </nav>
      <main className="kn-foundation-main">{children}</main>
    </div>
  </div>;
}

/** Explicit fixture composition; no live adapter can be supplied. */
export function FixtureApprovalWorkspace({ initialRequestId }: { initialRequestId?: string }) {
  const adapter = useMemo(() => createApprovalFixtureAdapter(), []);
  const [requestId, setRequestId] = useState<string | null>(initialRequestId ?? null);
  const [refresh, setRefresh] = useState(0);
  const back = () => { setRequestId(null); setRefresh((value) => value + 1); };
  return <ConsoleShell access={["approvals", "investigations", "overview", "workflows", "resources", "clusters", "policies", "administration"]} topology="unknown" current="approvals" hrefs={{}}>
    <div className="kn-approval-console" data-fixture="true"><div role="note" className="kn-approval-fixture-banner">Fixture preview — no live decision is submitted</div>{requestId ? <ApprovalReviewPage adapter={adapter} reviewer={FIXTURE_REVIEWER} requestId={requestId} onBack={back} /> : <ApprovalsPage adapter={adapter} onOpenRequest={setRequestId} refreshToken={refresh} />}</div>
  </ConsoleShell>;
}
