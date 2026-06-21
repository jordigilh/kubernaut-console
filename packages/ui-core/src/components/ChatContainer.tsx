import { useContext, useEffect, useRef, useState, useCallback, useMemo, type FormEvent, type KeyboardEvent } from "react";
import { useChat, type ChatMessage, type ApprovalRequest } from "../hooks/useChat";
import { useRRStatus } from "../hooks/useRRStatus";
import { callMcpTool, type McpClientOptions } from "../lib/mcp-client";
import { emitAuditEvent } from "../lib/audit";
import { isPastDecisionPhase, isWorkflowResolved, markWorkflowResolved } from "../lib/session-state";
import { isInvestigationEngaged } from "../lib/query-intent";
import { maxChatPhase } from "../lib/phase-rank";
import { AuthContext } from "../providers/auth";
import { ConfigContext } from "../providers/config";
import { UserBubble } from "./UserBubble";
import { AgentBubble } from "./AgentBubble";
import { InvestigationContext } from "./InvestigationContext";
import { PhaseIndicator } from "./PhaseIndicator";
import { WelcomeState } from "./WelcomeState";

const PHASE_MAP: Record<string, ChatMessage["phase"]> = {
  Pending: "investigation", Processing: "investigation", Analyzing: "investigation", Investigating: "investigation",
  AwaitingApproval: "decision", Executing: "remediation", Verifying: "verifying",
  Blocked: "failed", Completed: "complete", Failed: "failed", TimedOut: "timed_out", Skipped: "complete", Cancelled: "complete",
};

