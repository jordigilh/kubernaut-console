import { KubernautChat, ErrorBoundary } from "@kubernaut/ui-core";
import { ProxyAuthProvider } from "./ProxyAuthProvider";
import { useMemo } from "react";

const authProvider = new ProxyAuthProvider();

function App() {
  const config = useMemo(() => ({ backendUrl: "" }), []);

  return (
    <div className="flex h-screen items-center justify-center bg-surface p-0 sm:p-4">
      <div className="h-full w-full sm:h-[750px] sm:max-w-[820px]">
        <ErrorBoundary>
          <KubernautChat authProvider={authProvider} config={config} />
        </ErrorBoundary>
      </div>
    </div>
  );
}

export default App;
