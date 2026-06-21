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
  },
};

export const MinimalFields: Story = {
  args: { rrId: "rr-def456", alertName: "KubePodCrashLooping", namespace: "staging" },
};

export const WithCluster: Story = {
  args: { rrId: "rr-def456", alertName: "HighMemoryUsage", namespace: "production", cluster: "prod-us-east-1" },
};

export const Idle: Story = {
  args: {},
};
