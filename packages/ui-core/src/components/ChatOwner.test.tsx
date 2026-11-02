import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ChatOwnerProvider, ChatPresenter } from "./ChatContainer";
import { streamA2A } from "../lib/a2a-client";
import { subscribeRRStatus } from "../lib/a2a-status-client";
import { callMcpTool } from "../lib/mcp-client";

vi.mock("../lib/a2a-client", () => ({
  buildStreamRequest: vi.fn((text: string) => ({ text })),
  streamA2A: vi.fn(),
}));
vi.mock("../lib/a2a-status-client", () => ({ subscribeRRStatus: vi.fn() }));
vi.mock("../lib/mcp-client", async (importOriginal) => ({
  ...await importOriginal<typeof import("../lib/mcp-client")>(),
  callMcpTool: vi.fn(),
}));

beforeEach(() => {
  sessionStorage.clear();
  vi.mocked(streamA2A).mockReset();
  vi.mocked(subscribeRRStatus).mockReset();
  vi.mocked(callMcpTool).mockReset();
  Element.prototype.scrollTo = vi.fn();
});

it("keeps the existing chat and status owners alive when the presenter is hidden", async () => {
  let stream: Parameters<typeof streamA2A>[1] | undefined;
  let status: Parameters<typeof subscribeRRStatus>[1] | undefined;
  vi.mocked(streamA2A).mockImplementation((_request, options) => {
    stream = options;
    return new Promise(() => {});
  });
  vi.mocked(subscribeRRStatus).mockImplementation((_rr, options) => {
    status = options;
    return new Promise(() => {});
  });
  const { rerender, unmount } = render(<ChatOwnerProvider><ChatPresenter /></ChatOwnerProvider>);
  const input = screen.getByRole("textbox", { name: /type your message/i });
  fireEvent.change(input, { target: { value: "Investigate the fixture" } });
  fireEvent.keyDown(input, { key: "Enter", code: "Enter" });
  await waitFor(() => expect(stream).toBeDefined());
  act(() => stream?.onEvent?.({ kind: "status-update", taskId: "synthetic-task", contextId: "synthetic-context", status: { state: "working", message: { role: "agent", parts: [{ kind: "text", text: "First update" }] } }, metadata: { rr_id: "fixture/rr-1", phase: "Investigating" } }));
  await waitFor(() => expect(status).toBeDefined());
  fireEvent.change(screen.getByRole("textbox", { name: /type your message/i }), { target: { value: "unsent draft" } });
  rerender(<ChatOwnerProvider>{null}</ChatOwnerProvider>);
  expect(stream?.signal?.aborted).toBe(false);
  expect(status?.signal?.aborted).toBe(false);
  act(() => stream?.onEvent?.({ kind: "artifact-update", taskId: "synthetic-task", contextId: "synthetic-context", lastChunk: false, artifact: { artifactId: "fixture-artifact", parts: [{ kind: "text", text: "Hidden update" }] } }));
  act(() => status?.onPhaseChange("Executing", {}));
  rerender(<ChatOwnerProvider><ChatPresenter /></ChatOwnerProvider>);
  expect(screen.getByText(/Hidden update/)).toBeInTheDocument();
  expect(screen.getByTestId("phase-indicator")).toHaveTextContent("Executing");
  expect(screen.getByRole("textbox", { name: /type your message/i })).toHaveValue("unsent draft");
  expect(streamA2A).toHaveBeenCalledTimes(1);
  expect(subscribeRRStatus).toHaveBeenCalledTimes(1);
  expect(callMcpTool).not.toHaveBeenCalled();
  unmount();
  expect(stream?.signal?.aborted).toBe(true);
  expect(status?.signal?.aborted).toBe(true);
});
