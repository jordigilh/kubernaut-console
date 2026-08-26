import { describe, it, expect } from "vitest";
import { isRecord } from "./type-guards";

describe("isRecord", () => {
  it("UT-CONSOLE-TYPEGUARD-001: returns true for a plain object", () => {
    expect(isRecord({ a: 1 })).toBe(true);
  });

  it("UT-CONSOLE-TYPEGUARD-002: returns true for an array (typeof is object)", () => {
    expect(isRecord([1, 2, 3])).toBe(true);
  });

  it("UT-CONSOLE-TYPEGUARD-003: returns false for null", () => {
    expect(isRecord(null)).toBe(false);
  });

  it("UT-CONSOLE-TYPEGUARD-004: returns false for undefined", () => {
    expect(isRecord(undefined)).toBe(false);
  });

  it("UT-CONSOLE-TYPEGUARD-005: returns false for primitives", () => {
    expect(isRecord("string")).toBe(false);
    expect(isRecord(42)).toBe(false);
    expect(isRecord(true)).toBe(false);
  });
});
