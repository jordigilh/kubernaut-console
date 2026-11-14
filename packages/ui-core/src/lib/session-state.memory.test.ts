import { createPageChatSession } from "./page-chat-session";
import { clearSessionState, isWorkflowResolved, loadPersistedPhase, markWorkflowResolved, savePersistedPhase, type ChatStorage } from "./session-state";

const ID = "11111111-1111-4111-8111-111111111111";

beforeEach(() => { sessionStorage.clear(); });
afterEach(() => { vi.restoreAllMocks(); });

it("UT-CONSOLE-170-005: phase and workflow decisions stay with their owner", () => {
  sessionStorage.setItem("kubernaut-console-phase", "complete");
  sessionStorage.setItem("kubernaut-console-workflow-resolved", JSON.stringify(["legacy-rr"]));
  const a = createPageChatSession(() => ID);
  const b = createPageChatSession(() => ID);
  expect(loadPersistedPhase(a.storage)).toBeUndefined();
  expect(isWorkflowResolved("legacy-rr", a.storage)).toBe(false);
  savePersistedPhase("decision", a.storage);
  markWorkflowResolved("rr-a", a.storage);
  expect(loadPersistedPhase(a.storage)).toBe("decision");
  expect(isWorkflowResolved("rr-a", a.storage)).toBe(true);
  expect(isWorkflowResolved("rr-a", b.storage)).toBe(false);
  expect(isWorkflowResolved(undefined, a.storage)).toBe(false);

  savePersistedPhase(undefined, a.storage);
  expect(loadPersistedPhase(a.storage)).toBeUndefined();
  clearSessionState(a.storage);
  expect(isWorkflowResolved("rr-a", a.storage)).toBe(false);
  expect(sessionStorage.getItem("kubernaut-console-phase")).toBe("complete");
  expect(isWorkflowResolved("legacy-rr")).toBe(true);
});

it("UT-CONSOLE-170-006: denied or malformed owner storage never falls back to legacy state", () => {
  const browserGet = vi.spyOn(Storage.prototype, "getItem");
  const browserSet = vi.spyOn(Storage.prototype, "setItem");
  const browserRemove = vi.spyOn(Storage.prototype, "removeItem");
  const denied: ChatStorage = {
    getItem: () => { throw new Error("denied"); },
    setItem: () => { throw new Error("denied"); },
    removeItem: () => { throw new Error("denied"); },
  };
  expect(loadPersistedPhase(denied)).toBeUndefined();
  expect(isWorkflowResolved("legacy-rr", denied)).toBe(false);
  expect(() => savePersistedPhase("decision", denied)).not.toThrow();
  expect(() => savePersistedPhase(undefined, denied)).not.toThrow();
  expect(() => markWorkflowResolved("rr-a", denied)).not.toThrow();
  expect(() => clearSessionState(denied)).not.toThrow();
  const malformed: ChatStorage = { ...denied, getItem: () => "not JSON" };
  expect(isWorkflowResolved("legacy-rr", malformed)).toBe(false);
  expect(browserGet).not.toHaveBeenCalled();
  expect(browserSet).not.toHaveBeenCalled();
  expect(browserRemove).not.toHaveBeenCalled();
});
