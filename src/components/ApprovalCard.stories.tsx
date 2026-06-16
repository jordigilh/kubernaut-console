import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "@storybook/test";
import { ApprovalCard } from "./ApprovalCard";

const meta: Meta<typeof ApprovalCard> = {
  component: ApprovalCard,
  decorators: [(Story) => <div style={{ maxWidth: 700, padding: 16 }}><Story /></div>],
  args: {
    onApprove: fn(),
    onDecline: fn(),
  },
};
export default meta;

type Story = StoryObj<typeof ApprovalCard>;

const futureDate = new Date(Date.now() + 300000).toISOString();
const pastDate = new Date(Date.now() - 60000).toISOString();

export const Active: Story = {
  args: {
    request: {
      name: "rar-abc123",
      confidence: 92,
      confidenceLevel: "High",
      reason: "Rolling restart of deployment/api-gateway will resolve the OOM-killed pods without data loss.",
      requiredBy: futureDate,
      investigationSummary: "Pod api-gateway-xyz is being OOM-killed due to memory leak in connection pool.",
      evidenceCollected: [
        "Exit code 137 (OOM kill) observed 4 times in last hour",
        "Memory usage trending upward: 480Mi → 512Mi over 15 minutes",
        "No recent deployment changes detected",
      ],
      policyEvaluation: {
        policyName: "production-safety",
        matchedRules: ["requires-approval-above-medium", "no-delete-in-prod"],
        decision: "RequiresApproval",
      },
    },
    userName: "jgil@redhat.com",
  },
};

export const Expired: Story = {
  args: {
    request: {
      name: "rar-def456",
      confidence: 67,
      confidenceLevel: "Medium",
      reason: "Scale up deployment to 3 replicas to handle increased traffic.",
      requiredBy: pastDate,
    },
    userName: "operator@example.com",
  },
};

export const Approved: Story = {
  args: {
    request: {
      name: "rar-abc123",
      confidence: 92,
      confidenceLevel: "High",
      reason: "Rolling restart of deployment/api-gateway.",
      requiredBy: futureDate,
    },
    resolution: {
      name: "rar-abc123",
      decision: "Approved",
      decidedBy: "jgil@redhat.com",
      decidedAt: new Date().toISOString(),
    },
    userName: "jgil@redhat.com",
  },
};

export const Declined: Story = {
  args: {
    request: {
      name: "rar-ghi789",
      confidence: 35,
      confidenceLevel: "Low",
      reason: "Delete and recreate the problematic pod.",
      requiredBy: futureDate,
    },
    resolution: {
      name: "rar-ghi789",
      decision: "Rejected",
      decidedBy: "operator@example.com",
      decidedAt: new Date().toISOString(),
    },
    userName: "operator@example.com",
  },
};
