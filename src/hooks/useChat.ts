import { useCallback, useEffect, useRef, useState } from "react";
import { buildStreamRequest, streamA2A } from "../lib/a2a-client";
import { mockStreamA2A } from "../lib/a2a-mock";
import type { A2AEvent, DataPart, StatusUpdateEvent } from "../lib/a2a-types";

const USE_MOCK = import.meta.env.VITE_MOCK_A2A === "true";

export interface ThinkingEntry {
  id: string;
  type: "reasoning" | "status" | "investigation" | "preflight" | "tool_call";
  text: string;
}

export interface RCAData {
  severity: string;
  confidence: number;
  causalChain: string[];
  target: string;
  toolCallsCount: number;
  llmTurns: number;
  summary: string;
  rrId?: string;
  signalName?: string;
  namespace?: string;
}

export interface WorkflowOption {
  workflowId: string;
  name: string;
  description: string;
  risk?: string;
  recommended?: boolean;
  ruledOutReason?: string;
  parameters?: Record<string, string>;
}

export interface ApprovalRequest {
  name: string;
  namespace?: string;
  remediationRequestName?: string;
  confidence: number;
  confidenceLevel: string;
  reason: string;
  whyApprovalRequired?: string;
  recommendedWorkflow?: { workflowId: string; version: string; rationale: string };
  investigationSummary?: string;
  evidenceCollected?: string[];
  recommendedActions?: Array<{ action: string; rationale: string }>;
  alternativesConsidered?: Array<{ approach: string; prosCons: string }>;
  policyEvaluation?: { policyName: string; matchedRules: string[]; decision: string };
  requiredBy: string;
}

export interface ApprovalResolution {
  name: string;
  decision: "Approved" | "Rejected" | "Expired";
  decidedBy?: string;
  decidedAt?: string;
  decisionMessage?: string;
  workflowOverride?: { workflowName: string; parameters?: Record<string, string>; rationale?: string };
}

export interface AlignmentFinding {
  step_index: number;
  step_kind: string;
  tool: string;
  explanation: string;
}

export interface AlignmentVerdict {
  result: string;
  circuit_breaker_activated: boolean;
  summary: string;
  flagged: number;
  total: number;
  findings: AlignmentFinding[];
  grounding_review?: {
    grounded: boolean;
    explanation: string;
  } | null;
}

export interface ChatMessage {
  id: string;
  role: "user" | "agent";
  text: string;
  timestamp: number;
  thinking?: ThinkingEntry[];
  workflowOptions?: WorkflowOption[];
  rca?: RCAData;
  stabilizationWindow?: number;
  verifyingStartedAt?: number;
  isStreaming?: boolean;
  phase?: "investigation" | "decision" | "remediation" | "verifying" | "failed" | "complete";
  thinkingLabel?: string;
  approvalRequest?: ApprovalRequest;
  approvalResolution?: ApprovalResolution;
  rrId?: string;
  alertName?: string;
  namespace?: string;
  resource?: string;
  recoverySignal?: "problem_resolved" | "alignment_check_failed";
  alignmentVerdict?: AlignmentVerdict;
}

export type ConnectionStatus = "idle" | "connected" | "reconnecting" | "lost";

const STORAGE_KEY = "kubernaut-console-messages"; // pre-commit:allow-sensitive (storage key name)
const CONTEXT_KEY = "kubernaut-console-context"; // pre-commit:allow-sensitive (storage key name)

