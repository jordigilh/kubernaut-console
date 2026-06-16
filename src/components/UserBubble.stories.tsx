import type { Meta, StoryObj } from "@storybook/react-vite";
import { UserBubble } from "./UserBubble";

const meta: Meta<typeof UserBubble> = {
  component: UserBubble,
  decorators: [(Story) => <div style={{ maxWidth: 820, padding: 16 }}><Story /></div>],
};
export default meta;

type Story = StoryObj<typeof UserBubble>;

export const ShortMessage: Story = {
  args: { text: "Investigate the crashing pod", timestamp: Date.now() - 60000 },
};

export const LongMessage: Story = {
  args: {
    text: "I noticed that the api-gateway pod in the production namespace has been restarting repeatedly over the last 30 minutes. Can you investigate what's causing the crash loop and recommend a remediation?",
    timestamp: Date.now() - 120000,
  },
};
