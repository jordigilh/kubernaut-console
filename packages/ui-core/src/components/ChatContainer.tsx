import { useEffect, useRef, useState, useCallback, type FormEvent, type KeyboardEvent } from "react";
import { useChat } from "../hooks/useChat";
import { useUser } from "../hooks/useUser";
import { callMcpTool } from "../lib/mcp-client";
import { emitAuditEvent } from "../lib/audit";
import { UserBubble } from "./UserBubble";
import { AgentBubble } from "./AgentBubble";
import { InvestigationContext } from "./InvestigationContext";
import { WelcomeState } from "./WelcomeState";

export function ChatContainer() {
  const { messages, isStreaming, error, setError, connectionStatus, sendMessage, cancelStream, clearHistory, investigationStartTime, currentPhase } = useChat();
  const lastRca = messages.findLast(m => m.role === "agent" && m.rca)?.rca;
  const rrId = messages.findLast(m => m.role === "agent" && m.rrId)?.rrId ?? lastRca?.rrId;
  const alertName = messages.findLast(m => m.role === "agent" && m.alertName)?.alertName ?? lastRca?.signalName;
  const namespace = messages.findLast(m => m.role === "agent" && m.namespace)?.namespace ?? lastRca?.namespace;
  const resource = messages.findLast(m => m.role === "agent" && m.resource)?.resource ?? lastRca?.target;
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

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      const text = input.trim();
      if (!text || isStreaming) return;
      setInput("");
      sendMessage(text);
    }
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
    <div className="kn-chat">
      <a href="#chat-input" className="kn-sr-only">
        Skip to chat input
      </a>

      {/* Header */}
      <header className="kn-header">
        <img src="/logo.svg" alt="Kubernaut" style={{ height: 28, width: 28, borderRadius: 6 }} />
        <h1 className="kn-header-title">Kubernaut Console</h1>
        {connectionStatus === "reconnecting" && (
          <span style={{ fontSize: "0.75rem", color: "#fef08a", animation: "kn-pulse 2s infinite" }} role="status">Reconnecting...</span>
        )}
        {connectionStatus === "lost" && (
          <button
            type="button"
            onClick={() => sendMessage("", { silent: true })}
            style={{ fontSize: "0.75rem", color: "#fecaca", background: "none", border: "none", cursor: "pointer", fontWeight: 500 }}
            role="status"
            aria-label="Connection lost. Click to retry."
          >
            Connection lost — tap to retry
          </button>
        )}
        <button
          type="button"
          onClick={handleClearHistory}
          className="kn-header-btn"
          aria-label="New conversation"
          title="New conversation"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" style={{ width: 20, height: 20 }}>
            <path d="M5.433 13.917l1.262-3.155A4 4 0 017.58 9.42l6.92-6.918a2.121 2.121 0 013 3l-6.92 6.918c-.383.383-.84.685-1.343.886l-3.154 1.262a.5.5 0 01-.65-.65z" />
            <path d="M3.5 5.75c0-.69.56-1.25 1.25-1.25h5.5a.75.75 0 000-1.5h-5.5A2.75 2.75 0 002 5.75v8.5A2.75 2.75 0 004.75 17h8.5A2.75 2.75 0 0016 14.25v-5.5a.75.75 0 00-1.5 0v5.5c0 .69-.56 1.25-1.25 1.25h-8.5c-.69 0-1.25-.56-1.25-1.25v-8.5z" />
          </svg>
        </button>
        <a
          href="/oauth2/sign_out"
          className="kn-header-avatar"
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
        className="kn-messages"
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
      <div aria-live="polite" aria-atomic="true" className="kn-sr-only">
        {isStreaming && "Agent is responding"}
        {connectionStatus === "reconnecting" && "Reconnecting to server"}
        {connectionStatus === "lost" && "Connection lost"}
      </div>

      {/* Error */}
      {error && (
        <div className="kn-error" role="alert">{error}</div>
      )}

      {/* Input Bar */}
      <form
        id="chat-input"
        onSubmit={handleSubmit}
        className="kn-input-form"
        aria-label="Message input"
      >
        <div
          className="kn-input-wrapper"
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
            className="kn-input-field"
            onKeyDown={handleKeyDown}
          />
          {isStreaming && currentPhase !== "verifying" ? (
            <button
              type="button"
              onClick={cancelStream}
              className="kn-stop-btn"
              aria-label="Stop agent response"
            >
              <svg style={{ width: 14, height: 14 }} viewBox="0 0 12 12" fill="currentColor" aria-hidden="true">
                <rect x="2" y="2" width="8" height="8" rx="1" />
              </svg>
            </button>
          ) : (
            <button
              type="submit"
              disabled={!input.trim()}
              className="kn-send-btn"
              aria-label="Send message"
            >
              <svg style={{ width: 16, height: 16 }} viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M7 12V2M3 6l4-4 4 4" />
              </svg>
            </button>
          )}
        </div>
      </form>

      {/* Clear History Confirmation Modal */}
      {clearConfirmOpen && (
        <div className="kn-modal-backdrop" onClick={() => setClearConfirmOpen(false)}>
          <div className="kn-modal" onClick={(e) => e.stopPropagation()}>
            <h2>Start new conversation?</h2>
            <p style={{ fontSize: "0.75rem", color: "var(--kn-text-secondary)", marginBottom: "1rem" }}>
              Current history will be cleared. This cannot be undone.
            </p>
            <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
              <button
                type="button"
                onClick={() => setClearConfirmOpen(false)}
                style={{ padding: "0.375rem 0.75rem", borderRadius: "0.375rem", border: "1px solid var(--kn-border)", fontSize: "0.75rem", color: "var(--kn-text-secondary)", background: "none", cursor: "pointer" }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmClear}
                style={{ padding: "0.375rem 0.75rem", borderRadius: "0.375rem", background: "var(--kn-red-600)", color: "#fff", fontSize: "0.75rem", fontWeight: 600, border: "none", cursor: "pointer" }}
              >
                Clear history
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
