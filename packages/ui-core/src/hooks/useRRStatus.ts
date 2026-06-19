import { useEffect, useRef, useState, useCallback } from "react";
import { subscribeRRStatus } from "../lib/a2a-status-client";
import type { RRPhase } from "../lib/a2a-status-client";

const USE_MOCK = import.meta.env.VITE_MOCK_A2A === "true";

export type StatusConnection = "idle" | "connected" | "reconnecting" | "error" | "not_found";

export interface UseRRStatusResult {
  statusPhase: RRPhase | undefined;
  statusConnection: StatusConnection;
  statusMetadata: Record<string, unknown> | undefined;
  isTerminal: boolean;
}

export function useRRStatus(rrId: string | undefined): UseRRStatusResult {
  const [statusPhase, setStatusPhase] = useState<RRPhase | undefined>(undefined);
  const [statusConnection, setStatusConnection] = useState<StatusConnection>("idle");
  const [statusMetadata, setStatusMetadata] = useState<Record<string, unknown> | undefined>(undefined);
  const [isTerminal, setIsTerminal] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const prevRrIdRef = useRef<string | undefined>(undefined);
  const terminalRef = useRef(false);

  const handlePhaseChange = useCallback((phase: RRPhase, metadata: Record<string, unknown>) => {
    setStatusPhase(phase);
    setStatusMetadata(metadata);
    setStatusConnection("connected");
  }, []);

  const handleTerminal = useCallback((_phase: RRPhase) => {
    setIsTerminal(true);
    terminalRef.current = true;
  }, []);

  const handleError = useCallback((_error: Error) => {
    setStatusConnection("error");
  }, []);

  const handleReconnecting = useCallback((_attempt: number) => {
    setStatusConnection("reconnecting");
  }, []);

  const handleNotFound = useCallback(() => {
    setStatusConnection("not_found");
    setIsTerminal(true);
    terminalRef.current = true;
  }, []);

  useEffect(() => {
    if (!rrId) {
      if (prevRrIdRef.current) {
        setStatusPhase(undefined);
        setStatusMetadata(undefined);
        setIsTerminal(false);
        setStatusConnection("idle");
        terminalRef.current = false;
        prevRrIdRef.current = undefined;
      }
      return;
    }

    if (rrId !== prevRrIdRef.current) {
      setStatusPhase(undefined);
      setStatusMetadata(undefined);
      setIsTerminal(false);
      setStatusConnection("idle");
      terminalRef.current = false;
    }
    prevRrIdRef.current = rrId;

    if (terminalRef.current) return;

    const controller = new AbortController();
    abortRef.current = controller;

    if (USE_MOCK) {
      mockStatusStream(controller.signal, handlePhaseChange, handleTerminal);
    } else {
      subscribeRRStatus(rrId, {
        onPhaseChange: handlePhaseChange,
        onError: handleError,
        onTerminal: handleTerminal,
        onNotFound: handleNotFound,
        onReconnecting: handleReconnecting,
        signal: controller.signal,
      });
    }

    return () => {
      controller.abort();
    };
  }, [rrId, handlePhaseChange, handleError, handleTerminal, handleNotFound, handleReconnecting]);

  return { statusPhase, statusConnection, statusMetadata, isTerminal };
}

async function mockStatusStream(
  signal: AbortSignal,
  onPhaseChange: (phase: RRPhase, metadata: Record<string, unknown>) => void,
  onTerminal: (phase: RRPhase) => void,
) {
  const phases: Array<{ phase: RRPhase; metadata: Record<string, unknown>; delay: number }> = [
    { phase: "Investigating", metadata: {}, delay: 500 },
    { phase: "Executing", metadata: { workflow_id: "git-revert-v2" }, delay: 3000 },
    { phase: "Verifying", metadata: { ea_phase: "Stabilizing", stabilization_deadline: new Date(Date.now() + 30000).toISOString() }, delay: 4000 },
    { phase: "Verifying", metadata: { ea_phase: "Assessing" }, delay: 3000 },
    { phase: "Completed", metadata: { outcome: "Remediated" }, delay: 3000 },
  ];

  for (const step of phases) {
    if (signal.aborted) return;
    await new Promise((r) => setTimeout(r, step.delay));
    if (signal.aborted) return;
    onPhaseChange(step.phase, step.metadata);
    if (step.phase === "Completed") {
      onTerminal(step.phase);
      return;
    }
  }
}
