import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@openshift-console/dynamic-plugin-sdk", () => ({
  consoleFetch: vi.fn(),
}));

import { consoleFetch } from "@openshift-console/dynamic-plugin-sdk";
import { consoleStreamingFetch } from "./useConsoleFetch";

describe("consoleStreamingFetch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("delegates to consoleFetch with extended timeout", async () => {
    const mockResponse = new Response("ok");
    vi.mocked(consoleFetch).mockResolvedValue(mockResponse);

    const result = await consoleStreamingFetch("/test", { method: "POST" });

    expect(consoleFetch).toHaveBeenCalledWith(
      "/test",
      { method: "POST" },
      600_000,
    );
    expect(result).toBe(mockResponse);
  });

  it("propagates errors from consoleFetch", async () => {
    vi.mocked(consoleFetch).mockRejectedValue(new Error("timeout"));

    await expect(consoleStreamingFetch("/test")).rejects.toThrow("timeout");
  });
});
