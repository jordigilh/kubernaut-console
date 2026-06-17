import type { Meta, StoryObj } from "@storybook/react-vite";
import { RCACard } from "./RCACard";

const meta: Meta<typeof RCACard> = {
  component: RCACard,
  decorators: [(Story) => <div style={{ maxWidth: 700, padding: 16 }}><Story /></div>],
};
export default meta;

type Story = StoryObj<typeof RCACard>;

export const Critical: Story = {
  args: {
    rca: {
      severity: "critical",
      confidence: 92,
      summary: "Pod api-gateway-xyz is being OOM-killed due to a memory leak in the connection pool handler.",
      causalChain: [
        "Alert: KubePodCrashLooping fired for api-gateway-xyz",
        "Pod terminated with exit code 137 (SIGKILL from OOM)",
        "Container memory usage exceeded 512Mi limit",
        "Connection pool leak identified in /src/pool.ts:142",
      ],
      target: "deployment/api-gateway",
      toolCallsCount: 8,
      llmTurns: 3,
      rrId: "rr-abc123",
      signalName: "KubePodCrashLooping",
      namespace: "production",
    },
  },
};

export const Low: Story = {
  args: {
    rca: {
      severity: "low",
      confidence: 45,
      summary: "Transient DNS resolution failure caused intermittent 503 errors.",
      causalChain: [
        "Alert: HighErrorRate fired for api-gateway",
        "503 errors correlated with DNS timeout events",
      ],
      target: "deployment/api-gateway",
      toolCallsCount: 4,
      llmTurns: 2,
      namespace: "staging",
    },
  },
};

export const LongChain: Story = {
  args: {
    rca: {
      severity: "high",
      confidence: 78,
      summary: "Cascading failure triggered by upstream service degradation propagating through retry storms.",
      causalChain: [
        "Alert: HighLatency fired for payment-service",
        "Upstream auth-service responded with 429 Too Many Requests",
        "Client retry logic created exponential backoff storm",
        "Connection pool exhausted (max 100 connections)",
        "Thread pool saturation in payment-service",
        "Health check failures triggered pod restarts",
        "Service mesh circuit breaker opened",
        "Dependent order-service received 503 from payment-service",
      ],
      target: "deployment/payment-service",
      toolCallsCount: 12,
      llmTurns: 5,
      rrId: "rr-xyz789",
      signalName: "HighLatency",
      namespace: "production",
    },
  },
};
