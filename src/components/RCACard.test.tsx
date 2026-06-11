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

  it("UT-CONSOLE-RCA-004: renders metadata line with target, confidence, tool calls, LLM turns", () => {
    render(<RCACard rca={rca} />);
    expect(screen.getByText(/ConfigMap\/app-config in demo-webui/)).toBeInTheDocument();
    expect(screen.getByText(/0\.95/)).toBeInTheDocument();
    expect(screen.getByText(/19 tool calls/)).toBeInTheDocument();
    expect(screen.getByText(/17 LLM turns/)).toBeInTheDocument();
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
    expect(section.className).toContain("overflow-y-auto");
  });

  it("UT-CONSOLE-RCA-008: renders left accent bar with severity color (critical=red)", () => {
    render(<RCACard rca={rca} />);
    const accent = screen.getByTestId("severity-accent");
    expect(accent.className).toContain("bg-kubernaut-red-600");
  });

  it("UT-CONSOLE-RCA-009: renders amber accent bar for high severity", () => {
    render(<RCACard rca={{ ...rca, severity: "high" }} />);
    const accent = screen.getByTestId("severity-accent");
    expect(accent.className).toContain("bg-amber-500");
  });
});
