import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import consoleLogo from "../assets/console-logo.svg";
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
  current?: NavigationId;
  /** Host-supplied URLs; no production URL scheme is assumed. */
  hrefs: Partial<Record<NavigationId, string>>;
  theme?: "light" | "dark";
  /** Only for the isolated synthetic preview; never enables production routes. */
  fixtureNavigation?: boolean;
  /** Production routing (#169): link every in-scope section to its real route. */
  productionLinks?: boolean;
  /** Host SPA navigation for ordinary unmodified link clicks; undefined keeps native anchor behavior. */
  onNavigate?: (href: string) => void;
  /** Optional host-supplied controls rendered in the shell header. */
  headerActions?: ReactNode;
  children: ReactNode;
}

export function ConsoleShell({ access, topology, current, hrefs, theme = "light", fixtureNavigation = false, productionLinks = false, onNavigate, headerActions, children }: ConsoleShellProps) {
  const [open, setOpen] = useState(false);
  const more = useRef<HTMLButtonElement>(null);
  const moreWasFocused = useRef(false);
  const nav = useRef<HTMLElement>(null);
  const main = useRef<HTMLElement>(null);
  const id = useId();
  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => { if (!nav.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, [open]);
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const breakpoint = window.matchMedia("(max-width: 699px)");
    const onPointerDown = (event: PointerEvent) => {
      if (event.target !== more.current) moreWasFocused.current = false;
    };
    const onFocusIn = (event: FocusEvent) => {
      moreWasFocused.current = event.target === more.current;
    };
    const onChange = (event: MediaQueryListEvent) => {
      const focused = document.activeElement;
      if (event.matches) {
        if (focused instanceof HTMLElement && focused.closest(".kn-foundation-secondary") && nav.current?.contains(focused)) setOpen(true);
      } else {
        setOpen(false);
        if (focused === more.current || (focused === document.body && moreWasFocused.current && document.hasFocus())) {
          const destination = nav.current?.querySelector<HTMLAnchorElement>('a[aria-current="page"]')
            ?? nav.current?.querySelector<HTMLAnchorElement>("a[href]")
            ?? main.current;
          destination?.focus();
        }
        moreWasFocused.current = false;
      }
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("focusin", onFocusIn, true);
    breakpoint.addEventListener("change", onChange);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("focusin", onFocusIn, true);
      breakpoint.removeEventListener("change", onChange);
    };
  }, []);
  const items = navigationFor(access, topology, { productionLinks });
  const secondary = items.filter((item) => item.group !== "Operate");
  const currentSecondary = secondary.find((item) => item.id === current);
  function renderItem(item: NavigationItem) {
    const href = item.availability === "available" || (fixtureNavigation && item.availability === "deferred") ? hrefs[item.id] : undefined;
    return href ? <a key={item.id} href={href} aria-current={current === item.id ? "page" : undefined} onClick={(event) => { if (!event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey && event.button === 0) { setOpen(false); if (onNavigate) { event.preventDefault(); onNavigate(href); } } }}>{item.label}</a> : <span key={item.id} className="kn-foundation-deferred">{item.label}<small>{item.availability === "topology-unknown" ? "Topology unavailable" : "Deferred"}</small></span>;
  }
  return <div className="kn-foundation" data-theme={theme}>
    <header className="kn-foundation-header"><img src={consoleLogo} alt="Kubernaut" /><strong>Kubernaut</strong>{headerActions && <div className="kn-foundation-header-actions">{headerActions}</div>}</header>
    <div className="kn-foundation-layout">
      <nav ref={nav} aria-label="Console navigation" className="kn-foundation-nav" onKeyDown={(event) => { if (event.key === "Escape" && open) { event.preventDefault(); setOpen(false); more.current?.focus(); } }} onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}>
        <div className="kn-foundation-priority"><h2>Operate</h2>{items.filter((item) => item.group === "Operate").map(renderItem)}</div>
        {secondary.length > 0 && <><button ref={more} type="button" className="kn-foundation-more" aria-expanded={open} aria-controls={id} aria-label={currentSecondary ? `More, current section: ${currentSecondary.label}` : undefined} title={currentSecondary ? `Current section: ${currentSecondary.label}` : undefined} data-current={Boolean(currentSecondary)} onClick={() => setOpen(!open)}>More</button>
          <div id={id} className="kn-foundation-secondary" data-open={open}>{(["Explore", "Manage"] as const).map((group) => { const groupItems = secondary.filter((item) => item.group === group); return groupItems.length ? <section key={group}><h2>{group}</h2>{groupItems.map(renderItem)}</section> : null; })}</div></>}
      </nav>
      <main ref={main} className="kn-foundation-main" tabIndex={-1}>{children}</main>
    </div>
  </div>;
}

/** Removes the fixture's own chrome only when composed by the isolated preview. */
export function FixtureShell({ embedded, children, ...props }: ConsoleShellProps & { embedded?: boolean }) {
  return embedded ? <>{children}</> : <ConsoleShell {...props}>{children}</ConsoleShell>;
}
