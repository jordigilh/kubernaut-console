// History-API routing hook for the production console (#169).
//
// Uses normal browser history (pushState/popstate), preserving Back/Forward,
// direct links and new-tab semantics. Production routing never uses the
// fixture preview's hash scheme.

import { useCallback, useEffect, useMemo, useState } from "react";
import { parseConsoleRoute, type ConsoleRoute } from "./routes";

export interface ConsoleLocation {
  pathname: string;
  search: string;
}

export interface UseConsoleRouteResult {
  route: ConsoleRoute | null;
  location: ConsoleLocation;
  /** Push a path onto browser history and update the rendered route. */
  navigate: (path: string) => void;
}

function readLocation(): ConsoleLocation {
  return { pathname: window.location.pathname, search: window.location.search };
}

export function useConsoleRoute(): UseConsoleRouteResult {
  const [location, setLocation] = useState<ConsoleLocation>(readLocation);

  useEffect(() => {
    const onPopState = () => setLocation(readLocation());
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const navigate = useCallback((path: string) => {
    const url = new URL(path, window.location.origin);
    if (url.pathname === window.location.pathname && url.search === window.location.search) return;
    window.history.pushState(null, "", url);
    setLocation({ pathname: url.pathname, search: url.search });
  }, []);

  const route = useMemo(
    () => parseConsoleRoute(location.pathname, location.search),
    [location.pathname, location.search],
  );

  return { route, location, navigate };
}
