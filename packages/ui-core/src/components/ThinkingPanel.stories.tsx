import type { Meta, StoryObj } from "@storybook/react-vite";
import { ThinkingPanel } from "./ThinkingPanel";

const meta: Meta<typeof ThinkingPanel> = {
  component: ThinkingPanel,
  decorators: [(Story) => <div style={{ maxWidth: 700, padding: 16 }}><Story /></div>],
};
export default meta;

type Story = StoryObj<typeof ThinkingPanel>;

export const Collapsed: Story = {
  args: {
    entries: [
      { id: "1", type: "reasoning", text: "Analyzing pod restart patterns..." },
      { id: "2", type: "tool_call", text: "kubectl get pods -n production" },
    ],
    isActive: false,
    startTime: Date.now() - 15000,
  },
};

export const Expanded: Story = {
  args: {
    entries: [
      { id: "1", type: "reasoning", text: "Analyzing pod restart patterns in the production namespace." },
      { id: "2", type: "tool_call", text: "kubectl get pods -n production -o wide" },
      { id: "3", type: "reasoning", text: "Found 3 pods in CrashLoopBackOff state. Checking events." },
      { id: "4", type: "tool_call", text: "kubectl describe pod api-gateway-xyz -n production" },
      { id: "5", type: "investigation", text: "## Memory Analysis\n\nThe pod exceeded its memory limit of 512Mi." },
    ],
    isActive: false,
    startTime: Date.now() - 30000,
  },
};

export const Streaming: Story = {
  args: {
    entries: [
      { id: "1", type: "reasoning", text: "Initiating investigation..." },
      { id: "2", type: "preflight", text: "Running preflight checks on target cluster" },
    ],
    isActive: true,
    startTime: Date.now() - 5000,
    label: "Investigating",
  },
};
