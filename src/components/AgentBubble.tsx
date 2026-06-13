import type { ChatMessage } from "../hooks/useChat";
import { ThinkingPanel } from "./ThinkingPanel";
import { RCACard } from "./RCACard";
import { AgentCTA } from "./AgentCTA";
import { WorkflowCards } from "./WorkflowCards";
import { ApprovalCard } from "./ApprovalCard";
import { VerificationTimer } from "./VerificationTimer";
import { MarkdownContent } from "./MarkdownContent";
import { StreamingCursor } from "./StreamingCursor";
import { TypingIndicator } from "./TypingIndicator";

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
    (message.rca!.summary && message.rca!.summary.length > 0) ||
    (message.rca!.causalChain && message.rca!.causalChain.length > 0) ||
    message.rca!.toolCallsCount > 0
  );
  const hasWorkflows = message.workflowOptions && message.workflowOptions.length > 0;
  const showEscapeHatches = hasRCA && !hasWorkflows && message.phase === "decision";
  const hasApproval = !!message.approvalRequest;

  return (
    <div className="flex justify-start animate-fade-in">
      <div className="w-full space-y-2">
        {/* 1. Non-decision agent messages: render as markdown bubble */}
        {!hasWorkflows && !hasRCA && hasContent && (
          <div className="bg-kubernaut-teal-50 rounded-2xl px-4 py-3 max-w-[85%]">
            <MarkdownContent text={message.text.trimEnd()} />
            {message.isStreaming && <StreamingCursor />}
          </div>
        )}

        {/* 2. Agent CTA (teal recommendation text -- renders once workflows are present, suppressed when RCA card handles display) */}
        {hasWorkflows && !hasRCA && hasContent && (
          <AgentCTA text={message.text} />
        )}

        {/* 3. Thinking Panel (collapsible, below reply) */}
        {hasThinking && (
          <ThinkingPanel
            entries={message.thinking!}
            isActive={message.isStreaming ?? false}
            startTime={investigationStartTime}
            label={message.thinkingLabel}
          />
        )}

        {/* 4. RCA Card (only when investigation has produced meaningful results) */}
        {hasRCA && hasRCAData && (
          <RCACard rca={message.rca!} />
        )}

        {/* 5. Workflow Cards (expanded/collapsed states) */}
        {hasWorkflows && (
          <WorkflowCards
            options={message.workflowOptions!}
            onExecute={onExecuteWorkflow}
            onDismiss={onDismiss}
            onEscalate={onEscalate}
            recoverySignal={recoverySignal}
          />
        )}

        {/* 5b. Escape hatches when no workflows discovered but decision needed */}
        {showEscapeHatches && (
          <WorkflowCards
            options={[]}
            onDismiss={onDismiss}
            onEscalate={onEscalate}
            recoverySignal={recoverySignal}
          />
        )}

        {/* 6. Approval Card (when remediation requires human approval) */}
        {hasApproval && (
          <ApprovalCard
            request={message.approvalRequest!}
            resolution={message.approvalResolution}
            onApprove={(reason) => onApprove?.(message.approvalRequest!.name, reason)}
            onDecline={(reason) => onDecline?.(message.approvalRequest!.name, reason)}
            userName={userName}
          />
        )}

        {/* 7. Verification Timer (during stabilization window) */}
        {message.phase === "verifying" && message.stabilizationWindow && message.stabilizationWindow > 0 && (
          <VerificationTimer
            stabilizationWindow={message.stabilizationWindow}
          />
        )}

        {/* Loading indicator when streaming but no content yet */}
        {message.isStreaming && !hasContent && !hasThinking && (
          <TypingIndicator />
        )}

        {/* Timestamp */}
        {!message.isStreaming && message.timestamp && (
          <p className="text-[11px] text-text-dim ml-2 mt-0.5">
            {formatTime(message.timestamp)}
          </p>
        )}
      </div>
    </div>
  );
}
