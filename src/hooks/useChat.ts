import { useCallback, useEffect, useRef, useState } from "react";
import { buildStreamRequest, streamA2A } from "../lib/a2a-client";
import { mockStreamA2A } from "../lib/a2a-mock";
import type { A2AEvent, DataPart, StatusUpdateEvent } from "../lib/a2a-types";
import type { ExecutionStep } from "../components/ExecutionProgress";

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

export interface ChatMessage {
  id: string;
  role: "user" | "agent";
  text: string;
  timestamp: number;
  thinking?: ThinkingEntry[];
  workflowOptions?: WorkflowOption[];
  rca?: RCAData;
  executionSteps?: ExecutionStep[];
  executionComplete?: boolean;
  stabilizationWindow?: number;
  isStreaming?: boolean;
  phase?: "investigation" | "decision" | "remediation" | "complete";
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
    const toSave = messages.map((m) => ({ ...m, isStreaming: false }));
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
  } catch {
    // Storage full or unavailable
  }
}

function loadContextId(): string | undefined {
  return sessionStorage.getItem(CONTEXT_KEY) || undefined;
}

function saveContextId(id: string) {
  sessionStorage.setItem(CONTEXT_KEY, id);
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

  const nextId = () => `msg-${++messageIdRef.current}`;

  const sendMessage = useCallback(async (text: string) => {
    const now = Date.now();
    if (now - lastSendRef.current < 500) return;
    lastSendRef.current = now;

    setError(null);

    const userMsg: ChatMessage = {
      id: nextId(),
      role: "user",
      text,
      timestamp: now,
    };
    setMessages((prev) => [...prev, userMsg]);

    const agentMsgId = nextId();
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

          const updates: Partial<ChatMessage> = { phase: "decision" };

          updates.rca = {
            severity: payload.rca.severity,
            confidence: payload.rca.confidence,
            causalChain: payload.rca.causal_chain ?? [],
            target: payload.rca.target,
            toolCallsCount: payload.rca.tool_calls_count ?? 0,
            llmTurns: payload.rca.llm_turns ?? 0,
            summary: payload.summary || textFallback,
          };

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

          updates.text = payload.summary || textFallback;
          artifactRef.current = updates.text;
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
        handleStatusEvent(event, updateAgent);
      }
    };

    const handleStatusEvent = (
      event: StatusUpdateEvent,
      update: (u: Partial<ChatMessage>) => void
    ) => {
      const metaType = event.metadata?.type;

      if (metaType === "keepalive") return;

      if (metaType === "decision") {
        try {
          const msgText = event.status.message?.parts
            .filter((p) => p.kind === "text")
            .map((p) => p.text)
            .join("") || "";
          if (msgText.length >= 512 && msgText.endsWith("...")) {
            console.warn("[a2a] Decision payload truncated by backend (>512 chars). See kubernaut#1395.");
            return;
          }
          const parsed = JSON.parse(msgText);
          const updates: Partial<ChatMessage> = { phase: "decision" };

          if (parsed.rca) {
            updates.rca = {
              severity: parsed.rca.severity,
              confidence: parsed.rca.confidence,
              causalChain: parsed.rca.causal_chain ?? [],
              target: parsed.rca.target,
              toolCallsCount: parsed.rca.tool_calls_count ?? 0,
              llmTurns: parsed.rca.llm_turns ?? 0,
              summary: parsed.summary ?? "",
            };
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

          update(updates);
        } catch {
          // Not structured JSON
        }
        return;
      }

      if (metaType === "output") {
        try {
          const msgText = event.status.message?.parts
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
              executionSteps: parsed.steps,
              executionComplete: parsed.completed ?? false,
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
        const text = event.status.message?.parts
          .filter((p) => p.kind === "text")
          .map((p) => p.text)
          .join("") || "";
        if (text.trim()) {
          const last = thinkingRef.current[thinkingRef.current.length - 1];
          if (last && last.type === metaType) {
            last.text += " " + text.trim();
            thinkingRef.current = [...thinkingRef.current.slice(0, -1), { ...last }];
          } else {
            thinkingRef.current = [
              ...thinkingRef.current,
              { id: `t-${Date.now()}`, type: metaType, text: text.trim() },
            ];
          }
          update({ thinking: [...thinkingRef.current] });
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
        setError(err.message);
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
      onReconnecting: (attempt) => {
        if (terminalReceivedRef.current) return;
        setConnectionStatus("reconnecting");
        setError(`Connection lost, retrying (attempt ${attempt})...`);
      },
      signal: controller.signal,
    });
  }, []);

  const cancelStream = useCallback(() => {
    abortRef.current?.abort();
    setIsStreaming(false);
    setConnectionStatus("idle");
  }, []);

  const clearHistory = useCallback(() => {
    setMessages([]);
    contextIdRef.current = undefined;
    sessionStorage.removeItem(STORAGE_KEY);
    sessionStorage.removeItem(CONTEXT_KEY);
  }, []);

  return { messages, isStreaming, error, connectionStatus, sendMessage, cancelStream, clearHistory, investigationStartTime };
}
