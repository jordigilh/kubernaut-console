import { act, renderHook } from "@testing-library/react";
import { buildStreamRequest, streamA2A } from "../lib/a2a-client";
import { createPageChatSession, type PageChatSession } from "../lib/page-chat-session";
import { useChat, useChatWithSession } from "./useChat";

vi.mock("../lib/a2a-client", async (importOriginal) => ({
  ...await importOriginal<typeof import("../lib/a2a-client")>(),
  buildStreamRequest: vi.fn((text: string, contextId?: string) => ({
    jsonrpc: "2.0" as const, id: "test", method: "message/stream", params: { message: { text, contextId } },
  })),
  streamA2A: vi.fn(),
}));

const ID_A = "11111111-1111-4111-8111-111111111111";
const ID_B = "22222222-2222-4222-8222-222222222222";
const ID_C = "33333333-3333-4333-8333-333333333333";

beforeEach(() => {
  sessionStorage.clear();
  vi.mocked(buildStreamRequest).mockClear();
  vi.mocked(streamA2A).mockReset().mockImplementation(async (_request, options) => { options.onComplete(); });
});
afterEach(() => { vi.restoreAllMocks(); });

it("UT-CONSOLE-170-007: the hook consumes only the owner's deferred context and rotates locally", async () => {
  sessionStorage.setItem("kubernaut-console-messages", JSON.stringify([{ id: "legacy", role: "user", text: "legacy", timestamp: 1 }]));
  sessionStorage.setItem("kubernaut-console-context", "legacy-context");
  sessionStorage.setItem("kubernaut-pending-context", JSON.stringify(["legacy pending"]));
  sessionStorage.setItem("kubernaut-console-phase", "complete");
  sessionStorage.setItem("kubernaut-console-workflow-resolved", JSON.stringify(["legacy-rr"]));
  const ids = [ID_A, ID_B, ID_C];
  const session = createPageChatSession(() => ids.shift());
  let now = 100_000;
  vi.spyOn(Date, "now").mockImplementation(() => now);
  const { result } = renderHook(() => useChatWithSession(session));
  expect(result.current.messages).toEqual([]);
  expect(result.current.currentPhase).toBeUndefined();
  act(() => { result.current.addPendingContext("local pending"); result.current.resetContext(); });
  await act(async () => { await result.current.sendMessage("explicit follow-up"); });
  expect(buildStreamRequest).toHaveBeenCalledWith("local pending\n\nexplicit follow-up", ID_B);
  now += 1_000;
  await act(async () => { await result.current.sendMessage("second follow-up"); });
  expect(buildStreamRequest).toHaveBeenLastCalledWith("second follow-up", ID_B);
  act(() => { expect(result.current.clearHistory()).toBe(true); });
  expect(result.current.messages).toEqual([]);
  expect(session.storage.getItem("kubernaut-console-context")).toBe(ID_C);
  expect(sessionStorage.getItem("kubernaut-console-context")).toBe("legacy-context");
  expect(sessionStorage.getItem("kubernaut-pending-context")).toBe(JSON.stringify(["legacy pending"]));
  expect(sessionStorage.getItem("kubernaut-console-messages")).toContain("legacy");
  expect(sessionStorage.getItem("kubernaut-console-phase")).toBe("complete");
  expect(sessionStorage.getItem("kubernaut-console-workflow-resolved")).toBe(JSON.stringify(["legacy-rr"]));
});

it("UT-CONSOLE-170-008: missing and failed reset contexts block sends and ignore old stream contexts", async () => {
  const ids = ["", ID_A, "", "", ID_B];
  const session = createPageChatSession(() => ids.shift());
  let stream: Parameters<typeof streamA2A>[1] | undefined;
  vi.mocked(streamA2A).mockImplementation((_request, options) => { stream = options; return new Promise(() => {}); });
  const { result } = renderHook(() => useChatWithSession(session));
  expect(result.current.canSendMessage()).toBe(false);
  expect(result.current.error).toMatch(/context/i);
  await act(async () => { await result.current.sendMessage("must not send"); });
  expect(streamA2A).not.toHaveBeenCalled();
  act(() => { expect(result.current.clearHistory()).toBe(true); });
  await act(async () => { void result.current.sendMessage("explicit send"); });
  expect(streamA2A).toHaveBeenCalledOnce();
  act(() => { result.current.resetContext(); });
  expect(result.current.canSendMessage()).toBe(false);
  act(() => stream!.onEvent({ kind: "status-update", taskId: "old", contextId: "late-old-context",
    status: { state: "working", message: { role: "agent", parts: [] } } }));
  await act(async () => { await result.current.sendMessage("still blocked"); });
  expect(streamA2A).toHaveBeenCalledOnce();
  act(() => { expect(result.current.clearHistory()).toBe(false); });
  expect(result.current.canSendMessage()).toBe(false);
  act(() => { expect(result.current.clearHistory()).toBe(true); });
  expect(result.current.canSendMessage()).toBe(true);
  expect(session.storage.getItem("kubernaut-console-context")).toBe(ID_B);
});

it("UT-CONSOLE-170-009: standalone keeps its bounded fallback when transcript storage is full", () => {
  const messages = Array.from({ length: 12 }, (_, index) => ({
    id: `legacy-${index}`, role: "agent", text: `message ${index}`, timestamp: index,
    isStreaming: true, thinking: [{ id: `thinking-${index}`, type: "status", text: "fixture" }],
  }));
  sessionStorage.setItem("kubernaut-console-messages", JSON.stringify(messages));
  const original = Storage.prototype.setItem;
  let messageWrites = 0;
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (this: Storage, key, value) {
    if (key === "kubernaut-console-messages" && messageWrites++ === 0) throw new DOMException("full", "QuotaExceededError");
    original.call(this, key, value);
  });
  renderHook(() => useChat());
  const saved = JSON.parse(sessionStorage.getItem("kubernaut-console-messages")!);
  expect(saved).toHaveLength(10);
  expect(saved[0].id).toBe("legacy-2");
  expect(saved.every((message: { isStreaming: boolean; thinking?: unknown }) => !message.isStreaming && !message.thinking)).toBe(true);
});

it("UT-CONSOLE-170-010: an invalid page session cannot fall back to browser storage", () => {
  const browserGet = vi.spyOn(Storage.prototype, "getItem");
  const valid = createPageChatSession(() => ID_A);
  const invalid = [
    null,
    { ...valid, storage: undefined },
    { ...valid, storage: { ...valid.storage, getItem: undefined } },
    { ...valid, storage: { ...valid.storage, setItem: undefined } },
    { ...valid, storage: { ...valid.storage, removeItem: undefined } },
    { ...valid, rotateContext: undefined },
    { ...valid, clearConversation: undefined },
  ];
  for (const value of invalid) {
    expect(() => renderHook(() => useChatWithSession(value as unknown as PageChatSession))).toThrow("Invalid page chat session");
  }
  expect(browserGet).not.toHaveBeenCalled();
});
