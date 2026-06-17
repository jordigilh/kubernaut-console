import { Message } from "@patternfly/chatbot";
import type { ChatMessage } from "../hooks/useChat";
import { ThinkingPanel } from "./ThinkingPanel";
import { RCACard } from "./RCACard";
import { AgentCTA } from "./AgentCTA";
import { WorkflowCards } from "./WorkflowCards";
import { ApprovalCard } from "./ApprovalCard";
import { VerificationTimer } from "./VerificationTimer";

interface Props {
  message: ChatMessage;
  investigationStartTime?: number;
  onExecuteWorkflow?: (workflowId: string) => void;
  onApprove?: (rarName: string, reason: string) => void;
  onDecline?: (rarName: string, reason: string) => void;
  onDismiss?: () => void;
  onEscalate?: (reason: string) => void;
  userName?: string;
  recoverySignal?: "problem_resolved" | "alignment_check_failed" | null;
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function AgentBubble({ message, investigationStartTime, onExecuteWorkflow, onApprove, onDecline, onDismiss, onEscalate, userName, recoverySignal }: Props) {
  const hasContent = message.text.trim().length > 0;
  const hasThinking = message.thinking && message.thinking.length > 0;
  const hasRCA = !!message.rca;
  const hasRCAData = hasRCA && (
    (message.rca!.causalChain && message.rca!.causalChain.length > 0) ||
    message.rca!.toolCallsCount > 0
  );
  const hasWorkflows = message.workflowOptions && message.workflowOptions.length > 0;
  const showEscapeHatches = hasRCAData && !hasWorkflows;
  const hasApproval = !!message.approvalRequest;
  const hasAlignmentVerdict = !!message.alignmentVerdict;

  const extraContent = {
    afterMainContent: (
      <>
        {hasWorkflows && !hasRCA && hasContent && (
          <AgentCTA text={message.text} />
        )}

        {hasThinking && (
          <ThinkingPanel
            entries={message.thinking!}
            isActive={message.isStreaming ?? false}
            startTime={investigationStartTime}
            label={message.thinkingLabel}
          />
        )}

        {hasRCA && hasRCAData && (
          <RCACard rca={message.rca!} />
        )}

        {hasWorkflows && (
          <WorkflowCards
            options={message.workflowOptions!}
            onExecute={onExecuteWorkflow}
            onDismiss={onDismiss}
            onEscalate={onEscalate}
            recoverySignal={recoverySignal}
            targetDivergence={message.targetDivergence}
          />
        )}

        {showEscapeHatches && (
          <WorkflowCards
            options={[]}
            onDismiss={onDismiss}
            onEscalate={onEscalate}
            recoverySignal={recoverySignal}
            targetDivergence={message.targetDivergence}
          />
        )}

        {hasAlignmentVerdict && (
          <WorkflowCards
            options={[]}
            recoverySignal={recoverySignal}
            alignmentVerdict={message.alignmentVerdict}
          />
        )}

        {hasApproval && (
          <ApprovalCard
            request={message.approvalRequest!}
            resolution={message.approvalResolution}
            onApprove={(reason) => onApprove?.(message.approvalRequest!.name, reason)}
            onDecline={(reason) => onDecline?.(message.approvalRequest!.name, reason)}
            userName={userName}
          />
        )}

        {message.phase === "verifying" && message.stabilizationWindow && message.stabilizationWindow > 0 && (
          <VerificationTimer
            stabilizationWindow={message.stabilizationWindow}
            startedAt={message.verifyingStartedAt}
            steps={message.verificationSteps}
          />
        )}
      </>
    ),
  };

  const showMainContent = !hasWorkflows && !hasRCA && hasContent;

  return (
    <Message
      role="bot"
      name="Kubernaut"
      content={showMainContent ? message.text.trimEnd() : undefined}
      isLoading={message.isStreaming && !hasContent && !hasThinking}
      timestamp={!message.isStreaming && message.timestamp ? formatTime(message.timestamp) : undefined}
      extraContent={extraContent}
    />
  );
}
