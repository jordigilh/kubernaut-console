import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "@storybook/test";
import { WelcomeState } from "./WelcomeState";

const meta: Meta<typeof WelcomeState> = {
  component: WelcomeState,
  decorators: [(Story) => <div style={{ maxWidth: 820, padding: 24 }}><Story /></div>],
  args: { onSuggest: fn() },
};
export default meta;

type Story = StoryObj<typeof WelcomeState>;

export const Default: Story = {};
