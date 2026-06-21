import { Card, CardBody, CardHeader, CardTitle, Content, ContentVariants, Divider, Label, List, ListItem } from "@patternfly/react-core";
import type { RCAData } from "../hooks/useChat";

interface Props {
  rca: RCAData;
}

interface ParsedSummary {
  intro: string;
  steps: string[];
  conclusion: string;
}

function parseSummary(text: string): ParsedSummary {
  const stepPattern = /\s(?=\d+\.\s)/;
  const firstStepMatch = text.match(/\s(1\.\s)/);

  if (!firstStepMatch || firstStepMatch.index === undefined) {
    return { intro: text, steps: [], conclusion: "" };
  }

  const intro = text.slice(0, firstStepMatch.index + 1).trim();
  const rest = text.slice(firstStepMatch.index + 1);

  const parts = rest.split(stepPattern).filter(Boolean);
  const steps: string[] = [];
  let conclusion = "";

  for (const part of parts) {
    const stepMatch = part.match(/^(\d+)\.\s(.+)/s);
    if (stepMatch) {
      steps.push(stepMatch[2].trim());
    } else {
      conclusion = part.trim();
    }
  }

  if (steps.length > 0) {
    const lastStep = steps[steps.length - 1];
    const sentenceEnd = lastStep.match(/\.\s+(?=[A-Z](?![a-z]*\/))/);
    if (sentenceEnd && sentenceEnd.index !== undefined) {
      const boundary = sentenceEnd.index + 1;
      conclusion = lastStep.slice(boundary).trim();
      steps[steps.length - 1] = lastStep.slice(0, boundary).trim();
    }
  }

  return { intro, steps, conclusion };
}

const SEVERITY_COLOR: Record<string, "red" | "orange" | "yellow" | "green" | "grey"> = {
  critical: "red",
  high: "orange",
  medium: "yellow",
  low: "green",
};

function parseCausalEntry(entry: string): { label: string; text: string } {
  const colonIdx = entry.indexOf(":");
  if (colonIdx > 0 && colonIdx < 15) {
    return { label: entry.slice(0, colonIdx + 1), text: entry.slice(colonIdx + 1).trim() };
  }
  return { label: "", text: entry };
}

export function RCACard({ rca }: Props) {
  const severityColor = SEVERITY_COLOR[rca.severity] ?? "grey";
  const hasExplicitChain = rca.causalChain.length > 0;
  const parsed = hasExplicitChain ? null : parseSummary(rca.summary);
  const chainSteps = hasExplicitChain ? rca.causalChain : (parsed?.steps ?? []);

  return (
    <Card data-testid="severity-accent" isCompact>
      <CardHeader>
        <CardTitle>
          Root Cause Analysis{" "}
          <Label color={severityColor} isCompact>
            {rca.severity}
          </Label>
        </CardTitle>
      </CardHeader>
      <CardBody>
        <Content component={ContentVariants.p}>
          {hasExplicitChain ? rca.summary : (parsed?.intro || rca.summary)}
        </Content>

        {chainSteps.length > 0 && (
          <>
            <Content component={ContentVariants.small}>Causal chain:</Content>
            <List component="ol" data-testid="causal-chain" style={{ maxHeight: "180px", overflowY: "auto" }}>
              {chainSteps.map((entry, idx) => {
                const { label, text } = parseCausalEntry(entry);
                return (
                  <ListItem key={idx}>
                    {label && <strong>{label} </strong>}
                    {text}
                  </ListItem>
                );
              })}
            </List>
          </>
        )}

        {parsed?.conclusion && (
          <Content component={ContentVariants.p}>
            <strong>{parsed.conclusion}</strong>
          </Content>
        )}

        <Divider />

        <Content component={ContentVariants.small}>
          {rca.rrId && <>RR: {rca.rrId} | </>}
          Target: {rca.target} | Confidence: {rca.confidence} | {rca.toolCallsCount} tool calls, {rca.llmTurns} LLM turns
        </Content>
      </CardBody>
    </Card>
  );
}
