import { useEffect, useRef, useState, useCallback, type FormEvent } from "react";
import { useChat } from "../hooks/useChat";
import { useUser } from "../hooks/useUser";
import { callMcpTool } from "../lib/mcp-client";
import { emitAuditEvent } from "../lib/audit";
import { UserBubble } from "./UserBubble";
import { AgentBubble } from "./AgentBubble";
import { InvestigationContext } from "./InvestigationContext";
import { WelcomeState } from "./WelcomeState";
import { Modal } from "./Modal";

export function ChatContainer() {
  const { messages, isStreaming, error, setError, connectionStatus, sendMessage, cancelStream, clearHistory, investigationStartTime } = useChat();
  const currentPhase = messages.findLast(m => m.role === "agent" && m.phase)?.phase;
  const lastRca = messages.findLast(m => m.role === "agent" && m.rca)?.rca;
  const rrId = messages.findLast(m => m.role === "agent" && m.rrId)?.rrId ?? lastRca?.rrId;
  const alertName = messages.findLast(m => m.role === "agent" && m.alertName)?.alertName ?? lastRca?.signalName;
  const namespace = messages.findLast(m => m.role === "agent" && m.namespace)?.namespace ?? lastRca?.namespace;
  const resource = messages.findLast(m => m.role === "agent" && m.resource)?.resource ?? lastRca?.target;
  console.debug("[ChatContainer] banner values:", { rrId, alertName, namespace, resource, currentPhase });
  const recoverySignal = messages.findLast(m => m.role === "agent" && m.recoverySignal)?.recoverySignal ?? null;
  const user = useUser();
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const [clearConfirmOpen, setClearConfirmOpen] = useState(false);

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
    async (workflowId: string) => {
      if (!rrId) {
        setError("Cannot select workflow: no active remediation request found.");
        return;
      }
      const res = await callMcpTool("kubernaut_select_workflow", {
        rr_id: rrId,
        workflow_id: workflowId,
      });
      if (res.error) {
        setError(res.error.message);
        return;
      }
      sendMessage(`Workflow ${workflowId} selected for execution.`, { silent: true });
      emitAuditEvent({ action: "execute_workflow", timestamp: new Date().toISOString(), user: user.name || user.email, rrId, detail: { workflowId } });
    },
    [rrId, sendMessage, setError, user.name, user.email],
  );

  const handleApprove = useCallback(
    async (rarName: string, reason: string) => {
      const res = await callMcpTool("kubernaut_approve", {
        rar_name: rarName,
        decision: "Approved",
        reason,
      });
      if (res.error) {
        setError(res.error.message);
        return;
      }
      sendMessage("The remediation has been approved. Continue monitoring.", { silent: true });
      emitAuditEvent({ action: "approve", timestamp: new Date().toISOString(), user: user.name || user.email, rrId, detail: { rarName, reason } });
    },
    [sendMessage, setError, rrId, user.name, user.email],
  );

  const handleDecline = useCallback(
    async (rarName: string, reason: string) => {
      const res = await callMcpTool("kubernaut_approve", {
        rar_name: rarName,
        decision: "Rejected",
        reason,
      });
      if (res.error) {
        setError(res.error.message);
        return;
      }
      sendMessage("The remediation has been rejected.", { silent: true });
      emitAuditEvent({ action: "decline", timestamp: new Date().toISOString(), user: user.name || user.email, rrId, detail: { rarName, reason } });
    },
    [sendMessage, setError, rrId, user.name, user.email],
  );

  const handleDismiss = useCallback(
    async () => {
      if (!rrId) {
        setError("Cannot dismiss: no active remediation request found.");
        return;
      }
      const res = await callMcpTool("kubernaut_complete_no_action", {
        rr_id: rrId,
        reason: "Dismissed by operator: no action needed",
      });
      if (res.error) {
        setError(res.error.message);
        return;
      }
      sendMessage("Investigation dismissed. No remediation action taken.", { silent: true });
      emitAuditEvent({ action: "dismiss", timestamp: new Date().toISOString(), user: user.name || user.email, rrId });
    },
    [rrId, sendMessage, setError, user.name, user.email],
  );

  const handleEscalate = useCallback(async (reason: string) => {
    if (!rrId) {
      setError("Cannot escalate: no active remediation request found.");
      return;
    }
    const res = await callMcpTool("kubernaut_complete_no_action", {
      rr_id: rrId,
      reason: "Escalated by operator",
      escalation_reason: reason,
    });
    if (res.error) {
      setError(res.error.message);
      return;
    }
    sendMessage("Investigation escalated to team for manual review.", { silent: true });
    emitAuditEvent({ action: "escalate", timestamp: new Date().toISOString(), user: user.name || user.email, rrId, detail: { escalation_reason: reason } });
  }, [rrId, sendMessage, setError, user.name, user.email]);

  const handleClearHistory = useCallback(() => {
    if (messages.length === 0) {
      clearHistory();
      setError(null);
    } else {
      setClearConfirmOpen(true);
    }
  }, [messages.length, clearHistory, setError]);

  const confirmClear = useCallback(() => {
    setClearConfirmOpen(false);
    clearHistory();
    setError(null);
    emitAuditEvent({ action: "clear_history", timestamp: new Date().toISOString(), user: user.name || user.email, rrId });
  }, [clearHistory, setError, user.name, user.email, rrId]);

  return (
    <div className="flex flex-col h-full bg-white rounded-none sm:rounded-2xl overflow-hidden border border-border shadow-sm">
      <a href="#chat-input" className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:px-3 focus:py-1 focus:bg-kubernaut-teal-600 focus:text-white focus:rounded-md focus:text-xs">
        Skip to chat input
      </a>
      {/* Header */}
      <header className="bg-kubernaut-teal-600 px-4 sm:px-6 py-3 flex items-center gap-3 rounded-t-none sm:rounded-t-2xl">
        <img src="/logo.svg" alt="Kubernaut" className="h-7 w-7 rounded-md" />
        <h1 className="text-white font-semibold text-sm font-display flex-1 min-w-0">
          Kubernaut Console
        </h1>
        {connectionStatus === "reconnecting" && (
          <span className="text-xs text-yellow-200 animate-pulse" role="status">Reconnecting...</span>
        )}
        {connectionStatus === "lost" && (
          <button
            type="button"
            onClick={() => sendMessage("", { silent: true })}
            className="text-xs text-red-200 hover:text-white font-medium transition-colors"
            role="status"
            aria-label="Connection lost. Click to retry."
          >
            Connection lost — tap to retry
          </button>
        )}
        <button
          type="button"
          onClick={handleClearHistory}
          className="text-white/70 hover:text-white transition-colors focus-visible:ring-2 focus-visible:ring-white/50 rounded p-1"
          aria-label="New conversation"
          title="New conversation"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
            <path d="M5.433 13.917l1.262-3.155A4 4 0 017.58 9.42l6.92-6.918a2.121 2.121 0 013 3l-6.92 6.918c-.383.383-.84.685-1.343.886l-3.154 1.262a.5.5 0 01-.65-.65z" />
            <path d="M3.5 5.75c0-.69.56-1.25 1.25-1.25h5.5a.75.75 0 000-1.5h-5.5A2.75 2.75 0 002 5.75v8.5A2.75 2.75 0 004.75 17h8.5A2.75 2.75 0 0016 14.25v-5.5a.75.75 0 00-1.5 0v5.5c0 .69-.56 1.25-1.25 1.25h-8.5c-.69 0-1.25-.56-1.25-1.25v-8.5z" />
          </svg>
        </button>
        <a
          href="/oauth2/sign_out"
          className="flex h-6 w-6 items-center justify-center rounded-full bg-white/20 text-white text-[11px] font-semibold hover:bg-white/30 transition-colors focus-visible:ring-2 focus-visible:ring-white/50"
          title={user.name || user.email || "Sign out"}
          aria-label="Sign out"
        >
          {user.initials}
        </a>
      </header>

      <InvestigationContext
        rrId={rrId}
        alertName={alertName}
        namespace={namespace}
        resource={resource}
        phase={currentPhase}
      />

      {/* Messages */}
      <main
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-4 sm:px-5 py-4 space-y-3"
        role="log"
        aria-label="Conversation"
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
                onApprove={handleApprove}
                onDecline={handleDecline}
                onDismiss={handleDismiss}
                onEscalate={handleEscalate}
                userName={user.name || user.email}
                recoverySignal={recoverySignal}
              />
            ),
          )
        )}
      </main>

      {/* Live status announcements (screen reader only) */}
      <div aria-live="polite" aria-atomic="true" className="sr-only">
        {isStreaming && "Agent is responding"}
        {connectionStatus === "reconnecting" && "Reconnecting to server"}
        {connectionStatus === "lost" && "Connection lost"}
      </div>

      {/* Error */}
      {error && (
        <div className="mx-4 mb-2 rounded-md bg-kubernaut-red-50 px-3 py-2 text-xs text-kubernaut-red-600" role="alert">
          {error}
        </div>
      )}

      {/* Input Bar */}
      <form
        id="chat-input"
        onSubmit={handleSubmit}
        className="px-4 sm:px-5 py-3"
        aria-label="Message input"
      >
        <div
          className="flex items-center gap-2 rounded-full border border-border bg-surface px-4 py-2.5 cursor-text has-[:focus]:ring-2 has-[:focus]:ring-kubernaut-teal-600 has-[:focus]:border-kubernaut-teal-600 transition-colors"
          data-focus-delegate
          onClick={(e) => {
            if ((e.target as HTMLElement).tagName !== "BUTTON") {
              inputRef.current?.focus();
            }
          }}
        >
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={isStreaming && currentPhase !== "verifying" ? "Agent is responding..." : "Ask a follow-up or start a new investigation..."}
            disabled={isStreaming && currentPhase !== "verifying"}
            aria-label="Type your message"
            className="flex-1 bg-transparent text-sm text-text-primary placeholder:text-text-dim appearance-none disabled:opacity-50"
            style={{ border: "none", outline: "none", boxShadow: "none" }}
          />
          {isStreaming && currentPhase !== "verifying" ? (
            <button
              type="button"
              onClick={cancelStream}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-kubernaut-red-600 text-white shrink-0 hover:bg-kubernaut-red-700 transition-colors focus-visible:ring-2 focus-visible:ring-kubernaut-red-600 focus-visible:ring-offset-2"
              aria-label="Stop agent response"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true">
                <rect x="2" y="2" width="8" height="8" rx="1" />
              </svg>
            </button>
          ) : (
            <button
              type="submit"
              disabled={!input.trim()}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-kubernaut-teal-600 text-white shrink-0 disabled:opacity-40 hover:bg-kubernaut-teal-700 transition-colors focus-visible:ring-2 focus-visible:ring-kubernaut-teal-600 focus-visible:ring-offset-2"
              aria-label="Send message"
            >
              <svg className="w-4 h-4" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M7 12V2M3 6l4-4 4 4" />
              </svg>
            </button>
          )}
        </div>
      </form>

      {/* Clear History Confirmation Modal */}
      <Modal open={clearConfirmOpen} onClose={() => setClearConfirmOpen(false)} title="Start new conversation?">
        <p className="text-xs text-text-secondary mb-4">Current history will be cleared. This cannot be undone.</p>
        <div className="flex gap-2 justify-end">
          <button
            type="button"
            onClick={() => setClearConfirmOpen(false)}
            className="px-3 py-1.5 rounded-md border border-border text-xs text-text-secondary hover:bg-surface-secondary transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={confirmClear}
            className="px-3 py-1.5 rounded-md bg-kubernaut-red-600 text-white text-xs font-semibold hover:bg-kubernaut-red-700 transition-colors"
          >
            Clear history
          </button>
        </div>
      </Modal>
    </div>
  );
}
