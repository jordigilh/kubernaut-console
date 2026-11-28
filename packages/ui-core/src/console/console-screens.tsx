// Production screen states for the operational console (#169).
//
// No console screen has a qualified live read yet: the RAR list/evidence and
// decision-consistency contracts are open upstream (kubernaut#2564, #2565),
// and the identity/capability source is #168. These components render the
// honest fail-closed state required by docs/design/console/implementation-
// readiness.md — never fixture data, never a faked loading-success, and never
// a presentation that could be mistaken for live readiness. Synthetic
// fixture previews remain isolated in the fixture waves and the test-only
// browser entry.

import { useId } from "react";
import type { ReactNode } from "react";
import { ReadStatePanel } from "./foundation";
import { screenHeadings, screenReadinessReasons } from "./screen-content";
import type { ConsoleRoute } from "./routes";

function requestedReferences(route: ConsoleRoute): string[] {
  const references = Object.entries({ ...route.params, ...route.query }).filter(([, value]) => value !== "");
  return references.map(([key, value]) => `${key}: ${value}`);
}

/**
 * Honest not-live-ready state for a routed console screen. Echoes only the
 * reference supplied in the URL (never another record) and names the pending
 * upstream contract from the readiness register.
 */
export function NotLiveReadyScreen({ route }: { route: ConsoleRoute }) {
  const headingId = useId();
  const heading = screenHeadings[route.screenId] ?? route.screenId;
  const reason = screenReadinessReasons[route.screenId] ?? "A qualified live read for this screen is not yet available.";
  const references = requestedReferences(route);
  return (
    <section className="kn-console-screen" aria-labelledby={headingId} data-not-live="true">
      <h1 id={headingId}>{heading}</h1>
      <ReadStatePanel
        state={{ status: "unavailable", message: reason }}
        label={heading}
      >
        {null}
      </ReadStatePanel>
      {references.length > 0 && (
        <p className="kn-console-requested-reference">
          Requested reference — {references.join(" · ")}
        </p>
      )}
      <p role="note" className="kn-console-not-live-note">
        Not live-ready. This screen has no qualified live read in this deployment; synthetic
        fixture previews are separate and are never presented as live data.
      </p>
    </section>
  );
}

/** Unknown production route; mirrors the fixture preview's not-found semantics. */
export function ConsoleRouteNotFound() {
  const headingId = useId();
  return (
    <section className="kn-console-screen" role="alert" aria-labelledby={headingId}>
      <h1 id={headingId}>Console route not found</h1>
      <p>No console screen matches this address.</p>
    </section>
  );
}

/**
 * The shell never imports the chat: the host application owns transport,
 * auth and operational state above the presenter (design-and-navigation.md,
 * ownership boundary O01). The chat is supplied through this slot.
 */
export type ChatSlot = ReactNode;