export function ChatContainer() {
  const { messages, setMessages, isStreaming, error, setError, connectionStatus, sendMessage, cancelStream, clearHistory, investigationStartTime, currentPhase, setCurrentPhase } = useChat();
  const lastRca = messages.findLast(m => m.role === "agent" && m.rca)?.rca;
  const rrId = messages.findLast(m => m.role === "agent" && m.rrId)?.rrId ?? lastRca?.rrId;
  const investigationEngaged = isInvestigationEngaged(messages);
  const effectiveRrId = investigationEngaged ? rrId : undefined;
  const { statusPhase, statusConnection, statusMetadata } = useRRStatus(effectiveRrId);
  const lastAgentPhase = messages.findLast(m => m.role === "agent" && m.phase)?.phase;
  const chatPhase = currentPhase ?? lastAgentPhase;
  const statusMapped = statusPhase ? PHASE_MAP[statusPhase] : undefined;
  const rawBannerPhase = maxChatPhase(statusMapped, chatPhase) ?? chatPhase;
  const workflowResolved = isWorkflowResolved(rrId);
  const bannerPhase = !investigationEngaged
    ? undefined
    : ((!statusPhase && !workflowResolved && rawBannerPhase === "decision") ? "investigation" : rawBannerPhase);
  const workflowActionTaken = workflowResolved || isPastDecisionPhase(bannerPhase);
  const alertName = messages.findLast(m => m.role === "agent" && m.alertName)?.alertName
    ?? lastRca?.signalName
    ?? (statusMetadata?.alert_name as string | undefined)
    ?? (statusMetadata?.signal_name as string | undefined);
  const namespace = messages.findLast(m => m.role === "agent" && m.namespace)?.namespace
    ?? lastRca?.namespace
    ?? (statusMetadata?.namespace as string | undefined)
    ?? (statusMetadata?.target_namespace as string | undefined);
  const resource = messages.findLast(m => m.role === "agent" && m.resource)?.resource
    ?? lastRca?.target
    ?? (statusMetadata?.target as string | undefined)
    ?? (statusMetadata?.resource as string | undefined);
  const cluster = (statusMetadata?.cluster as string | undefined);
  const recoverySignal = messages.findLast(m => m.role === "agent" && m.recoverySignal)?.recoverySignal ?? null;
  const authCtx = useContext(AuthContext);
  const configCtx = useContext(ConfigContext);
  const user = authCtx?.user ?? { name: "", email: "", initials: "??" };
  const mcpOptions: McpClientOptions = useMemo(() => ({
    baseUrl: configCtx?.backendUrl,
    getToken: authCtx?.provider ? () => authCtx.provider.getToken() : undefined,
  }), [configCtx, authCtx]);
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const userScrolledUpRef = useRef(false);
  const programmaticScrollRef = useRef(false);

  const [clearConfirmOpen, setClearConfirmOpen] = useState(false);

  const handleScroll = () => {
    if (programmaticScrollRef.current) return;
    const el = scrollRef.current;
    if (!el) return;
    const threshold = 80;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < threshold;
    userScrolledUpRef.current = !nearBottom;
  };

  useEffect(() => {
    if (userScrolledUpRef.current) return;
    const el = scrollRef.current;
    if (!el) return;
    programmaticScrollRef.current = true;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    setTimeout(() => { programmaticScrollRef.current = false; }, 400);
  }, [messages]);

  const [approvalDenied, setApprovalDenied] = useState(false);
  const approvalFetchedRef = useRef<string | null>(null);

  useEffect(() => {
    if (statusPhase !== "AwaitingApproval") {
      return;
    }

    const rarName = (statusMetadata?.approval_request_name as string) ?? undefined;
    if (!rarName || approvalFetchedRef.current === rarName) return;
    approvalFetchedRef.current = rarName;

    callMcpTool("kubernaut_get_approval_request", { rar_id: rarName }, mcpOptions).then((res) => {
      if (res.error) {
        setApprovalDenied(true);
        return;
      }
      const rawResult = res.result as { content?: Array<{ type: string; text: string }> } | Record<string, unknown>;
      let parsed: Record<string, unknown>;
      if ("content" in rawResult && Array.isArray(rawResult.content)) {
        const textEntry = rawResult.content.find((c: { type: string; text: string }) => c.type === "text");
        try {
          parsed = textEntry?.text ? JSON.parse(textEntry.text) : {};
        } catch {
          parsed = {};
        }
      } else {
        parsed = rawResult as Record<string, unknown>;
      }
      const spec = (parsed.spec as Record<string, unknown>) ?? undefined;
      const data = spec ?? parsed;
      const meta = parsed.metadata as Record<string, unknown> | undefined;
      const approvalData: ApprovalRequest = {
        name: (meta?.name as string) ?? (data.name as string) ?? rarName,
        namespace: (meta?.namespace as string) ?? (data.namespace as string) ?? undefined,
        remediationRequestName: (data.remediationRequestRef as { name?: string })?.name
          ?? (data.remediation_request as string) ?? (data.remediationRequest as string) ?? undefined,
        confidence: (data.confidence as number) ?? 0,
        confidenceLevel: (data.confidence_level as string) ?? (data.confidenceLevel as string) ?? "Medium",
        reason: (data.reason as string) ?? (data.whyApprovalRequired as string)
          ?? (data.why_approval_required as string) ?? "Workflow execution requires human approval.",
        whyApprovalRequired: (data.whyApprovalRequired as string) ?? (data.why_approval_required as string) ?? undefined,
        recommendedWorkflow: (data.recommendedWorkflow ?? data.recommended_workflow) as ApprovalRequest["recommendedWorkflow"],
        investigationSummary: (data.investigationSummary as string) ?? (data.investigation_summary as string) ?? undefined,
        evidenceCollected: (data.evidenceCollected ?? data.evidence_collected) as string[] | undefined,
        policyEvaluation: (data.policyEvaluation ?? data.policy_evaluation) as ApprovalRequest["policyEvaluation"],
        requiredBy: (data.requiredBy as string) ?? (data.required_by as string) ?? new Date(Date.now() + 300_000).toISOString(),
      };
      setMessages((prev) => {
        const alreadyHasApproval = prev.some((m) => m.approvalRequest?.name === approvalData.name);
        if (alreadyHasApproval) return prev;
        return [...prev, {
          id: `approval-${rarName}`,
          role: "agent" as const,
          text: "",
          timestamp: Date.now(),
          approvalRequest: approvalData,
        }];
      });
    });
  }, [statusPhase, statusMetadata, setMessages, mcpOptions]);

  useEffect(() => {
    if (statusPhase && PHASE_MAP[statusPhase]) {
      const mapped = PHASE_MAP[statusPhase];
      setCurrentPhase((prev) => maxChatPhase(prev, mapped) ?? mapped);
    }
  }, [statusPhase, setCurrentPhase]);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text) return;
    setInput("");
    if (inputRef.current) inputRef.current.style.height = "auto";
    userScrolledUpRef.current = false;
    sendMessage(text);
    requestAnimationFrame(() => {
      const el = scrollRef.current;
      if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    });
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      const text = input.trim();
      if (!text) return;
      setInput("");
      if (inputRef.current) inputRef.current.style.height = "auto";
      sendMessage(text);
    }
  };

  const handleSuggest = useCallback(
    (text: string) => {
      sendMessage(text);
    },
    [sendMessage],
  );

  const handleExecuteWorkflow = useCallback(
    async (workflowId: string) => {
      if (!rrId) {
        setError("Cannot select workflow: no active remediation request found.");
        return;
      }
      if (workflowActionTaken) {
        setError("Workflow action already taken for this remediation.");
        return;
      }
      const res = await callMcpTool("kubernaut_select_workflow", {
        rr_id: rrId,
        workflow_id: workflowId,
      }, mcpOptions);
      if (res.error) {
        setError(res.error.message);
        return;
      }
      markWorkflowResolved(rrId);
      setCurrentPhase((prev) => maxChatPhase(prev, "remediation") ?? "remediation");
      const resBody = res.result as { phase?: string } | undefined;
      if (resBody?.phase && PHASE_MAP[resBody.phase]) {
        const mapped = PHASE_MAP[resBody.phase];
        setCurrentPhase((prev) => maxChatPhase(prev, mapped) ?? mapped);
      }
      emitAuditEvent({ action: "execute_workflow", timestamp: new Date().toISOString(), user: user.name || user.email, rrId, detail: { workflowId } });
    },
    [rrId, workflowActionTaken, setCurrentPhase, setError, user.name, user.email, mcpOptions],
  );

  const handleApprove = useCallback(
    async (rarName: string, reason: string) => {
      const res = await callMcpTool("kubernaut_approve", {
        rar_name: rarName,
        decision: "Approved",
        reason,
      }, mcpOptions);
      if (res.error) {
        setError(res.error.message);
        return;
      }
      setMessages((prev) => prev.map((msg) =>
        msg.approvalRequest?.name === rarName
          ? { ...msg, approvalResolution: { name: rarName, decision: "Approved" as const, decidedBy: user.name || user.email } }
          : msg,
      ));
      emitAuditEvent({ action: "approve", timestamp: new Date().toISOString(), user: user.name || user.email, rrId, detail: { rarName, reason } });
    },
    [setMessages, setError, rrId, user.name, user.email, mcpOptions],
  );

  const handleDecline = useCallback(
    async (rarName: string, reason: string) => {
      const res = await callMcpTool("kubernaut_approve", {
        rar_name: rarName,
        decision: "Rejected",
        reason,
      }, mcpOptions);
      if (res.error) {
        setError(res.error.message);
        return;
      }
      setMessages((prev) => prev.map((msg) =>
        msg.approvalRequest?.name === rarName
          ? { ...msg, approvalResolution: { name: rarName, decision: "Rejected" as const, decidedBy: user.name || user.email } }
          : msg,
      ));
      setCurrentPhase("failed");
      emitAuditEvent({ action: "decline", timestamp: new Date().toISOString(), user: user.name || user.email, rrId, detail: { rarName, reason } });
    },
    [setMessages, setCurrentPhase, setError, rrId, user.name, user.email, mcpOptions],
  );

  const handleDismiss = useCallback(
    async () => {
      if (!rrId) {
        setError("Cannot dismiss: no active remediation request found.");
        return;
      }
      if (workflowActionTaken) {
        setError("Workflow action already taken for this remediation.");
        return;
      }
      const res = await callMcpTool("kubernaut_complete_no_action", {
        rr_id: rrId,
        reason: "Dismissed by operator: no action needed",
      }, mcpOptions);
      if (res.error) {
        setError(res.error.message);
        return;
      }
      markWorkflowResolved(rrId);
      setMessages((prev) => [...prev, {
        id: `msg-${Date.now()}`,
        role: "agent" as const,
        text: "Investigation dismissed. No remediation action taken.",
        timestamp: Date.now(),
      }]);
      setCurrentPhase("complete");
      emitAuditEvent({ action: "dismiss", timestamp: new Date().toISOString(), user: user.name || user.email, rrId });
    },
    [rrId, workflowActionTaken, setMessages, setCurrentPhase, setError, user.name, user.email, mcpOptions],
  );

  const handleEscalate = useCallback(async (reason: string) => {
    if (!rrId) {
      setError("Cannot escalate: no active remediation request found.");
      return;
    }
    if (workflowActionTaken) {
      setError("Workflow action already taken for this remediation.");
      return;
    }
    const res = await callMcpTool("kubernaut_complete_no_action", {
      rr_id: rrId,
      reason: "Escalated by operator",
      escalation_reason: reason,
    }, mcpOptions);
    if (res.error) {
      setError(res.error.message);
      return;
    }
    markWorkflowResolved(rrId);
    setMessages((prev) => [...prev, {
      id: `msg-${Date.now()}`,
      role: "agent" as const,
      text: `Escalated to team: "${reason}"`,
      timestamp: Date.now(),
    }]);
    setCurrentPhase("complete");
    emitAuditEvent({ action: "escalate", timestamp: new Date().toISOString(), user: user.name || user.email, rrId, detail: { escalation_reason: reason } });
  }, [rrId, workflowActionTaken, setMessages, setCurrentPhase, setError, user.name, user.email, mcpOptions]);

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
        {effectiveRrId && statusConnection === "reconnecting" && (
          <span style={{ fontSize: "0.75rem", color: "#fef08a", animation: "kn-pulse 2s infinite" }} role="status">Status reconnecting...</span>
        )}
        {effectiveRrId && statusConnection === "error" && (
          <span style={{ fontSize: "0.75rem", color: "#fecaca" }} role="status">Status stream lost</span>
        )}
        {effectiveRrId && statusConnection === "not_found" && (
          <span style={{ fontSize: "0.75rem", color: "#fecaca" }} role="status">Status unavailable</span>
        )}
        {connectionStatus === "reconnecting" && (
          <span style={{ fontSize: "0.75rem", color: "#fef08a", animation: "kn-pulse 2s infinite" }} role="status">Chat reconnecting...</span>
        )}
        {connectionStatus === "lost" && (
          <span style={{ fontSize: "0.75rem", color: "#fecaca" }} role="status">Chat connection lost</span>
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
        rrId={investigationEngaged ? rrId : undefined}
        alertName={alertName}
        namespace={namespace}
        resource={resource}
        cluster={cluster}
      />

      {/* Messages */}
      <main
        ref={scrollRef}
        onScroll={handleScroll}
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
                workflowActionTaken={workflowActionTaken}
              />
            ),
          )
        )}
      </main>

      {/* Live status announcements (screen reader only) */}
      <div aria-live="polite" aria-atomic="true" className="kn-sr-only">
        {isStreaming && "Agent is responding"}
        {connectionStatus === "reconnecting" && "Chat stream reconnecting"}
        {connectionStatus === "lost" && "Chat connection lost"}
        {effectiveRrId && statusConnection === "reconnecting" && "Status stream reconnecting"}
        {effectiveRrId && statusConnection === "error" && "Status stream lost"}
        {effectiveRrId && statusConnection === "not_found" && "Status unavailable"}
      </div>

      {approvalDenied && (
        <div className="kn-approval-denied" style={{ padding: "0.5rem 1rem" }}>
          <div className="kn-approval-denied-card">
            <strong>Approval Required</strong>
            <p>You don't have permission to view the details of this approval request. Contact a team member with the approver role.</p>
          </div>
        </div>
      )}

      <PhaseIndicator
        phase={bannerPhase}
        phaseMetadata={statusMetadata}
        isActive={isStreaming || (bannerPhase !== "investigation" && bannerPhase !== undefined)}
      />

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
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              e.target.style.height = "auto";
              e.target.style.height = `${Math.min(e.target.scrollHeight, 128)}px`;
            }}
            placeholder={isStreaming ? "Type to interrupt..." : currentPhase === "complete" ? "Investigation closed — ask a follow-up question..." : "Send a message..."}
            aria-label="Type your message"
            className="kn-input-field"
            rows={1}
            onKeyDown={handleKeyDown}
          />
          {isStreaming && currentPhase !== "verifying" && !input.trim() ? (
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
