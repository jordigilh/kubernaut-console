import type { Meta, StoryObj } from "@storybook/react-vite";
import { VerificationTimer } from "./VerificationTimer";

const meta: Meta<typeof VerificationTimer> = {
  component: VerificationTimer,
  decorators: [(Story) => <div style={{ maxWidth: 700, padding: 16 }}><Story /></div>],
};
export default meta;

type Story = StoryObj<typeof VerificationTimer>;

const now = Date.now();

export const Early: Story = {
  args: {
    stabilizationWindow: 120,
    startedAt: now - 24000,
    steps: [
      { step: "spec_hash_computed", status: "completed", detail: "Hash verified", updatedAt: now - 20000 },
      { step: "alert_check", status: "in_progress", detail: "Waiting for KubePodCrashLooping to clear", elapsedSeconds: 24, updatedAt: now - 1000 },
    ],
  },
};

export const Mid: Story = {
  args: {
    stabilizationWindow: 120,
    startedAt: now - 72000,
    steps: [
      { step: "spec_hash_computed", status: "completed", detail: "Hash verified", updatedAt: now - 70000 },
      { step: "alert_check", status: "completed", detail: "Alert cleared", updatedAt: now - 40000 },
      { step: "health_check", status: "in_progress", detail: "Checking endpoint /healthz", elapsedSeconds: 72, retryCount: 2, updatedAt: now - 2000 },
    ],
  },
};

export const NearComplete: Story = {
  args: {
    stabilizationWindow: 120,
    startedAt: now - 108000,
    steps: [
      { step: "spec_hash_computed", status: "completed", detail: "Hash verified", updatedAt: now - 105000 },
      { step: "alert_check", status: "completed", detail: "Alert cleared", updatedAt: now - 80000 },
      { step: "health_check", status: "completed", detail: "All endpoints healthy", updatedAt: now - 30000 },
      { step: "stabilization_elapsed", status: "in_progress", detail: "Waiting for stabilization window", elapsedSeconds: 108, updatedAt: now - 1000 },
    ],
  },
};
