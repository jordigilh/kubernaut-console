import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { RCACard } from "./RCACard";
import type { RCAData } from "../hooks/useChat";

const rca: RCAData = {
  severity: "critical",
  confidence: 0.95,
  causalChain: [
    "Signal: Pod web-frontend in CrashLoopBackOff (4 restarts, exit code 1)",
    "Why? [emerg] invalid directive found in /etc/demo-http-server/config.yaml",
    "Why? ConfigMap app-config contains 'invalid_directive: true'",
    "Why? Git commit caa704e8 introduced the invalid directive",
    "Root cause: Bad commit synced via ArgoCD with selfHeal:true",
  ],
  target: "ConfigMap/app-config in demo-webui",
  toolCallsCount: 19,
  llmTurns: 17,
  promptTokens: 1200,
  completionTokens: 450,
  totalTokens: 1650,
  tokenMetricsAvailable: true,
  summary: "ConfigMap app-config contains an invalid directive introduced by Git commit caa704e8, synced by ArgoCD. With selfHeal:true, in-cluster patches are futile.",
};

describe("RCACard", () => {
  // IR-4: Incident Handling / IR-5: Incident Monitoring — root cause disclosure to operator
  it("UT-CONSOLE-RCA-001: renders the 'Root Cause Analysis' title", () => {
    render(<RCACard rca={rca} />);
    expect(screen.getByText("Root Cause Analysis")).toBeInTheDocument();
  });

  it("UT-CONSOLE-RCA-002: renders severity badge", () => {
    render(<RCACard rca={rca} />);
    expect(screen.getByText("critical")).toBeInTheDocument();
  });

  // IR-4: Incident Handling / IR-5: Incident Monitoring — RCA summary provides actionable context to operator
  it("UT-CONSOLE-RCA-003: renders summary text", () => {
    render(<RCACard rca={rca} />);
    expect(screen.getByText(/ConfigMap app-config contains an invalid directive/)).toBeInTheDocument();
  });

  it("UT-CONSOLE-RCA-004: renders final metadata without RR and with token usage", () => {
    render(<RCACard rca={rca} />);
    expect(screen.getByText(/ConfigMap\/app-config in demo-webui/)).toBeInTheDocument();
    expect(screen.getByText(/0\.95/)).toBeInTheDocument();
    expect(screen.getByText(/19 tool calls/)).toBeInTheDocument();
    expect(screen.getByText(/17 LLM turns/)).toBeInTheDocument();
    expect(screen.getByText(/1,650 tokens \(1,200 in \/ 450 out\)/)).toBeInTheDocument();
    expect(screen.queryByText(/RR:/)).not.toBeInTheDocument();
  });

  it("UT-CONSOLE-RCA-005: renders causal chain entries", () => {
    render(<RCACard rca={rca} />);
    expect(screen.getByText(/Pod web-frontend in CrashLoopBackOff/)).toBeInTheDocument();
    expect(screen.getByText(/Bad commit synced via ArgoCD/)).toBeInTheDocument();
  });

  it("UT-CONSOLE-RCA-006: renders causal chain section header", () => {
    render(<RCACard rca={rca} />);
    expect(screen.getByText("Causal chain:")).toBeInTheDocument();
  });

  it("UT-CONSOLE-RCA-007: causal chain section is scrollable", () => {
    render(<RCACard rca={rca} />);
    const section = screen.getByTestId("causal-chain");
    expect(section.style.maxHeight).toBe("180px");
    expect(section.style.overflowY).toBe("auto");
  });

  it("UT-CONSOLE-RCA-008: renders as PF6 Card with severity label (critical=red)", () => {
    render(<RCACard rca={rca} />);
    const card = screen.getByTestId("severity-accent");
    expect(card.className).toContain("pf-v6-c-card");
  });

  it("UT-CONSOLE-RCA-009: renders orange label for high severity", () => {
    render(<RCACard rca={{ ...rca, severity: "high" }} />);
    expect(screen.getByText("high")).toBeInTheDocument();
  });

  // The RR is already shown in the investigation header; avoid duplicating it
  // in every RCA footer.
  it("UT-CONSOLE-RCA-010: omits RR ID from metadata when available", () => {
    render(<RCACard rca={{ ...rca, rrId: "rr-9e1b7bf4140b-ed9f1796" }} />);
    expect(screen.queryByText(/rr-9e1b7bf4140b-ed9f1796/)).not.toBeInTheDocument();
  });

  it("UT-CONSOLE-RCA-011: omits RR ID gracefully when not provided", () => {
    render(<RCACard rca={rca} />);
    expect(screen.queryByText(/RR:/)).not.toBeInTheDocument();
  });

  it("UT-CONSOLE-RCA-012: does not present unavailable early-RCA metrics as zero", () => {
    render(<RCACard rca={{ ...rca, confidence: 0, toolCallsCount: 0, llmTurns: 0, metricsPending: true }} />);
    expect(screen.getAllByRole("status")).toHaveLength(3);
    expect(screen.getByRole("status", { name: "Confidence not yet available" })).toBeInTheDocument();
    expect(screen.getByRole("status", { name: "Tool call count not yet available" })).toBeInTheDocument();
    expect(screen.getByRole("status", { name: "LLM turn count not yet available" })).toBeInTheDocument();
  });

  it("UT-CONSOLE-RCA-013: preserves a real confidence value while counters load", () => {
    render(<RCACard rca={{ ...rca, confidence: 0.95, toolCallsCount: 0, llmTurns: 0, metricsPending: true }} />);
    expect(screen.getByTestId("rca-metadata")).toHaveTextContent("Confidence: 0.95");
    expect(screen.getByRole("status", { name: "Tool call count not yet available" })).toBeInTheDocument();
    expect(screen.getByRole("status", { name: "LLM turn count not yet available" })).toBeInTheDocument();
  });

  it("UT-CONSOLE-RCA-014: omits token usage when older artifacts do not provide token keys", () => {
    const legacyRca = { ...rca };
    delete legacyRca.tokenMetricsAvailable;
    delete legacyRca.promptTokens;
    delete legacyRca.completionTokens;
    delete legacyRca.totalTokens;
    render(<RCACard rca={legacyRca} />);
    expect(screen.getByTestId("rca-metadata")).not.toHaveTextContent(/tokens/);
    expect(screen.getByTestId("rca-metadata")).not.toHaveTextContent(/RR:/);
  });

  it("UT-CONSOLE-RCA-015: preserves explicit zero token values", () => {
    render(<RCACard rca={{ ...rca, promptTokens: 0, completionTokens: 0, totalTokens: 0 }} />);
    expect(screen.getByTestId("rca-metadata")).toHaveTextContent("0 tokens (0 in / 0 out)");
  });

  it("UT-CONSOLE-RCA-016: does not show cumulative tokens before workflow discovery completes", () => {
    render(<RCACard rca={{ ...rca, metricsPending: true }} />);
    expect(screen.getByTestId("rca-metadata")).not.toHaveTextContent(/tokens/);
  });

  it("UT-CONSOLE-RCA-017: does not show partial token metrics as a complete total", () => {
    render(<RCACard rca={{ ...rca, tokenMetricsAvailable: false, completionTokens: 0, totalTokens: 0 }} />);
    expect(screen.getByTestId("rca-metadata")).not.toHaveTextContent(/tokens/);
  });
});
