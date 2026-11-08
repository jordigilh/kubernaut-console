import { describe, expect, it, vi } from "vitest";
import {
  CONSOLE_CONTRACT_PATH,
  isValidBackendIncarnation,
  readBackendIncarnation,
} from "./backend-contract";

describe("backend incarnation contract", () => {
  it("UT-CONSOLE-168-020: reads the opaque incarnation without sending browser credentials", async () => {
    const fetchFn = vi.fn().mockResolvedValue(new Response(JSON.stringify({ backend_incarnation: "process-2026-11-06" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }));

    await expect(readBackendIncarnation({ baseUrl: "", fetchFn })).resolves.toBe("process-2026-11-06");
    expect(fetchFn).toHaveBeenCalledWith(CONSOLE_CONTRACT_PATH, expect.objectContaining({
      method: "GET",
      credentials: "same-origin",
      cache: "no-store",
    }));
    expect(fetchFn.mock.calls[0][1]?.headers).toEqual({ Accept: "application/json" });
  });

  it.each([
    ["", false],
    ["contains spaces", false],
    ["/path", false],
    ["valid.process~1", true],
  ])("UT-CONSOLE-168-021: validates incarnation %s", (value, expected) => {
    expect(isValidBackendIncarnation(value)).toBe(expected);
  });

  it("UT-CONSOLE-168-022: rejects unavailable, malformed and invalid contract responses", async () => {
    await expect(readBackendIncarnation({
      fetchFn: vi.fn().mockResolvedValue(new Response(null, { status: 503 })),
    })).rejects.toThrow(/HTTP 503/);

    await expect(readBackendIncarnation({
      fetchFn: vi.fn().mockResolvedValue(new Response("not-json", { status: 200 })),
    })).rejects.toThrow(/invalid JSON/);

    await expect(readBackendIncarnation({
      fetchFn: vi.fn().mockResolvedValue(new Response(JSON.stringify({ backend_incarnation: "bad value" }), { status: 200 })),
    })).rejects.toThrow(/invalid incarnation/);
  });
});
