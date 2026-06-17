import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "@storybook/test";
import { WorkflowCards } from "./WorkflowCards";

const meta: Meta<typeof WorkflowCards> = {
  component: WorkflowCards,
  decorators: [(Story) => <div style={{ maxWidth: 700, padding: 16 }}><Story /></div>],
  args: {
    onExecute: fn(),
    onDismiss: fn(),
    onEscalate: fn(),
  },
};
export default meta;

type Story = StoryObj<typeof WorkflowCards>;

export const Recommended: Story = {
  args: {
    options: [
      {
        workflowId: "48dec870-cb96-5dd2-a29c-f518735ab23d",
        name: "Rolling Restart",
        description: "Performs a rolling restart of the deployment, replacing pods one at a time to avoid downtime.",
        recommended: true,
        parameters: { strategy: "RollingUpdate", maxUnavailable: "1" },
      },
      {
        workflowId: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
        name: "Scale and Restart",
        description: "Scales down to 0 then back up to original replicas. Causes brief downtime.",
        recommended: false,
        ruledOutReason: "Causes service interruption in production environment",
      },
    ],
  },
};

export const NoWorkflows: Story = {
  args: {
    options: [],
    targetDivergence: {
      discoveryTarget: { apiVersion: "apps/v1", kind: "Deployment", name: "api-gateway", namespace: "production" },
      signalTarget: { apiVersion: "v1", kind: "Pod", name: "api-gateway-xyz", namespace: "production" },
    },
  },
};

export const WithRecoveryResolved: Story = {
  args: {
    options: [
      {
        workflowId: "48dec870-cb96-5dd2-a29c-f518735ab23d",
        name: "Rolling Restart",
        description: "Performs a rolling restart of the deployment.",
        recommended: true,
      },
    ],
    recoverySignal: "problem_resolved",
  },
};

export const WithAlignmentFailed: Story = {
  args: {
    options: [
      {
        workflowId: "48dec870-cb96-5dd2-a29c-f518735ab23d",
        name: "Rolling Restart",
        description: "Performs a rolling restart of the deployment.",
        recommended: true,
      },
    ],
    recoverySignal: "alignment_check_failed",
  },
};

export const WithAlignmentVerdict: Story = {
  args: {
    options: [],
    alignmentVerdict: {
      result: "blocked",
      circuit_breaker_activated: true,
      summary: "Workflow execution blocked: 2 of 3 steps flagged as misaligned with the root cause analysis.",
      flagged: 2,
      total: 3,
      findings: [
        { step_index: 1, step_kind: "kubectl_apply", tool: "kubectl", explanation: "Applying a ConfigMap change is unrelated to the OOM issue." },
        { step_index: 3, step_kind: "kubectl_delete", tool: "kubectl", explanation: "Deleting the pod directly contradicts the rolling restart strategy." },
      ],
    },
  },
};

export const WithTargetDivergence: Story = {
  args: {
    options: [
      {
        workflowId: "48dec870-cb96-5dd2-a29c-f518735ab23d",
        name: "Rolling Restart",
        description: "Performs a rolling restart of the deployment.",
        recommended: true,
      },
    ],
    targetDivergence: {
      discoveryTarget: { apiVersion: "apps/v1", kind: "Deployment", name: "api-gateway", namespace: "production" },
      signalTarget: { apiVersion: "v1", kind: "Pod", name: "api-gateway-xyz", namespace: "production" },
    },
  },
};
