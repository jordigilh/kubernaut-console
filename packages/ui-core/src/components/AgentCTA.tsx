import { Alert } from "@patternfly/react-core";

interface Props {
  text: string;
}

export function AgentCTA({ text }: Props) {
  return (
    <Alert variant="info" title={text} isInline isPlain data-testid="agent-cta" />
  );
}
