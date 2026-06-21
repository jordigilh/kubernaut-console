import React, { useMemo } from "react";
import {
  useApi,
  identityApiRef,
  configApiRef,
} from "@backstage/core-plugin-api";
import { KubernautChat, ErrorBoundary } from "@kubernaut/ui-core";
import { BackstageAuthProvider } from "../providers/BackstageAuthProvider";
import { usePf6ThemeClass } from "../hooks/useBackstageTheme";
import "../styles.css";

export function NfsKubernautPage() {
  const identityApi = useApi(identityApiRef);
  const configApi = useApi(configApiRef);
  const themeClass = usePf6ThemeClass();

  const authProvider = useMemo(
    () => new BackstageAuthProvider(identityApi),
    [identityApi]
  );

  const config = useMemo(
    () => ({
      backendUrl: configApi.getOptionalString("kubernaut.backendUrl") ?? "/api/proxy/kubernaut",
    }),
    [configApi]
  );

  return (
    <div className={`kubernaut-plugin-root ${themeClass}`}>
      <ErrorBoundary>
        <KubernautChat authProvider={authProvider} config={config} />
      </ErrorBoundary>
    </div>
  );
}
