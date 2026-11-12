import { KubernautChat, ErrorBoundary, clearConsoleSessionState } from "@kubernaut/ui-core";
import { ProxyAuthProvider } from "./ProxyAuthProvider";
import { useMemo, useState } from "react";

// Console #168: reload cannot bind previously stored chat data to this page's
// newly verified principal. Clear it once per document, before React renders.
function clearUnboundState(): boolean {
  try {
    clearConsoleSessionState();
    return true;
  } catch {
    return false;
  }
}
let storageReady = clearUnboundState();

// All standalone modes use the same host-owned auth boundary. In production
// oauth2-proxy injects headers; the live FullPipeline Vite server does the
// equivalent server-side. The browser never selects a bearer-token provider.
const authProvider = new ProxyAuthProvider();

// Populated by /runtime-config.js, a same-origin script tag (see index.html)
// served either by the deploying chart's nginx ConfigMap -- kubernaut-operator
// (kubernaut-operator#313) or kubernaut's own chart (kubernaut#2015), both
// templated from their own values at install/upgrade time, no image rebuild
// needed, same mechanism already used for apiFrontend.url -- or, for local
// dev/non-chart deploys, the static fallback in public/runtime-config.js.
// Deliberately loaded as an external file rather than an inline <script>
// block: this app's CSP is `script-src 'self'` with no 'unsafe-inline', so
// an inline script would be blocked.
declare global {
  interface Window {
    __KUBERNAUT_CONFIG__?: { enableRawThinking?: boolean };
  }
}

function App() {
  const [ready, setReady] = useState(storageReady);
  const config = useMemo(
    () => ({
      backendUrl: "",
      requireBackendIncarnation: true,
      enableRawThinking: window.__KUBERNAUT_CONFIG__?.enableRawThinking,
    }),
    [],
  );

  if (!ready) {
    return <div role="alert">Unable to clear session storage. <button onClick={() => { storageReady = clearUnboundState(); setReady(storageReady); }}>Retry</button></div>;
  }

  return (
    <div style={{ display: "flex", height: "100vh", alignItems: "center", justifyContent: "center", background: "var(--kn-surface)", padding: 0 }}>
      <div style={{ height: "100%", width: "100%", maxWidth: 820, maxHeight: 750 }}>
        <ErrorBoundary>
          <KubernautChat authProvider={authProvider} config={config} />
        </ErrorBoundary>
      </div>
    </div>
  );
}

export default App;
