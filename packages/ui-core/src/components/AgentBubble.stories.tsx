import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "@storybook/test";
import { AgentBubble } from "./AgentBubble";
import type { ChatMessage } from "../hooks/useChat";

const meta: Meta<typeof AgentBubble> = {
  component: AgentBubble,
  decorators: [(Story) => <div style={{ maxWidth: 820, padding: 16 }}><Story /></div>],
  args: {
    onExecuteWorkflow: fn(),
    onApprove: fn(),
    onDecline: fn(),
    onDismiss: fn(),
    onEscalate: fn(),
    userName: "operator@redhat.com",
  },
};
export default meta;

type Story = StoryObj<typeof AgentBubble>;

const baseMessage: ChatMessage = {
  id: "msg-1",
  role: "agent",
  text: "",
  timestamp: Date.now() - 30000,
};

export const TextOnly: Story = {
  args: {
    message: {
      ...baseMessage,
      text: "I'm analyzing the pod restart patterns in the **production** namespace. The `api-gateway-xyz` pod has restarted 4 times in the last hour with exit code 137 (OOM killed).",
    },
  },
};

export const WithRCA: Story = {
  args: {
    message: {
      ...baseMessage,
      text: "",
      rca: {
        severity: "critical",
        confidence: 92,
        summary: "Pod OOM-killed due to memory leak in connection pool handler.",
        causalChain: [
          "Alert: KubePodCrashLooping fired",
          "Exit code 137 (OOM kill)",
          "Memory exceeded 512Mi limit",
          "Connection pool leak in /src/pool.ts:142",
        ],
        target: "deployment/api-gateway",
        toolCallsCount: 8,
        llmTurns: 3,
        rrId: "rr-abc123",
        signalName: "KubePodCrashLooping",
        namespace: "production",
      },
    },
  },
};

export const WithWorkflows: Story = {
  args: {
    message: {
      ...baseMessage,
      text: "",
      workflowOptions: [
        {
          workflowId: "48dec870-cb96-5dd2-a29c-f518735ab23d",
          name: "Rolling Restart",
          description: "Performs a rolling restart of the deployment.",
          recommended: true,
          parameters: { strategy: "RollingUpdate" },
        },
        {
          workflowId: "a1b2c3d4-0000-0000-0000-000000000000",
          name: "Scale and Restart",
          description: "Scales down then up. Causes brief downtime.",
          recommended: false,
          ruledOutReason: "Causes service interruption",
        },
      ],
    },
  },
};

export const Streaming: Story = {
  args: {
    message: {
      ...baseMessage,
      text: "Investigating the alert",
      isStreaming: true,
      thinking: [
        { id: "t1", type: "reasoning", text: "Checking pod status..." },
        { id: "t2", type: "tool_call", text: "kubectl get pods -n production" },
      ],
      thinkingLabel: "Investigating",
    },
  },
};
