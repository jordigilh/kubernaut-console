// Production console composition for the standalone application (#169).
//
// Composes the accepted shared shell (ConsoleShell) with production History-
// API routing. The chat is supplied by the host through a slot and stays
// mounted across route changes: a view change is not cancellation and must
// not dispose operational owners (design-and-navigation.md, O01/O02). Every
// non-chat screen renders its honest not-live-ready state until the upstream
// read contracts close; nothing here presents fixture data as live.

import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  ConsoleShell,
  ConsoleRouteNotFound,
  NotLiveReadyScreen,
  formatConsoleRoute,
  screenHeadings,
  sectionForScreen,
  sectionScreens,
  useConsoleRoute,
  type ChatSlot,
  type NavigationId,
  type Topology,
} from "@kubernaut/ui-core";
import { currentDeploymentTopology } from "./deployment-topology";

/**
 * Presentation visibility only — never authorization (N03). The per-user
 * capability source lands with identity/session work (#168); every screen
 * independently fails closed on its own reads.
 */
const CONSOLE_SECTIONS: readonly NavigationId[] = [
  "approvals",
  "investigations",
  "overview",
  "workflows",
  "resources",
  "clusters",
  "policies",
  "administration",
];

const SECTION_HREFS: Partial<Record<NavigationId, string>> = Object.fromEntries(
  CONSOLE_SECTIONS.map((section) => [
    section,
    formatConsoleRoute(sectionScreens[section]),
  ]),
) as Partial<Record<NavigationId, string>>;

export function ConsoleApp({
  chat,
  access = CONSOLE_SECTIONS,
  topology = currentDeploymentTopology(),
}: {
  chat: ChatSlot;
  access?: readonly NavigationId[];
  topology?: Topology;
}) {
  const { route, location, navigate } = useConsoleRoute();
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const routeContent = useRef<HTMLDivElement>(null);
  const previousPath = useRef<string | null>(null);
  const currentPath = `${location.pathname}${location.search}`;

  // Final-render focus: after a route change, move focus to the route
  // content so keyboard and screen-reader users land on the new screen
  // (design-and-navigation.md navigation contract).
  useEffect(() => {
    if (previousPath.current !== null && previousPath.current !== currentPath) {
      routeContent.current?.focus();
    }
    previousPath.current = currentPath;
  }, [currentPath]);

  const isChat = route?.screenId === "chat";
  const section = route ? sectionForScreen(route.screenId) : undefined;
  // The focused route container is labelled by the screen it renders, so a
  // route change announces the destination rather than a generic label.
  const routeLabel = route === null
    ? "Console route not found"
    : isChat
      ? "Console chat"
      : screenHeadings[route.screenId] ?? "Console screen";

  return (
    <ConsoleShell
      access={access}
      topology={topology}
      current={section}
      hrefs={SECTION_HREFS}
      theme={theme}
      productionLinks
      onNavigate={navigate}
      headerActions={
        <button
          type="button"
          className="kn-console-theme-toggle"
          aria-label={theme === "light" ? "Switch to dark theme" : "Switch to light theme"}
          onClick={() => setTheme(theme === "light" ? "dark" : "light")}
        >
          {theme === "light" ? "Dark theme" : "Light theme"}
        </button>
      }
    >
      <div
        ref={routeContent}
        tabIndex={-1}
        aria-label={routeLabel}
        className="kn-console-route"
      >
        {/* The chat stays mounted; hiding a view is not cancellation (O02). */}
        <div className="kn-console-chat" hidden={isChat ? undefined : true}>
          {chat}
        </div>
        {route === null ? (
          <ConsoleRouteNotFound />
        ) : (
          !isChat && <NotLiveReadyScreen route={route} />
        )}
      </div>
    </ConsoleShell>
  );
}
