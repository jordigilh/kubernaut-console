import { parseMcpResponse } from "./mcp-wire";

it("UT-CONSOLE-170-MCP-044: legacy decoding reports malformed JSON instead of fabricating a result", () => {
  expect(parseMcpResponse("not-json")).toEqual({
    error: { code: -1, message: "MCP response: not-json" },
  });
});

it("UT-CONSOLE-170-MCP-045: empty SSE data does not become an implicit success", () => {
  const result = parseMcpResponse("data:\n\n");
  expect(result.error?.code).toBe(-1);
  expect(result.result).toBeUndefined();
});
