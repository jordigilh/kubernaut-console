import type { ChatMessage } from "../hooks/useChat";
import { ThinkingPanel } from "./ThinkingPanel";
import { RCACard } from "./RCACard";
import { AgentCTA } from "./AgentCTA";
import { WorkflowCards } from "./WorkflowCards";
import { ExecutionProgress } from "./ExecutionProgress";
import { MarkdownContent } from "./MarkdownContent";
import { StreamingCursor } from "./StreamingCursor";
import { TypingIndicator } from "./TypingIndicator";

interface Props {
  message: ChatMessage;
  investigationStartTime?: number;
  onExecuteWorkflow?: (workflowId: string) => void;
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function AgentBubble({ message, investigationStartTime, onExecuteWorkflow }: Props) {
  const hasContent = message.text.trim().length > 0;
  const hasThinking = message.thinking && message.thinking.length > 0;
  const hasRCA = !!message.rca;
  const hasWorkflows = message.workflowOptions && message.workflowOptions.length > 0;
  const hasExecution = message.executionSteps && message.executionSteps.length > 0;

  return (
    <div className="flex justify-start animate-fade-in">
      <div className="w-full space-y-2">
        {/* 1. Non-decision agent messages: render as markdown bubble */}
        {!hasWorkflows && hasContent && (
          <div className="bg-kubernaut-teal-50 rounded-2xl px-4 py-3 max-w-[85%]">
            <MarkdownContent text={message.text} />
            {message.isStreaming && <StreamingCursor />}
          </div>
        )}

        {/* 2. Agent CTA (teal recommendation text -- renders once workflows are present) */}
        {hasWorkflows && hasContent && (
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

        {/* 4. RCA Card (after investigation completes) */}
        {hasRCA && (
          <RCACard rca={message.rca!} />
        )}

        {/* 5. Workflow Cards (expanded/collapsed states) */}
        {hasWorkflows && (
          <WorkflowCards
            options={message.workflowOptions!}
            onExecute={onExecuteWorkflow}
          />
        )}

        {/* 6. Execution progress (post-decision) */}
        {hasExecution && (
          <ExecutionProgress
            steps={message.executionSteps!}
            completed={message.executionComplete ?? false}
          />
        )}

        {/* Loading indicator when streaming but no content yet */}
        {message.isStreaming && !hasContent && !hasThinking && (
          <TypingIndicator />
        )}

        {/* Timestamp */}
        {!message.isStreaming && message.timestamp && (
          <p className="text-[10px] text-text-dim ml-2 mt-0.5">
            {formatTime(message.timestamp)}
          </p>
        )}
      </div>
    </div>
  );
}
