import { createPageChatSession } from "./page-chat-session";
import { CONSOLE_CONTEXT_KEY } from "./session-state";

const ID_A = "11111111-1111-4111-8111-111111111111";
const ID_B = "22222222-2222-4222-8222-222222222222";
const ID_C = "33333333-3333-4333-8333-333333333333";

afterEach(() => { vi.restoreAllMocks(); });

describe("page-lifetime chat session", () => {
  it("UT-CONSOLE-170-001: gives each owner an isolated conversation without reading browser storage", () => {
    const get = vi.spyOn(Storage.prototype, "getItem");
    const set = vi.spyOn(Storage.prototype, "setItem");
    const a = createPageChatSession(() => ID_A);
    const b = createPageChatSession(() => ID_B);

    a.storage.setItem("messages", "conversation A");
    a.storage.setItem("workflow", "resolved A");
    b.storage.setItem("pending", "context B");
    expect(a.storage.getItem(CONSOLE_CONTEXT_KEY)).toBe(ID_A);
    expect(b.storage.getItem(CONSOLE_CONTEXT_KEY)).toBe(ID_B);
    expect(b.storage.getItem("messages")).toBeNull();
    expect(b.storage.getItem("workflow")).toBeNull();
    expect(a.storage.getItem("pending")).toBeNull();
    expect(get).not.toHaveBeenCalled();
    expect(set).not.toHaveBeenCalled();
  });

  it("UT-CONSOLE-170-002: consumes pending state and clears only the selected owner's conversation", () => {
    const ids = [ID_A, ID_B];
    const a = createPageChatSession(() => ids.shift());
    const b = createPageChatSession(() => ID_C);
    a.storage.setItem("pending", "deferred A");
    a.storage.setItem("workflow", "resolved A");
    b.storage.setItem("workflow", "resolved B");
    a.storage.removeItem("pending");
    expect(a.storage.getItem("pending")).toBeNull();

    expect(a.clearConversation()).toBe(ID_B);
    expect(a.storage.getItem("workflow")).toBeNull();
    expect(a.storage.getItem(CONSOLE_CONTEXT_KEY)).toBe(ID_B);
    expect(b.storage.getItem("workflow")).toBe("resolved B");
    expect(b.storage.getItem(CONSOLE_CONTEXT_KEY)).toBe(ID_C);
  });

  it("UT-CONSOLE-170-003: rejects malformed, repeated and unavailable contexts without a browser fallback", () => {
    const ids: Array<string | undefined> = [ID_A, ID_A, "", undefined, ID_B, ID_A];
    const session = createPageChatSession(() => ids.shift());
    expect(session.rotateContext()).toBeUndefined();
    expect(session.storage.getItem(CONSOLE_CONTEXT_KEY)).toBeNull();
    expect(session.rotateContext()).toBeUndefined();
    expect(session.rotateContext()).toBeUndefined();
    expect(session.rotateContext()).toBe(ID_B);
    expect(session.storage.getItem(CONSOLE_CONTEXT_KEY)).toBe(ID_B);
    expect(session.rotateContext()).toBeUndefined();
    expect(session.storage.getItem(CONSOLE_CONTEXT_KEY)).toBeNull();

    const denied = createPageChatSession(() => { throw new Error("randomness unavailable"); });
    expect(denied.storage.getItem(CONSOLE_CONTEXT_KEY)).toBeNull();
    expect(denied.clearConversation()).toBeUndefined();
    const nonString = createPageChatSession(() => ({ toString: () => ID_A }) as unknown as string);
    expect(nonString.storage.getItem(CONSOLE_CONTEXT_KEY)).toBeNull();
  });

  it("UT-CONSOLE-170-004: obtains a fresh context from the browser's secure UUID generator", () => {
    const uuid = vi.spyOn(crypto, "randomUUID").mockReturnValue(ID_A);
    const session = createPageChatSession();
    expect(session.storage.getItem(CONSOLE_CONTEXT_KEY)).toBe(ID_A);
    expect(uuid).toHaveBeenCalledOnce();
  });
});
