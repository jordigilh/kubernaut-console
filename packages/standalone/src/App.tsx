import { KubernautChat, ErrorBoundary } from "@kubernaut/ui-core";
import { ProxyAuthProvider } from "./ProxyAuthProvider";
import { useMemo } from "react";

const authProvider = new ProxyAuthProvider();

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
