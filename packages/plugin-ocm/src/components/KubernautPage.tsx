import React from "react";
import {
  Page,
  PageSection,
  Title,
  Flex,
  FlexItem,
} from "@patternfly/react-core";
import { KubernautChat } from "@kubernaut/ui-core";
import { OCMAuthProvider } from "../providers/OCMAuthProvider";
import { useOCMConfig } from "../hooks/useOCMConfig";

const authProvider = new OCMAuthProvider();

const KubernautPage: React.FC = () => {
  const config = useOCMConfig();

  return (
    <Page>
      <PageSection variant="light">
        <Flex>
          <FlexItem>
            <Title headingLevel="h1">Kubernaut</Title>
          </FlexItem>
        </Flex>
      </PageSection>
      <PageSection isFilled className="kubernaut-plugin-root">
        <KubernautChat authProvider={authProvider} config={config} />
      </PageSection>
    </Page>
  );
};

export default KubernautPage;
