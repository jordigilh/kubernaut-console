import type { Meta, StoryObj } from "@storybook/react-vite";
import { ChatContainer } from "./ChatContainer";

const meta: Meta<typeof ChatContainer> = {
  component: ChatContainer,
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story) => (
      <div style={{ height: "100vh", width: "100%", display: "flex" }}>
        <Story />
      </div>
    ),
  ],
  beforeEach: async () => {
    const originalFetch = window.fetch;
    window.fetch = async (input, init) => {
      const url = typeof input === "string" ? input : (input as Request).url;
      if (url.includes("/oauth2/userinfo")) {
        return new Response(JSON.stringify({ preferredUsername: "jgil", email: "jgil@redhat.com" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url.includes("/api/") || url.includes("/a2a")) {
        return new Response(JSON.stringify({}), { status: 200 });
      }
      return originalFetch(input, init);
    };
  },
};
export default meta;

type Story = StoryObj<typeof ChatContainer>;

export const Empty: Story = {};

export const WithError: Story = {
  beforeEach: async () => {
    window.fetch = async (input) => {
      const url = typeof input === "string" ? input : (input as Request).url;
      if (url.includes("/oauth2/userinfo")) {
        return new Response(JSON.stringify({ preferredUsername: "jgil", email: "jgil@redhat.com" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response("Internal Server Error", { status: 500 });
    };
  },
};

export const CancellableInvestigation: Story = {
  beforeEach: async () => {
    sessionStorage.setItem("kubernaut-console-messages", JSON.stringify([
      {
        id: "user-1",
        role: "user",
        text: "Investigate the crashing worker",
        timestamp: Date.now() - 5000,
      },
      {
        id: "agent-1",
        role: "agent",
        text: "",
        timestamp: Date.now(),
        rrId: "rr-demo-cancellable",
        phase: "investigation",
        isStreaming: true,
        thinking: [{ id: "thinking-1", type: "tool_call", text: "Investigating worker status..." }],
      },
    ]));
    sessionStorage.setItem("kubernaut-console-phase", "investigation");
  },
};
