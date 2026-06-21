import React, { useMemo } from "react";
import { Header, Content, Page } from "@backstage/core-components";
import {
  useApi,
  identityApiRef,
  configApiRef,
} from "@backstage/core-plugin-api";
import { KubernautChat, ErrorBoundary } from "@kubernaut/ui-core";
import { BackstageAuthProvider } from "../providers/BackstageAuthProvider";
import { usePf6ThemeClass } from "../hooks/useBackstageTheme";
import "../styles.css";

export function KubernautPluginPage() {
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
    <Page themeId="tool">
      <Header title="Kubernaut Console" subtitle="AI-powered incident response" />
      <Content>
        <div className={`kubernaut-plugin-root ${themeClass}`}>
          <ErrorBoundary>
            <KubernautChat authProvider={authProvider} config={config} />
          </ErrorBoundary>
        </div>
      </Content>
    </Page>
  );
}
