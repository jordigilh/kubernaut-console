import { useState, useEffect, useCallback, useRef } from "react";
import {
  Alert, Button, Card, CardBody, CardHeader, CardTitle,
  Content, ContentVariants, Flex, FlexItem, Label, Split, SplitItem, TextInput,
} from "@patternfly/react-core";
import { CheckCircleIcon, ExclamationTriangleIcon, TimesCircleIcon } from "@patternfly/react-icons";
import type { WorkflowOption, AlignmentVerdict, TargetDivergence } from "../hooks/useChat";

interface Props {
  options: WorkflowOption[];
  onExecute?: (workflowId: string) => void;
  onDismiss?: () => void;
  onEscalate?: (reason: string) => void;
  recoverySignal?: "problem_resolved" | "alignment_check_failed" | null;
  alignmentVerdict?: AlignmentVerdict;
  targetDivergence?: TargetDivergence;
}

const COUNTDOWN_SECONDS = 10;

export function WorkflowCards({ options, onExecute, onDismiss, onEscalate, recoverySignal, alignmentVerdict, targetDivergence }: Props) {
  const recommended = options.find((o) => o.recommended);
  const ruledOut = options.filter((o) => !o.recommended);

  const [countdown, setCountdown] = useState<number | null>(null);
  const [executed, setExecuted] = useState(false);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [ruledOutCountdown, setRuledOutCountdown] = useState<number | null>(null);
  const onExecuteRef = useRef(onExecute);
  useEffect(() => { onExecuteRef.current = onExecute; });

  useEffect(() => {
    if (countdown === null || countdown <= 0) return;
    const id = setInterval(() => {
      setCountdown((c) => {
        if (c === null) return null;
        if (c <= 1) {
          if (recommended) onExecuteRef.current?.(recommended.workflowId);
          setExecuted(true);
          return null;
        }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [countdown, recommended]);

  useEffect(() => {
    if (ruledOutCountdown === null || ruledOutCountdown <= 0) return;
    const id = setInterval(() => {
      setRuledOutCountdown((c) => {
        if (c === null) return null;
        if (c <= 1) {
          if (confirmingId) onExecuteRef.current?.(confirmingId);
          setConfirmingId(null);
          setExecuted(true);
          return null;
        }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [ruledOutCountdown, confirmingId]);

  const handleExecute = useCallback(() => {
    setCountdown(COUNTDOWN_SECONDS);
  }, []);

  const handleCancel = useCallback(() => {
    setCountdown(null);
  }, []);

  const handleRuledOutClick = useCallback((workflowId: string) => {
    setConfirmingId((prev) => prev === workflowId ? null : workflowId);
  }, []);

  const handleConfirmRuledOut = useCallback(() => {
    setRuledOutCountdown(COUNTDOWN_SECONDS);
  }, []);

  const handleCancelRuledOut = useCallback(() => {
    setRuledOutCountdown(null);
    setConfirmingId(null);
  }, []);

  const highlightDismiss = recoverySignal === "problem_resolved";
  const highlightEscalate = recoverySignal === "alignment_check_failed";

  const [escalating, setEscalating] = useState(false);
  const [escalateReason, setEscalateReason] = useState("");
  const escalateInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (escalating) escalateInputRef.current?.focus();
  }, [escalating]);

  if (alignmentVerdict) {
    return (
      <div role="group" aria-label="Security findings">
        <Alert variant="danger" title="Shadow agent detected suspicious activity — remediation blocked" isInline />

        <Card isCompact style={{ marginTop: "var(--pf-t--global--spacer--sm)" }}>
          <CardHeader>
            <CardTitle>
              <Flex spaceItems={{ default: "spaceItemsSm" }} alignItems={{ default: "alignItemsCenter" }}>
                <FlexItem>Alignment Verdict: {alignmentVerdict.result}</FlexItem>
                <FlexItem align={{ default: "alignRight" }}>
                  <Label color="red" isCompact>{alignmentVerdict.flagged} of {alignmentVerdict.total} steps flagged</Label>
                </FlexItem>
              </Flex>
            </CardTitle>
          </CardHeader>
          <CardBody>
            <Content component={ContentVariants.p}>{alignmentVerdict.summary}</Content>
          </CardBody>
        </Card>

        {alignmentVerdict.findings.map((finding, i) => (
          <Card key={i} isCompact style={{ marginTop: "var(--pf-t--global--spacer--sm)" }}>
            <CardHeader>
              <CardTitle>
                <Flex spaceItems={{ default: "spaceItemsSm" }}>
                  <FlexItem><Label color="yellow" isCompact>Step {finding.step_index}</Label></FlexItem>
                  <FlexItem><Label color="yellow" isCompact>{finding.step_kind}</Label></FlexItem>
                  {finding.tool && <FlexItem><code>{finding.tool}</code></FlexItem>}
                </Flex>
              </CardTitle>
            </CardHeader>
            <CardBody>
              <Content component={ContentVariants.p}>{finding.explanation}</Content>
            </CardBody>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div role="group" aria-label="Remediation options">
      {recoverySignal === "problem_resolved" && (
        <Alert variant="success" title="Alert appears to have self-resolved. No remediation may be needed." isInline isPlain />
      )}
      {recoverySignal === "alignment_check_failed" && (
        <Alert variant="warning" title="Security concern detected during investigation. Manual review recommended." isInline isPlain />
      )}

      {targetDivergence && options.length > 0 && (
        <Alert variant="info" title={`RCA target differs from signal`} isInline aria-label="Target divergence note" style={{ marginBottom: "var(--pf-t--global--spacer--sm)" }}>
          <Content component={ContentVariants.p}>
            Signal: {targetDivergence.signalTarget.kind}/{targetDivergence.signalTarget.name}
            {targetDivergence.signalTarget.namespace && ` (${targetDivergence.signalTarget.namespace})`}
          </Content>
          <Content component={ContentVariants.p}>
            Root cause: <strong>{targetDivergence.discoveryTarget.kind}/{targetDivergence.discoveryTarget.name}</strong>
            {targetDivergence.discoveryTarget.namespace && ` (${targetDivergence.discoveryTarget.namespace})`}
          </Content>
        </Alert>
      )}

      {targetDivergence && options.length === 0 && (
        <Alert variant="warning" title="No remediation workflows found" isInline aria-label="Target divergence explanation">
          <Content component={ContentVariants.p}>
            Signal: {targetDivergence.signalTarget.kind}/{targetDivergence.signalTarget.name}
            {targetDivergence.signalTarget.namespace && ` (${targetDivergence.signalTarget.namespace})`}
          </Content>
          <Content component={ContentVariants.p}>
            Root cause: <strong>{targetDivergence.discoveryTarget.kind}/{targetDivergence.discoveryTarget.name}</strong>
            {targetDivergence.discoveryTarget.namespace && ` (${targetDivergence.discoveryTarget.namespace})`}
          </Content>
          <Content component={ContentVariants.small}>
            The agent traced the root cause to a different resource than the alerting target.
            No workflows in the catalog match the root cause resource type.
          </Content>
        </Alert>
      )}

      {recommended && (
        <Card isCompact data-testid={`workflow-card-${recommended.workflowId}`} isSelected style={{ marginTop: "var(--pf-t--global--spacer--sm)" }}>
          <CardHeader>
            <CardTitle>
              <Flex spaceItems={{ default: "spaceItemsSm" }} alignItems={{ default: "alignItemsCenter" }}>
                <FlexItem><CheckCircleIcon color="var(--pf-t--global--color--status--success--default)" data-testid="checkmark-icon" /></FlexItem>
                <FlexItem>{recommended.name}</FlexItem>
                <FlexItem><Label color="teal" isCompact>Recommended</Label></FlexItem>
                <FlexItem align={{ default: "alignRight" }}>
                  <Label
                    color="grey"
                    isCompact
                    onClick={() => navigator.clipboard.writeText(recommended.workflowId)}
                    style={{ cursor: "pointer" }}
                    aria-label={`Copy workflow ID ${recommended.workflowId}`}
                  >
                    ID: {recommended.workflowId.slice(0, 8)}
                  </Label>
                </FlexItem>
              </Flex>
            </CardTitle>
          </CardHeader>
          <CardBody>
            {recommended.description && (
              <Content component={ContentVariants.p}>{recommended.description}</Content>
            )}

            {recommended.parameters && (
              <Content component="pre" style={{ fontSize: "var(--pf-t--global--font--size--xs)" }}>
                {Object.entries(recommended.parameters).map(([k, v]) => `${k}=${v}`).join("  ")}
              </Content>
            )}

            <Split hasGutter style={{ marginTop: "var(--pf-t--global--spacer--sm)" }}>
              {countdown === null ? (
                <SplitItem isFilled>
                  <Button
                    variant="primary"
                    isBlock
                    onClick={handleExecute}
                    isDisabled={executed}
                    aria-label={executed ? "Workflow executed" : `Execute ${recommended.name}`}
                  >
                    {executed ? "Executed" : "Execute"}
                  </Button>
                </SplitItem>
              ) : (
                <>
                  <SplitItem isFilled>
                    <Button
                      variant="primary"
                      isBlock
                      onClick={() => {
                        setCountdown(null);
                        setExecuted(true);
                        if (recommended) onExecuteRef.current?.(recommended.workflowId);
                      }}
                      aria-label={`Execute now (${countdown}s remaining)`}
                    >
                      Executing in {countdown}s...
                    </Button>
                  </SplitItem>
                  <SplitItem isFilled>
                    <Button variant="secondary" isBlock onClick={handleCancel} aria-label="Cancel execution">
                      Cancel
                    </Button>
                  </SplitItem>
                </>
              )}
            </Split>
          </CardBody>
        </Card>
      )}

      {ruledOut.map((opt) => (
        <Card
          key={opt.workflowId}
          isCompact
          isFlat
          isClickable
          isSelectable
          isSelected={confirmingId === opt.workflowId}
          data-testid={`workflow-card-${opt.workflowId}`}
          onClick={() => handleRuledOutClick(opt.workflowId)}
          aria-expanded={confirmingId === opt.workflowId}
          aria-label={`${opt.name} — ruled out${opt.ruledOutReason ? `: ${opt.ruledOutReason}` : ""}`}
          style={{ marginTop: "var(--pf-t--global--spacer--sm)" }}
        >
          <CardHeader>
            <CardTitle>
              <Flex spaceItems={{ default: "spaceItemsSm" }} alignItems={{ default: "alignItemsCenter" }}>
                <FlexItem><TimesCircleIcon color="var(--pf-t--global--color--status--danger--default)" data-testid="ruled-out-icon" /></FlexItem>
                <FlexItem>{opt.name}</FlexItem>
                <FlexItem><Label color="red" isCompact>Ruled out</Label></FlexItem>
                <FlexItem align={{ default: "alignRight" }}>
                  <Label
                    color="grey"
                    isCompact
                    onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(opt.workflowId); }}
                    style={{ cursor: "pointer" }}
                    aria-label={`Copy workflow ID ${opt.workflowId}`}
                  >
                    ID: {opt.workflowId.slice(0, 8)}
                  </Label>
                </FlexItem>
              </Flex>
            </CardTitle>
          </CardHeader>
          {(opt.description || confirmingId === opt.workflowId) && (
            <CardBody>
              {opt.description && (
                <Content component={ContentVariants.p}>{opt.description}</Content>
              )}
              {confirmingId === opt.workflowId && (
                <div onClick={(e) => e.stopPropagation()}>
                  <Alert variant="warning" title={opt.ruledOutReason || "Not recommended by the Agent for this scenario"} isInline isPlain />
                  <Content component={ContentVariants.p}>Are you sure you want to proceed?</Content>
                  <Split hasGutter>
                    {ruledOutCountdown === null ? (
                      <SplitItem isFilled>
                        <Button variant="warning" isBlock onClick={handleConfirmRuledOut} isDisabled={executed} aria-label="Proceed anyway">
                          Proceed anyway
                        </Button>
                      </SplitItem>
                    ) : (
                      <>
                        <SplitItem isFilled>
                          <Button
                            variant="warning"
                            isBlock
                            onClick={() => {
                              setRuledOutCountdown(null);
                              setExecuted(true);
                              if (confirmingId) onExecuteRef.current?.(confirmingId);
                              setConfirmingId(null);
                            }}
                            aria-label={`Proceed now (${ruledOutCountdown}s remaining)`}
                          >
                            Proceeding in {ruledOutCountdown}s...
                          </Button>
                        </SplitItem>
                        <SplitItem isFilled>
                          <Button variant="secondary" isBlock onClick={handleCancelRuledOut} aria-label="Cancel">
                            Cancel
                          </Button>
                        </SplitItem>
                      </>
                    )}
                  </Split>
                </div>
              )}
            </CardBody>
          )}
        </Card>
      ))}

      {!escalating && (
        <Split hasGutter style={{ marginTop: "var(--pf-t--global--spacer--md)" }}>
          {onDismiss && (
            <SplitItem isFilled>
              <Button
                variant={highlightDismiss ? "primary" : "secondary"}
                isBlock
                onClick={() => { setExecuted(true); onDismiss(); }}
                isDisabled={executed || countdown !== null || ruledOutCountdown !== null}
                aria-label="No action needed"
              >
                No action needed
              </Button>
            </SplitItem>
          )}
          {onEscalate && (
            <SplitItem isFilled>
              <Button
                variant={highlightEscalate ? "danger" : "secondary"}
                isBlock
                onClick={() => setEscalating(true)}
                isDisabled={executed || countdown !== null || ruledOutCountdown !== null}
                aria-label="Escalate to team"
              >
                Escalate to team
              </Button>
            </SplitItem>
          )}
        </Split>
      )}

      {escalating && (
        <Flex spaceItems={{ default: "spaceItemsSm" }} alignItems={{ default: "alignItemsCenter" }} style={{ marginTop: "var(--pf-t--global--spacer--md)" }}>
          <FlexItem grow={{ default: "grow" }}>
            <TextInput
              ref={escalateInputRef}
              value={escalateReason}
              onChange={(_e, val) => setEscalateReason(val)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && escalateReason.trim()) {
                  onEscalate?.(escalateReason.trim());
                  setEscalating(false);
                  setEscalateReason("");
                  setExecuted(true);
                }
                if (e.key === "Escape") {
                  setEscalating(false);
                  setEscalateReason("");
                }
              }}
              placeholder="Why is this being escalated?"
              aria-label="Escalation reason"
            />
          </FlexItem>
          <FlexItem>
            <Button
              variant="danger"
              onClick={() => {
                if (escalateReason.trim()) {
                  onEscalate?.(escalateReason.trim());
                  setEscalating(false);
                  setEscalateReason("");
                  setExecuted(true);
                }
              }}
              isDisabled={!escalateReason.trim()}
              aria-label="Submit escalation"
            >
              Send
            </Button>
          </FlexItem>
          <FlexItem>
            <Button
              variant="secondary"
              onClick={() => { setEscalating(false); setEscalateReason(""); }}
              aria-label="Cancel escalation"
            >
              Cancel
            </Button>
          </FlexItem>
        </Flex>
      )}
    </div>
  );
}
