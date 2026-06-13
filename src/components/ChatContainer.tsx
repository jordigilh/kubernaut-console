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
  const rrId = messages.findLast(m => m.role === "agent" && m.rrId)?.rrId;
  const lastRca = messages.findLast(m => m.role === "agent" && m.rca)?.rca;
  const recoverySignal = messages.findLast(m => m.role === "agent" && m.recoverySignal)?.recoverySignal ?? null;
  const user = useUser();
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const [escalateModalOpen, setEscalateModalOpen] = useState(false);
  const [escalateReason, setEscalateReason] = useState("");
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
    (workflowId: string) => {
      if (!isStreaming) {
        sendMessage(`Use ${workflowId}`, { silent: true });
        emitAuditEvent({ action: "execute_workflow", timestamp: new Date().toISOString(), user: user.name || user.email, rrId, detail: { workflowId } });
      }
    },
    [isStreaming, sendMessage, user.name, user.email, rrId],
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
      if (!rrId) return;
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

  const handleEscalate = useCallback(() => {
    if (!rrId) return;
    setEscalateReason("");
    setEscalateModalOpen(true);
  }, [rrId]);

  const submitEscalation = useCallback(async () => {
    if (!rrId || !escalateReason.trim()) return;
    setEscalateModalOpen(false);
    const res = await callMcpTool("kubernaut_complete_no_action", {
      rr_id: rrId,
      reason: "Escalated by operator",
      escalation_reason: escalateReason.trim(),
    });
    if (res.error) {
      setError(res.error.message);
      return;
    }
    sendMessage("Investigation escalated to team for manual review.", { silent: true });
    emitAuditEvent({ action: "escalate", timestamp: new Date().toISOString(), user: user.name || user.email, rrId, detail: { escalation_reason: escalateReason.trim() } });
  }, [rrId, escalateReason, sendMessage, setError, user.name, user.email]);

  const handleClearHistory = useCallback(() => {
    if (messages.length === 0) {
      clearHistory();
    } else {
      setClearConfirmOpen(true);
    }
  }, [messages.length, clearHistory]);

  const confirmClear = useCallback(() => {
    setClearConfirmOpen(false);
    clearHistory();
  }, [clearHistory]);

  return (
    <div className="flex flex-col h-full bg-white rounded-none sm:rounded-2xl overflow-hidden border border-border shadow-sm">
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
          className="text-white/70 hover:text-white text-[11px] font-medium transition-colors focus-visible:ring-2 focus-visible:ring-white/50 rounded px-1"
          aria-label="New conversation"
          title="New conversation"
        >
          + New
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

      {messages.length > 0 && (
        <InvestigationContext
          rrId={rrId}
          alertName={lastRca?.signalName}
          namespace={lastRca?.namespace}
          resource={lastRca?.target}
          phase={currentPhase}
        />
      )}

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
        onSubmit={handleSubmit}
        className="px-4 sm:px-5 py-3"
        aria-label="Message input"
      >
        <div className="flex items-center gap-2 rounded-full border border-border bg-surface px-4 py-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={isStreaming ? (currentPhase === "verifying" ? "Verification in progress..." : "Agent is responding...") : "Ask a follow-up or start a new investigation..."}
            disabled={isStreaming}
            aria-label="Type your message"
            className="flex-1 bg-transparent text-xs text-text-primary placeholder:text-text-dim focus:outline-none disabled:opacity-50"
          />
          {isStreaming ? (
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

      {/* Escalation Modal */}
      <Modal open={escalateModalOpen} onClose={() => setEscalateModalOpen(false)} title="Escalate to team">
        <label htmlFor="escalate-reason" className="block text-xs text-text-secondary mb-1">
          Escalation reason (required)
        </label>
        <input
          id="escalate-reason"
          type="text"
          value={escalateReason}
          onChange={(e) => setEscalateReason(e.target.value)}
          className="w-full rounded-md border border-border px-3 py-2 text-xs text-text-primary focus:outline-none focus:ring-2 focus:ring-kubernaut-teal-600 mb-3"
          placeholder="e.g., DBA team needed for schema migration"
          autoFocus
        />
        <div className="flex gap-2 justify-end">
          <button
            type="button"
            onClick={() => setEscalateModalOpen(false)}
            className="px-3 py-1.5 rounded-md border border-border text-xs text-text-secondary hover:bg-surface-secondary transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submitEscalation}
            disabled={!escalateReason.trim()}
            className="px-3 py-1.5 rounded-md bg-amber-600 text-white text-xs font-semibold hover:bg-amber-700 disabled:opacity-50 transition-colors"
          >
            Escalate
          </button>
        </div>
      </Modal>

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
