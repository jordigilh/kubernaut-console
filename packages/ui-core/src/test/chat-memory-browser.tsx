import React from "react";
import { createRoot } from "react-dom/client";
import * as Chat from "../components/ChatContainer";
import { ConfigContext } from "../providers/config";

const MemoryOwner = Chat.PageLifetimeChatOwnerProvider;
const requests: unknown[] = [];
const fetchFn = async (_url: string, init?: RequestInit): Promise<Response> => {
  requests.push(JSON.parse(String(init?.body)));
  const event = {
    jsonrpc: "2.0", id: "fixture", result: {
      kind: "status-update", taskId: "fixture-task", contextId: "fixture-context",
      status: { state: "completed", message: { role: "agent", parts: [{ kind: "text", text: "Synthetic completion" }] } },
      final: true,
    },
  };
  return new Response(`data: ${JSON.stringify(event)}\n\n`, { status: 200, headers: { "Content-Type": "text/event-stream" } });
};
const root = createRoot(document.getElementById("root")!);

declare global {
  interface Window {
    chatMemoryFixture: { requests: unknown[]; render: (show: boolean) => void };
  }
}
window.chatMemoryFixture = {
  requests,
  render(show) {
    root.render(<ChatMemoryFixture show={show} />);
  },
};

export function ChatMemoryFixture({ show }: { show: boolean }) {
  return <ConfigContext.Provider value={{ backendUrl: "", fetchFn }}>
    <MemoryOwner>{show ? <Chat.ChatPresenter /> : null}</MemoryOwner>
  </ConfigContext.Provider>;
}
