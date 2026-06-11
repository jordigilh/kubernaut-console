import type { ChatMessage } from "../hooks/useChat";
import { ThinkingPanel } from "./ThinkingPanel";
import { WorkflowCards } from "./WorkflowCards";
import { ExecutionProgress } from "./ExecutionProgress";
import { MarkdownContent } from "./MarkdownContent";
import { StreamingCursor } from "./StreamingCursor";
import { TypingIndicator } from "./TypingIndicator";

interface Props {
  message: ChatMessage;
  onSelectWorkflow?: (name: string) => void;
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function AgentBubble({ message, onSelectWorkflow }: Props) {
  const hasContent = message.text.trim().length > 0;
  const hasThinking = message.thinking && message.thinking.length > 0;
  const hasWorkflows = message.workflowOptions && message.workflowOptions.length > 0;
  const hasExecution = message.executionSteps && message.executionSteps.length > 0;

  return (
    <div className="flex justify-start animate-fade-in">
      <div className="max-w-[85%] space-y-2">
        {hasThinking && (
          <ThinkingPanel
            entries={message.thinking!}
            isActive={message.isStreaming ?? false}
          />
        )}

        {hasContent && (
          <div className="bg-kubernaut-teal-50 rounded-2xl px-4 py-3">
            <MarkdownContent text={message.text} />
            {message.isStreaming && <StreamingCursor />}
          </div>
        )}

        {hasWorkflows && (
          <WorkflowCards
            options={message.workflowOptions!}
            onSelect={onSelectWorkflow}
          />
        )}

        {hasExecution && (
          <ExecutionProgress
            steps={message.executionSteps!}
            completed={message.executionComplete ?? false}
          />
        )}

        {message.isStreaming && !hasContent && !hasThinking && (
          <TypingIndicator />
        )}

        {!message.isStreaming && message.timestamp && (
          <p className="text-[10px] text-gray-400 ml-2 mt-0.5">
            {formatTime(message.timestamp)}
          </p>
        )}
      </div>
    </div>
  );
}
