import { useState, useEffect, useRef } from "react";
import { Card, CardBody, Content, ContentVariants, Flex, FlexItem, Label, List, ListItem, Progress } from "@patternfly/react-core";
import { CheckCircleIcon, ExclamationCircleIcon, InProgressIcon } from "@patternfly/react-icons";
import type { VerificationStep } from "../hooks/useChat";

interface Props {
  stabilizationWindow: number;
  startedAt?: number;
  steps?: VerificationStep[];
}

const STEP_LABELS: Record<string, string> = {
  stabilization_elapsed: "Stabilization window",
  spec_hash_computed: "Spec hash verification",
  alert_check: "Alert decay check",
  health_check: "Health assessment",
};

function StepIcon({ status }: { status: string }) {
  if (status === "completed") return <CheckCircleIcon color="var(--pf-t--global--color--status--success--default)" />;
  if (status === "failed") return <ExclamationCircleIcon color="var(--pf-t--global--color--status--danger--default)" />;
  return <InProgressIcon color="var(--pf-t--global--color--status--info--default)" />;
}

export function VerificationTimer({ stabilizationWindow, startedAt, steps }: Props) {
  const startRef = useRef<number>(0);
  const [remaining, setRemaining] = useState(stabilizationWindow);

  useEffect(() => {
    startRef.current = startedAt ?? Date.now();
    const elapsed = Math.floor((Date.now() - startRef.current) / 1000);
    setRemaining(Math.max(0, stabilizationWindow - elapsed));
  }, [startedAt, stabilizationWindow]);

  useEffect(() => {
    const interval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startRef.current) / 1000);
      setRemaining(Math.max(0, stabilizationWindow - elapsed));
    }, 1000);
    return () => clearInterval(interval);
  }, [stabilizationWindow]);

  const progress = stabilizationWindow > 0
    ? ((stabilizationWindow - remaining) / stabilizationWindow) * 100
    : 100;

  function formatTime(seconds: number): string {
    if (seconds <= 0) return "completing...";
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    if (m > 0) return `${m}m ${s}s remaining`;
    return `${s}s remaining`;
  }

  return (
    <Card isCompact data-testid="verification-timer" aria-label="Verification progress">
      <CardBody>
        <Flex spaceItems={{ default: "spaceItemsSm" }} alignItems={{ default: "alignItemsCenter" }}>
          <FlexItem>
            <Label color="blue" icon={<InProgressIcon />} isCompact>
              Verifying stability
            </Label>
          </FlexItem>
          <FlexItem align={{ default: "alignRight" }}>
            <Content component={ContentVariants.small}>{formatTime(remaining)}</Content>
          </FlexItem>
        </Flex>

        <Progress
          value={Math.round(progress)}
          aria-label={`Verification progress: ${formatTime(remaining)}`}
          style={{ marginTop: "var(--pf-t--global--spacer--sm)" }}
        />

        {steps && steps.length > 0 && (
          <List isPlain data-testid="verification-steps" style={{ marginTop: "var(--pf-t--global--spacer--sm)" }}>
            {steps.map((s) => (
              <ListItem key={s.step} icon={<StepIcon status={s.status} />}>
                <Flex spaceItems={{ default: "spaceItemsSm" }}>
                  <FlexItem>
                    <Content component={ContentVariants.small}>
                      {STEP_LABELS[s.step] ?? s.step}
                    </Content>
                  </FlexItem>
                  {s.retryCount && s.retryCount > 1 && (
                    <FlexItem>
                      <Label isCompact color="yellow">retry {s.retryCount}</Label>
                    </FlexItem>
                  )}
                  {s.elapsedSeconds !== undefined && (
                    <FlexItem align={{ default: "alignRight" }}>
                      <Content component={ContentVariants.small}>+{s.elapsedSeconds}s</Content>
                    </FlexItem>
                  )}
                </Flex>
                {s.detail && (
                  <Content component={ContentVariants.small}>{s.detail}</Content>
                )}
              </ListItem>
            ))}
          </List>
        )}
      </CardBody>
    </Card>
  );
}
