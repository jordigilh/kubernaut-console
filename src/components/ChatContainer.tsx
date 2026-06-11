import { useEffect, useRef, useState, useCallback, type FormEvent } from "react";
import { useChat } from "../hooks/useChat";
import { useAlerts } from "../hooks/useAlerts";
import { UserBubble } from "./UserBubble";
import { AgentBubble } from "./AgentBubble";
import { AlertBanner } from "./AlertBanner";
import { WelcomeState } from "./WelcomeState";

export function ChatContainer() {
  const { messages, isStreaming, error, connectionStatus, sendMessage, cancelStream, clearHistory } = useChat();
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

  const handleSelectWorkflow = useCallback(
    (name: string) => {
      if (!isStreaming) {
        sendMessage(`Use ${name}`);
      }
    },
    [isStreaming, sendMessage],
  );

  return (
    <div className="flex flex-col h-full bg-white rounded-none sm:rounded-2xl overflow-hidden shadow-2xl">
      {/* Header */}
      <header className="bg-gradient-to-r from-kubernaut-teal-700 to-kubernaut-teal-600 px-4 sm:px-6 py-3 flex items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/20" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5 text-white">
            <path
              d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-white font-semibold text-sm">
            Kubernaut Console
          </h1>
          <p className="text-teal-200 text-xs hidden sm:block">AIOps for Kubernetes</p>
        </div>
        {connectionStatus === "reconnecting" && (
          <span className="text-xs text-yellow-200 animate-pulse" role="status">Reconnecting...</span>
        )}
        {/* User menu */}
        <div className="flex items-center gap-2">
          {messages.length > 0 && (
            <button
              type="button"
              onClick={clearHistory}
              className="text-xs text-white/60 hover:text-white transition-colors"
              aria-label="Clear conversation history"
              title="New conversation"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
            </button>
          )}
          <a
            href="/oauth2/sign_out"
            className="flex h-7 w-7 items-center justify-center rounded-full bg-white/20 text-white text-xs font-bold hover:bg-white/30 transition-colors"
            title="Sign out"
            aria-label="Sign out"
          >
            U
          </a>
        </div>
      </header>

      <AlertBanner alert={alert} />

      {/* Messages */}
      <main
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-3 sm:px-4 py-4 space-y-3"
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
                onSelectWorkflow={handleSelectWorkflow}
              />
            ),
          )
        )}
      </main>

      {/* Error */}
      {error && (
        <div className="mx-4 mb-2 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700" role="alert">
          {error}
        </div>
      )}

      {/* Input */}
      <form
        onSubmit={handleSubmit}
        className="border-t border-gray-100 px-3 sm:px-4 py-3 flex gap-2 sm:gap-3"
        aria-label="Message input"
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={isStreaming ? "Agent is responding..." : "Ask about an alert..."}
          disabled={isStreaming}
          aria-label="Type your message"
          className="flex-1 px-4 py-2 rounded-lg border border-gray-200 bg-gray-50 text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-kubernaut-teal-600/30 focus:border-kubernaut-teal-600 disabled:opacity-50"
        />
        {isStreaming ? (
          <button
            type="button"
            onClick={cancelStream}
            className="px-4 py-2 rounded-lg bg-red-100 text-red-700 text-sm font-medium hover:bg-red-200 transition-colors"
            aria-label="Stop agent response"
          >
            Stop
          </button>
        ) : (
          <button
            type="submit"
            disabled={!input.trim()}
            className="px-5 py-2 rounded-lg bg-kubernaut-teal-600 text-white text-sm font-medium hover:bg-kubernaut-teal-700 disabled:opacity-40 transition-colors"
            aria-label="Send message"
          >
            Send
          </button>
        )}
      </form>
    </div>
  );
}
