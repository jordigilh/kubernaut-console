import { useState, useEffect } from "react";
import {
  Card, CardBody, CardHeader, CardTitle,
  Button, Content, ContentVariants, Divider,
  Flex, FlexItem, Label, List, ListItem,
  TextInput, Split, SplitItem,
} from "@patternfly/react-core";
import type { ApprovalRequest, ApprovalResolution } from "../hooks/useChat";

interface Props {
  request: ApprovalRequest;
  resolution?: ApprovalResolution;
  onApprove: (reason: string) => void;
  onDecline: (reason: string) => void;
  userName?: string;
}

const CONFIDENCE_COLORS: Record<string, "green" | "yellow" | "red" | "grey"> = {
  High: "green",
  Medium: "yellow",
  Low: "red",
};

function formatTimeRemaining(ms: number): string {
  if (ms <= 0) return "expired";
  const minutes = Math.floor(ms / 60_000);
  const hours = Math.floor(minutes / 60);
  if (hours > 0) return `${hours}h ${minutes % 60}m remaining`;
  if (minutes > 0) return `${minutes}m remaining`;
  return `${Math.ceil(ms / 1000)}s remaining`;
}

export function ApprovalCard({ request, resolution, onApprove, onDecline, userName }: Props) {
  const [timeRemaining, setTimeRemaining] = useState<number>(() => {
    return new Date(request.requiredBy).getTime() - Date.now();
  });
  const [submitted, setSubmitted] = useState(false);
  const [reason, setReason] = useState(() => `Approved by ${userName || "operator"}`);

  useEffect(() => {
    const interval = setInterval(() => {
      setTimeRemaining(new Date(request.requiredBy).getTime() - Date.now());
    }, 1000);
    return () => clearInterval(interval);
  }, [request.requiredBy]);

  const isExpired = timeRemaining <= 0;
  const isResolved = !!resolution;
  const isDisabled = isResolved || isExpired || submitted;
  const confidenceColor = CONFIDENCE_COLORS[request.confidenceLevel] ?? "grey";
  const confidencePercent = `${Math.round(request.confidence * 100)}%`;

  return (
    <Card isCompact>
      <CardHeader>
        <CardTitle>
          <Flex spaceItems={{ default: "spaceItemsSm" }} alignItems={{ default: "alignItemsCenter" }}>
            <FlexItem>Approval Required</FlexItem>
            <FlexItem>
              <Label color={confidenceColor} isCompact>{request.confidenceLevel}</Label>
            </FlexItem>
            <FlexItem>
              <Label color="grey" isCompact>{confidencePercent}</Label>
            </FlexItem>
          </Flex>
        </CardTitle>
      </CardHeader>
      <CardBody>
        <Content component={ContentVariants.p}>{request.reason}</Content>

        {request.investigationSummary && (
          <Content component={ContentVariants.blockquote}>
            {request.investigationSummary}
          </Content>
        )}

        {Array.isArray(request.evidenceCollected) && request.evidenceCollected.length > 0 && (
          <>
            <Content component={ContentVariants.small}>Evidence:</Content>
            <List isPlain>
              {request.evidenceCollected.map((item, idx) => (
                <ListItem key={idx}>{item}</ListItem>
              ))}
            </List>
          </>
        )}

        {request.policyEvaluation && (
          <>
            <Content component={ContentVariants.small}>
              Policy: {request.policyEvaluation.policyName}
            </Content>
            {request.policyEvaluation.matchedRules && request.policyEvaluation.matchedRules.length > 0 && (
              <Flex spaceItems={{ default: "spaceItemsXs" }}>
                {request.policyEvaluation.matchedRules.map((rule, idx) => (
                  <FlexItem key={idx}>
                    <Label color="yellow" isCompact>{rule}</Label>
                  </FlexItem>
                ))}
              </Flex>
            )}
          </>
        )}

        <Divider />

        <Flex spaceItems={{ default: "spaceItemsSm" }} alignItems={{ default: "alignItemsCenter" }}>
          <FlexItem>
            <Label
              data-testid="approval-countdown"
              color={isExpired ? "red" : "grey"}
              isCompact
            >
              {formatTimeRemaining(timeRemaining)}
            </Label>
          </FlexItem>
          {isResolved && (
            <FlexItem align={{ default: "alignRight" }}>
              <Content component={ContentVariants.small}>
                {resolution.decision} by {resolution.decidedBy}
              </Content>
            </FlexItem>
          )}
        </Flex>

        {!isResolved && (
          <TextInput
            id="approval-reason"
            value={reason}
            onChange={(_e, val) => setReason(val)}
            isDisabled={isDisabled}
            aria-label="Reason"
          />
        )}

        <Split hasGutter>
          <SplitItem isFilled>
            <Button
              variant="primary"
              isBlock
              onClick={() => { setSubmitted(true); onApprove(reason); }}
              isDisabled={isDisabled}
            >
              Approve
            </Button>
          </SplitItem>
          <SplitItem isFilled>
            <Button
              variant="secondary"
              isBlock
              onClick={() => { setSubmitted(true); onDecline(reason); }}
              isDisabled={isDisabled}
            >
              Decline
            </Button>
          </SplitItem>
        </Split>
      </CardBody>
    </Card>
  );
}
