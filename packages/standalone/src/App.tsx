import { KubernautChat, ErrorBoundary } from "@kubernaut/ui-core";
import { ProxyAuthProvider } from "./ProxyAuthProvider";
import { LiveE2EAuthProvider } from "./LiveE2EAuthProvider";
import { useMemo } from "react";

// ADR-009 live E2E suite only: no oauth2-proxy fronts the fullpipeline
// cluster, so auth falls back to a Dex-token-bearing provider instead of
// ProxyAuthProvider's cookie/header-injection model. Unset in every other
// mode (local dev, standalone deploys, mocked e2e.yml), so this is a no-op
// there.
const authProvider = import.meta.env.VITE_LIVE_E2E_TOKEN
  ? new LiveE2EAuthProvider()
  : new ProxyAuthProvider();

function App() {
  const config = useMemo(() => ({ backendUrl: "" }), []);

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
