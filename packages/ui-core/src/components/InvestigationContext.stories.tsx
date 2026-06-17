import type { Meta, StoryObj } from "@storybook/react-vite";
import { InvestigationContext } from "./InvestigationContext";

const meta: Meta<typeof InvestigationContext> = {
  component: InvestigationContext,
  decorators: [(Story) => <div style={{ maxWidth: 820 }}><Story /></div>],
};
export default meta;

type Story = StoryObj<typeof InvestigationContext>;

export const AllFields: Story = {
  args: {
    rrId: "rr-abc123",
    alertName: "KubePodCrashLooping",
    namespace: "production",
    resource: "deployment/api-gateway",
    phase: "investigation",
  },
};

export const InvestigationPhase: Story = {
  args: { rrId: "rr-def456", alertName: "KubePodCrashLooping", namespace: "staging", phase: "investigation" },
};

export const DecisionPhase: Story = {
  args: { rrId: "rr-def456", alertName: "HighMemoryUsage", namespace: "production", phase: "decision" },
};

export const RemediationPhase: Story = {
  args: { rrId: "rr-ghi789", alertName: "KubePodCrashLooping", namespace: "production", resource: "deployment/api-gateway", phase: "remediation" },
};

export const VerifyingPhase: Story = {
  args: { rrId: "rr-ghi789", alertName: "KubePodCrashLooping", namespace: "production", phase: "verifying" },
};

export const CompletePhase: Story = {
  args: { rrId: "rr-ghi789", alertName: "KubePodCrashLooping", namespace: "production", phase: "complete" },
};
