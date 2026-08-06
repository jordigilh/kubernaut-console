import { describe, it, expect, beforeEach, vi } from "vitest";
import { getShowRawThinking, setShowRawThinking } from "./preferences";

describe("preferences", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("UT-CONSOLE-PREFS-001 [console#53]: defaults to showing raw thinking when nothing is persisted", () => {
    expect(getShowRawThinking()).toBe(true);
  });

  it("UT-CONSOLE-PREFS-002 [console#53]: persists an explicit opt-out across reads", () => {
    setShowRawThinking(false);
    expect(getShowRawThinking()).toBe(false);
  });

  it("UT-CONSOLE-PREFS-003 [console#53]: persists an explicit opt-in after a prior opt-out", () => {
    setShowRawThinking(false);
    setShowRawThinking(true);
    expect(getShowRawThinking()).toBe(true);
  });

  it("UT-CONSOLE-PREFS-004: fails closed to the default when localStorage throws", () => {
    const spy = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("storage unavailable");
    });
    expect(getShowRawThinking()).toBe(true);
    spy.mockRestore();
  });

  it("UT-CONSOLE-PREFS-005: setShowRawThinking swallows storage errors instead of throwing", () => {
    const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("storage unavailable");
    });
    expect(() => setShowRawThinking(false)).not.toThrow();
    spy.mockRestore();
  });
});