function loadMessages(): ChatMessage[] {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function saveMessages(messages: ChatMessage[]) {
  try {
    const toSave = messages.map((m) => ({
      ...m,
      isStreaming: false,
      thinking: m.thinking?.slice(-20),
    }));
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
  } catch {
    try {
      const trimmed = messages.slice(-10).map((m) => ({
        ...m,
        isStreaming: false,
        thinking: undefined,
      }));
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
    } catch {
      // Storage completely unavailable
    }
  }
}

function loadContextId(): string | undefined {
  return sessionStorage.getItem(CONTEXT_KEY) || undefined;
}

function saveContextId(id: string) {
  try {
    sessionStorage.setItem(CONTEXT_KEY, id);
  } catch {
    // Storage unavailable
  }
}

function friendlyError(raw: string): string {
  if (/fetch|network|ERR_CONNECTION/i.test(raw)) return "Unable to reach the server. Check your connection and try again.";
  if (/HTTP 5\d\d/i.test(raw)) return "The server encountered an error. Please try again in a moment.";
  if (/HTTP 401|HTTP 403|unauthorized/i.test(raw)) return "Your session has expired. Please sign in again.";
  if (/HTTP 429/i.test(raw)) return "Too many requests. Please wait a moment before trying again.";
  if (/timeout|aborted/i.test(raw)) return "The request timed out. Please try again.";
  if (/maximum retries/i.test(raw)) return "Connection lost after multiple retries. Please check your network.";
  return raw;
}

function parseDuration(value: string | number): number {
  if (typeof value === "number") return value;
  const match = value.match(/^(\d+)(s|m|h)?$/);
  if (!match) return 0;
  const num = parseInt(match[1], 10);
  const unit = match[2] || "s";
  if (unit === "m") return num * 60;
  if (unit === "h") return num * 3600;
  return num;
}

export function useChat() {
  const [messages, setMessages] = useState<ChatMessage[]>(loadMessages);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("idle");

  const contextIdRef = useRef<string | undefined>(loadContextId());
  const abortRef = useRef<AbortController | null>(null);
  const activeAgentMsgIdRef = useRef<string | null>(null);
  const thinkingRef = useRef<ThinkingEntry[]>([]);
  const artifactRef = useRef("");
  const messageIdRef = useRef(0);
  const lastSendRef = useRef(0);
  const terminalReceivedRef = useRef(false);
  const [investigationStartTime, setInvestigationStartTime] = useState<number | undefined>(undefined);

  useEffect(() => {
    if (!isStreaming) {
      saveMessages(messages);
    }
  }, [messages, isStreaming]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const nextId = () => `msg-${++messageIdRef.current}`;

  const sendMessage = useCallback(async (text: string, options?: { silent?: boolean }) => {
    const now = Date.now();
    if (now - lastSendRef.current < 500) return;
    lastSendRef.current = now;

    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }

    setError(null);

    if (!options?.silent) {
      const userMsg: ChatMessage = {
        id: nextId(),
        role: "user",
        text,
        timestamp: now,
      };
      setMessages((prev) => [...prev, userMsg]);
    }

    const agentMsgId = nextId();
    activeAgentMsgIdRef.current = agentMsgId;
    thinkingRef.current = [];
    artifactRef.current = "";
    terminalReceivedRef.current = false;

    const agentMsg: ChatMessage = {
      id: agentMsgId,
      role: "agent",
      text: "",
      timestamp: Date.now(),
      thinking: [],
      isStreaming: true,
      phase: "investigation",
    };
    setMessages((prev) => [...prev, agentMsg]);
    setIsStreaming(true);
    setInvestigationStartTime(Date.now());

    const request = buildStreamRequest(text, contextIdRef.current);
    const controller = new AbortController();
    abortRef.current = controller;

    const updateAgent = (updates: Partial<ChatMessage>) => {
      setMessages((prev) =>
        prev.map((m) => (m.id === agentMsgId ? { ...m, ...updates } : m))
      );
    };

    const DISCOVERY_PHASE_PATTERN = /discover.*workflow|remediation option|available workflow|searching.*workflow/i;

    const handleEvent = (event: A2AEvent) => {
      if (!contextIdRef.current && event.contextId) {
        contextIdRef.current = event.contextId;
        saveContextId(event.contextId);
      }

      if (event.kind === "artifact-update") {
        const dataPart = event.artifact.parts.find(
          (p): p is DataPart => p.kind === "data"
        );

        const isDecision = event.artifact.metadata?.schema === "investigation_summary" ||
          event.artifact.metadata?.type === "decision" ||
          event.artifact.metadata?.type === "investigation_summary";

        if (dataPart && isDecision) {
          const payload = dataPart.data as unknown as import("../lib/schemas/investigation-summary").InvestigationSummary;
          const textFallback = event.artifact.parts
            .filter((p) => p.kind === "text")
            .map((p) => (p as { text: string }).text)
            .join("");

          const updates: Partial<ChatMessage> = { phase: "decision", thinking: [...thinkingRef.current], thinkingLabel: undefined };

          const metaRrId = event.artifact.metadata?.rr_id as string | undefined;
          if (metaRrId) {
            updates.rrId = metaRrId;
          }

          if (payload.rca) {
            const targetStr = payload.rca.target || "";
            const parenMatch = targetStr.match(/\(([^)]+)\)/);
            const parenNs = parenMatch ? parenMatch[1] : undefined;
            const slashNs = !parenNs && targetStr.includes("/") ? targetStr.slice(0, targetStr.indexOf("/")) : undefined;
            const parsedNamespace = payload.namespace || payload.rca.namespace || parenNs || slashNs || undefined;

            updates.rca = {
              severity: payload.rca.severity,
              confidence: payload.rca.confidence,
              causalChain: payload.rca.causal_chain ?? [],
              target: payload.rca.target,
              toolCallsCount: payload.rca.tool_calls_count ?? 0,
              llmTurns: payload.rca.llm_turns ?? 0,
              summary: payload.summary || textFallback,
              rrId: payload.rr_id,
              signalName: payload.signal_name,
              namespace: parsedNamespace,
            };
          }

          if (payload.rr_id) {
            updates.rrId = payload.rr_id;
          }
          if (payload.signal_name) {
            updates.alertName = payload.signal_name;
          }
          if (payload.namespace || payload.rca?.namespace) {
            updates.namespace = payload.namespace || payload.rca?.namespace;
          }
          if (payload.rca?.target) {
            updates.resource = payload.rca.target;
          }

          if (Array.isArray(payload.options)) {
            updates.workflowOptions = payload.options.map((o) => ({
              workflowId: o.workflow_id,
              name: o.name,
              description: o.description,
              risk: o.risk,
              recommended: o.recommended ?? false,
              ruledOutReason: o.ruled_out_reason,
              parameters: o.parameters,
            }));
          }

          updates.text = "";
          artifactRef.current = "";
          terminalReceivedRef.current = true;
          updateAgent(updates);
        } else if (dataPart && event.artifact.metadata?.type === "execution_progress") {
          const payload = dataPart.data as {
            current_phase: string;
            rr_name?: string;
            started_at?: string;
            completed_at?: string;
          };

          const currentPhase = payload.current_phase;
          const isTerminal = currentPhase === "Completed" || currentPhase === "Failed";
          if (isTerminal) {
            terminalReceivedRef.current = true;
          }

          const updates: Partial<ChatMessage> = {
            phase: currentPhase === "Failed" ? "failed"
                 : isTerminal ? "complete"
                 : currentPhase === "Verifying" ? "verifying"
                 : "remediation",
          };

          if (payload.rr_name) {
            updates.rrId = payload.rr_name;
          }

          const swRaw = event.artifact.metadata?.stabilization_window;
          if (swRaw) {
            const sw = parseDuration(swRaw as string | number);
            if (sw > 0) updates.stabilizationWindow = sw;
          }

          if (payload.started_at && currentPhase === "Verifying") {
            const ts = new Date(payload.started_at).getTime();
            if (!Number.isNaN(ts)) updates.verifyingStartedAt = ts;
          }

          updateAgent(updates);
        } else {
          const text = event.artifact.parts
            .filter((p) => p.kind === "text")
            .map((p) => (p as { text: string }).text)
            .join("");
          if (event.append === false) {
            artifactRef.current = text;
          } else {
            artifactRef.current += text;
          }
          updateAgent({ text: artifactRef.current });
        }
      }

      if (event.kind === "status-update") {
        if (event.metadata) console.debug("[useChat] status-update metadata:", JSON.stringify(event.metadata));
        handleStatusEvent(event, updateAgent);
      }
    };

    const handleStatusEvent = (
      event: StatusUpdateEvent,
      update: (u: Partial<ChatMessage>) => void
    ) => {
      const metaType = event.metadata?.type;

      if (event.metadata?.rr_id && typeof event.metadata.rr_id === "string") {
        const rrUpdate: Partial<ChatMessage> = { rrId: event.metadata.rr_id };
        if (event.metadata.alert_name) rrUpdate.alertName = event.metadata.alert_name as string;
        if (event.metadata.namespace) rrUpdate.namespace = event.metadata.namespace as string;
        if (event.metadata.kind && event.metadata.target) {
          rrUpdate.resource = `${event.metadata.kind}/${event.metadata.target}`;
        } else if (event.metadata.target) {
          rrUpdate.resource = event.metadata.target as string;
        }
        if (event.metadata.phase) {
          const phaseMap: Record<string, ChatMessage["phase"]> = {
            Pending: "investigation",
            Processing: "investigation",
            Analyzing: "investigation",
            Investigating: "investigation",
            AwaitingApproval: "decision",
            Executing: "remediation",
            Verifying: "verifying",
            Blocked: "failed",
            Completed: "complete",
            Failed: "failed",
            TimedOut: "failed",
            Skipped: "complete",
            Cancelled: "complete",
          };
          rrUpdate.phase = phaseMap[event.metadata.phase as string] ?? "investigation";

          if (event.metadata.phase === "Verifying" || event.metadata.phase === "Executing") {
            const swRaw = event.metadata.stabilization_window;
            if (swRaw) {
              const sw = parseDuration(swRaw as string | number);
              if (sw > 0) rrUpdate.stabilizationWindow = sw;
            }
            if (event.metadata.started_at) {
              const ts = new Date(event.metadata.started_at as string).getTime();
              if (!Number.isNaN(ts)) rrUpdate.verifyingStartedAt = ts;
            }
          }
        }
        update(rrUpdate);
      }

      if (metaType === "keepalive") return;

      if (metaType === "approval_request") {
        try {
          const msgText = (event.status.message?.parts ?? [])
            .filter((p) => p.kind === "text")
            .map((p) => p.text)
            .join("") || "";
          const parsed = JSON.parse(msgText) as ApprovalRequest;
          update({ approvalRequest: parsed });
        } catch {
          // Non-JSON approval_request payload
        }
        return;
      }

      if (metaType === "approval_request_resolved") {
        try {
          const msgText = (event.status.message?.parts ?? [])
            .filter((p) => p.kind === "text")
            .map((p) => p.text)
            .join("") || "";
          const parsed = JSON.parse(msgText) as ApprovalResolution;
          update({ approvalResolution: parsed });
        } catch {
          // Non-JSON approval_request_resolved payload
        }
        return;
      }

      if (metaType === "problem_resolved") {
        update({ recoverySignal: "problem_resolved" });
        return;
      }

      if (metaType === "alignment_check_failed") {
        try {
          const msgText = (event.status.message?.parts ?? [])
            .filter((p) => p.kind === "text")
            .map((p) => p.text)
            .join("") || "";
          const verdict = JSON.parse(msgText) as AlignmentVerdict;
          update({ recoverySignal: "alignment_check_failed", alignmentVerdict: verdict });
        } catch {
          update({ recoverySignal: "alignment_check_failed" });
        }
        return;
      }

      if (metaType === "decision") {
        try {
          const msgText = (event.status.message?.parts ?? [])
            .filter((p) => p.kind === "text")
            .map((p) => p.text)
            .join("") || "";
          if (msgText.length >= 512 && msgText.endsWith("...")) {
            console.warn("[a2a] Decision payload truncated by backend (>512 chars). See kubernaut#1395.");
            return;
          }
          const parsed = JSON.parse(msgText);
          const updates: Partial<ChatMessage> = { phase: "decision", text: "", thinkingLabel: undefined };
          updates.thinking = [...thinkingRef.current];

          if (parsed.rca) {
            const targetStr2 = parsed.rca.target || "";
            const parenMatch2 = targetStr2.match(/\(([^)]+)\)/);
            const parenNs2 = parenMatch2 ? parenMatch2[1] : undefined;
            const slashNs2 = !parenNs2 && targetStr2.includes("/") ? targetStr2.slice(0, targetStr2.indexOf("/")) : undefined;
            const parsedNamespace = parsed.namespace || parsed.rca.namespace || parenNs2 || slashNs2 || undefined;
            updates.rca = {
              severity: parsed.rca.severity,
              confidence: parsed.rca.confidence,
              causalChain: parsed.rca.causal_chain ?? [],
              target: parsed.rca.target,
              toolCallsCount: parsed.rca.tool_calls_count ?? 0,
              llmTurns: parsed.rca.llm_turns ?? 0,
              summary: parsed.summary ?? "",
              signalName: parsed.signal_name,
              namespace: parsedNamespace,
              rrId: parsed.rr_id,
            };
            if (parsed.rr_id) {
              updates.rrId = parsed.rr_id;
            }
            if (parsed.signal_name) {
              updates.alertName = parsed.signal_name;
            }
            if (parsedNamespace) {
              updates.namespace = parsedNamespace;
            }
            if (parsed.rca.target) {
              updates.resource = parsed.rca.target;
            }
          }

          if (Array.isArray(parsed.options)) {
            updates.workflowOptions = parsed.options.map((o: Record<string, unknown>) => ({
              workflowId: o.workflow_id || o.workflowId,
              name: o.name,
              description: o.description,
              risk: o.risk,
              recommended: o.recommended ?? false,
              ruledOutReason: o.ruled_out_reason as string | undefined,
              parameters: o.parameters as Record<string, string> | undefined,
            }));
          }

          artifactRef.current = "";
          terminalReceivedRef.current = true;
          update(updates);
        } catch {
          // Not structured JSON
        }
        return;
      }

      if (metaType === "output") {
        try {
          const msgText = (event.status.message?.parts ?? [])
            .filter((p) => p.kind === "text")
            .map((p) => p.text)
            .join("") || "";
          if (msgText.length >= 512 && msgText.endsWith("...")) {
            console.warn("[a2a] Output payload truncated by backend (>512 chars). See kubernaut#1395.");
            return;
          }
          const parsed = JSON.parse(msgText);
          if (Array.isArray(parsed.steps)) {
            const updates: Partial<ChatMessage> = {
              phase: parsed.completed ? "complete" : "remediation",
            };
            const swRaw = event.metadata?.stabilization_window ?? parsed.stabilization_window;
            if (swRaw) {
              const swSeconds = parseDuration(swRaw);
              if (swSeconds > 0) updates.stabilizationWindow = swSeconds;
            }
            update(updates);
          }
        } catch {
          // Not structured execution JSON
        }
        return;
      }

      if (
        metaType === "reasoning" ||
        metaType === "status" ||
        metaType === "investigation" ||
        metaType === "preflight" ||
        metaType === "tool_call"
      ) {
        const text = (event.status.message?.parts ?? [])
          .filter((p) => p.kind === "text")
          .map((p) => p.text)
          .join("") || "";

        const phaseMatch = text.match(/(?:Progress|Remediation phase):\s*(Analyzing|Executing|Verifying|Completed|Failed)/i);
        if (phaseMatch) {
          const currentPhase = phaseMatch[1].toLowerCase();
          const isTerminal = currentPhase === "completed" || currentPhase === "failed";
          if (isTerminal) {
            terminalReceivedRef.current = true;
          }

          let messagePhase: ChatMessage["phase"];
          if (currentPhase === "failed") messagePhase = "failed";
          else if (isTerminal) messagePhase = "complete";
          else if (currentPhase === "verifying") messagePhase = "verifying";
          else messagePhase = "remediation";

          update({ phase: messagePhase });
          return;
        }

        if (text.trim()) {
          const thinkingUpdates: Partial<ChatMessage> = { thinking: undefined };

          if (DISCOVERY_PHASE_PATTERN.test(text)) {
            thinkingUpdates.thinkingLabel = "Discovering workflows";
          }

          const last = thinkingRef.current[thinkingRef.current.length - 1];
          if (last && last.type === metaType) {
            const prevEndsWithSpace = /\s$/.test(last.text);
            const newStartsWithSpace = /^\s/.test(text);
            const prevEndsWithBreak = /[.!?:]\s*$/.test(last.text);
            const newStartsSentence = /^(?:[A-Z*#\-\d])/.test(text);
            let separator = "";
            if (prevEndsWithBreak && newStartsSentence) {
              separator = "\n\n";
            } else if (!prevEndsWithSpace && !newStartsWithSpace) {
              separator = "";
            }
            last.text += separator + text;
            thinkingRef.current = [...thinkingRef.current.slice(0, -1), { ...last }];
          } else {
            thinkingRef.current = [
              ...thinkingRef.current,
              { id: `t-${Date.now()}`, type: metaType, text: text.trimStart() },
            ];
          }
          thinkingUpdates.thinking = [...thinkingRef.current];
          if (!thinkingUpdates.thinkingLabel) {
            thinkingUpdates.phase = "investigation";
          }
          update(thinkingUpdates);
        }
        return;
      }

      if (event.final || event.status.state === "completed" || event.status.state === "input-required") {
        terminalReceivedRef.current = true;
        update({ isStreaming: false });
      }
    };

    setConnectionStatus("connected");

    if (USE_MOCK) {
      await mockStreamA2A(text, handleEvent, controller.signal);
      updateAgent({ isStreaming: false });
      setIsStreaming(false);
      setConnectionStatus("idle");
      return;
    }

    await streamA2A(request, {
      onEvent: handleEvent,
      onError: (err) => {
        setError(friendlyError(err.message));
        updateAgent({ isStreaming: false });
        setIsStreaming(false);
        setConnectionStatus("idle");
      },
      onComplete: () => {
        updateAgent({ isStreaming: false });
        setIsStreaming(false);
        setConnectionStatus("idle");
      },
      onConnectionLost: () => {
        if (terminalReceivedRef.current) return;
        setConnectionStatus("lost");
      },
      onReconnecting: () => {
        if (terminalReceivedRef.current) return;
        setConnectionStatus("reconnecting");
      },
      signal: controller.signal,
    });
  }, []);

  const cancelStream = useCallback(() => {
    abortRef.current?.abort();
    if (activeAgentMsgIdRef.current) {
      const id = activeAgentMsgIdRef.current;
      setMessages((prev) =>
        prev.map((m) => (m.id === id ? { ...m, isStreaming: false } : m))
      );
      activeAgentMsgIdRef.current = null;
    }
    setIsStreaming(false);
    setConnectionStatus("idle");
  }, []);

  const clearHistory = useCallback(() => {
    setMessages([]);
    contextIdRef.current = undefined;
    sessionStorage.removeItem(STORAGE_KEY);
    sessionStorage.removeItem(CONTEXT_KEY);
  }, []);

  return { messages, isStreaming, error, setError, connectionStatus, sendMessage, cancelStream, clearHistory, investigationStartTime };
}
