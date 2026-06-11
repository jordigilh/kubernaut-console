import { useEffect, useRef, useState, useCallback, type FormEvent } from "react";
import { useChat } from "../hooks/useChat";
import { useAlerts } from "../hooks/useAlerts";
import { UserBubble } from "./UserBubble";
import { AgentBubble } from "./AgentBubble";
import { AlertBanner } from "./AlertBanner";
import { WelcomeState } from "./WelcomeState";
import { PhaseIndicator } from "./PhaseIndicator";

export function ChatContainer() {
  const { messages, isStreaming, error, connectionStatus, sendMessage, cancelStream, clearHistory, investigationStartTime } = useChat();
  const currentPhase = messages.findLast(m => m.role === "agent" && m.phase)?.phase;
  const alert = useAlerts();
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages]);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text || isStreaming) return;
    setInput("");
    sendMessage(text);
  };

  const handleSuggest = useCallback(
    (text: string) => {
      if (!isStreaming) sendMessage(text);
    },
    [isStreaming, sendMessage],
  );

  const handleExecuteWorkflow = useCallback(
    (workflowId: string) => {
      if (!isStreaming) {
        sendMessage(`Use ${workflowId}`);
      }
    },
    [isStreaming, sendMessage],
  );

  const handleCancelExecution = useCallback(() => {
    sendMessage("Cancel execution");
  }, [sendMessage]);

  return (
    <div className="flex flex-col h-full bg-white rounded-none sm:rounded-2xl overflow-hidden border border-border shadow-sm">
      {/* Header */}
      <header className="bg-kubernaut-teal-600 px-4 sm:px-6 py-3 flex items-center gap-3 rounded-t-none sm:rounded-t-2xl">
        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-white/20" aria-hidden="true">
          <span className="text-white text-xs font-bold">K</span>
        </div>
        <h1 className="text-white font-semibold text-sm font-display flex-1 min-w-0">
          Kubernaut Console
        </h1>
        {connectionStatus === "reconnecting" && (
          <span className="text-xs text-yellow-200 animate-pulse" role="status">Reconnecting...</span>
        )}
        <PhaseIndicator phase={currentPhase} />
        <button
          type="button"
          onClick={clearHistory}
          className="text-white/70 hover:text-white text-[11px] font-medium transition-colors"
          aria-label="New conversation"
          title="New conversation"
        >
          + New
        </button>
        <a
          href="/oauth2/sign_out"
          className="flex h-6 w-6 items-center justify-center rounded-full bg-white/20 text-white text-[11px] font-semibold hover:bg-white/30 transition-colors"
          title="Sign out"
          aria-label="Sign out"
        >
          JG
        </a>
      </header>

      <AlertBanner alert={alert} />

      {/* Messages */}
      <main
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-4 sm:px-5 py-4 space-y-3"
        role="log"
        aria-label="Conversation"
        aria-live="polite"
      >
        {messages.length === 0 ? (
          <WelcomeState onSuggest={handleSuggest} />
        ) : (
          messages.map((msg) =>
            msg.role === "user" ? (
              <UserBubble key={msg.id} text={msg.text} timestamp={msg.timestamp} />
            ) : (
              <AgentBubble
                key={msg.id}
                message={msg}
                investigationStartTime={investigationStartTime}
                onExecuteWorkflow={handleExecuteWorkflow}
                onCancelExecution={handleCancelExecution}
              />
            ),
          )
        )}
      </main>

      {/* Error */}
      {error && (
        <div className="mx-4 mb-2 rounded-md bg-kubernaut-red-50 px-3 py-2 text-xs text-kubernaut-red-600" role="alert">
          {error}
        </div>
      )}

      {/* Input Bar */}
      <form
        onSubmit={handleSubmit}
        className="px-4 sm:px-5 py-3"
        aria-label="Message input"
      >
        <div className="flex items-center gap-2 rounded-full border border-border bg-surface px-4 py-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={isStreaming ? "Agent is responding..." : "Ask a follow-up or start a new investigation..."}
            disabled={isStreaming}
            aria-label="Type your message"
            className="flex-1 bg-transparent text-xs text-text-primary placeholder:text-text-dim focus:outline-none disabled:opacity-50"
          />
          {isStreaming ? (
            <button
              type="button"
              onClick={cancelStream}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-kubernaut-red-600 text-white shrink-0 hover:bg-red-700 transition-colors"
              aria-label="Stop agent response"
            >
              <svg className="w-3 h-3" viewBox="0 0 12 12" fill="currentColor">
                <rect x="2" y="2" width="8" height="8" rx="1" />
              </svg>
            </button>
          ) : (
            <button
              type="submit"
              disabled={!input.trim()}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-kubernaut-teal-600 text-white shrink-0 disabled:opacity-40 hover:bg-kubernaut-teal-700 transition-colors"
              aria-label="Send message"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M7 12V2M3 6l4-4 4 4" />
              </svg>
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
