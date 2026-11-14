import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import * as Chat from "./ChatContainer";
import { buildStreamRequest, streamA2A } from "../lib/a2a-client";
import { subscribeRRStatus } from "../lib/a2a-status-client";
import { callMcpTool } from "../lib/mcp-client";

vi.mock("../lib/a2a-client", async (importOriginal) => ({
  ...await importOriginal<typeof import("../lib/a2a-client")>(),
  buildStreamRequest: vi.fn((text: string, contextId?: string) => ({
    jsonrpc: "2.0" as const, id: "test", method: "message/stream", params: { message: { text, contextId } },
  })),
  streamA2A: vi.fn(),
}));
vi.mock("../lib/a2a-status-client", () => ({ subscribeRRStatus: vi.fn() }));
vi.mock("../lib/mcp-client", async (importOriginal) => ({
  ...await importOriginal<typeof import("../lib/mcp-client")>(),
  callMcpTool: vi.fn(),
}));

const MemoryOwner = Chat.PageLifetimeChatOwnerProvider;
const ID_A = "11111111-1111-4111-8111-111111111111";
const ID_B = "22222222-2222-4222-8222-222222222222";
const LEGACY: Record<string, string> = {
  "kubernaut-console-messages": JSON.stringify([{ id: "legacy", role: "user", text: "Legacy synthetic content", timestamp: 1 }]),
  "kubernaut-console-context": "legacy-context",
  "kubernaut-pending-context": JSON.stringify(["legacy pending"]),
  "kubernaut-console-phase": "complete",
  "kubernaut-console-workflow-resolved": JSON.stringify(["fixture/rr-1"]),
};

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
  vi.mocked(buildStreamRequest).mockClear();
  vi.mocked(streamA2A).mockReset().mockImplementation(() => new Promise(() => {}));
  vi.mocked(subscribeRRStatus).mockReset().mockImplementation(() => new Promise(() => {}));
  vi.mocked(callMcpTool).mockReset();
  Element.prototype.scrollTo = vi.fn();
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

function submit(input: HTMLElement, text: string) {
  fireEvent.change(input, { target: { value: text } });
  fireEvent.keyDown(input, { key: "Enter", code: "Enter" });
}

it("IT-CONSOLE-170-001: never adopts or changes legacy chat and preference data", async () => {
  for (const [key, value] of Object.entries(LEGACY)) sessionStorage.setItem(key, value);
  localStorage.setItem("kubernaut-console-show-raw-thinking", "true");
  render(<MemoryOwner><Chat.ChatPresenter /></MemoryOwner>);
  expect(screen.queryByText("Legacy synthetic content")).not.toBeInTheDocument();
  expect(streamA2A).not.toHaveBeenCalled();
  expect(subscribeRRStatus).not.toHaveBeenCalled();

  submit(screen.getByRole("textbox", { name: /type your message/i }), "Synthetic explicit send");
  await waitFor(() => expect(streamA2A).toHaveBeenCalledOnce());
  const [text, context] = vi.mocked(buildStreamRequest).mock.calls[0];
  expect(text).toBe("Synthetic explicit send");
  expect(context).toMatch(/^[0-9a-f-]{36}$/i);
  expect(context).not.toBe("legacy-context");
  fireEvent.click(screen.getByRole("button", { name: "New conversation" }));
  fireEvent.click(screen.getByRole("button", { name: "Clear history" }));
  expect(screen.queryByText("Synthetic explicit send")).not.toBeInTheDocument();
  for (const [key, value] of Object.entries(LEGACY)) expect(sessionStorage.getItem(key)).toBe(value);
  expect(localStorage.getItem("kubernaut-console-show-raw-thinking")).toBe("true");
});

it("IT-CONSOLE-170-002: keeps independent owners and drafts through presenter switches", async () => {
  const streams: Array<Parameters<typeof streamA2A>[1]> = [];
  let status: Parameters<typeof subscribeRRStatus>[1] | undefined;
  vi.mocked(streamA2A).mockImplementation((_request, options) => { streams.push(options); return new Promise(() => {}); });
  vi.mocked(subscribeRRStatus).mockImplementation((_rr, options) => { status = options; return new Promise(() => {}); });
  const view = (showA: boolean) => <>
    <section data-testid="owner-a"><MemoryOwner>{showA ? <Chat.ChatPresenter /> : null}</MemoryOwner></section>
    <section data-testid="owner-b"><MemoryOwner><Chat.ChatPresenter /></MemoryOwner></section>
  </>;
  const { rerender } = render(view(true));
  const a = within(screen.getByTestId("owner-a"));
  const b = within(screen.getByTestId("owner-b"));
  submit(a.getByRole("textbox", { name: /type your message/i }), "Investigate A");
  submit(b.getByRole("textbox", { name: /type your message/i }), "Investigate B");
  await waitFor(() => expect(streamA2A).toHaveBeenCalledTimes(2));
  const [requestA, requestB] = vi.mocked(buildStreamRequest).mock.calls;
  expect(requestA[1]).toBeTruthy();
  expect(requestA[1]).not.toBe(requestB[1]);
  act(() => streams[0].onEvent({ kind: "status-update", taskId: "task-a", contextId: ID_A,
    status: { state: "working", message: { role: "agent", parts: [] } }, metadata: { rr_id: "fixture/rr-a", phase: "Investigating" } }));
  await waitFor(() => expect(status).toBeDefined());
  fireEvent.change(a.getByRole("textbox", { name: /type your message/i }), { target: { value: "draft A" } });
  rerender(view(false));
  act(() => streams[0].onEvent({ kind: "artifact-update", taskId: "task-a", contextId: ID_A, lastChunk: false,
    artifact: { artifactId: "artifact-a", parts: [{ kind: "text", text: "Update while hidden" }] } }));
  act(() => status!.onPhaseChange("Executing", {}));
  rerender(view(true));
  expect(a.getByRole("textbox", { name: /type your message/i })).toHaveValue("draft A");
  expect(a.getByText("Update while hidden")).toBeInTheDocument();
  expect(a.getByTestId("phase-indicator")).toHaveTextContent("Executing");
  expect(a.queryByText("Investigate B")).not.toBeInTheDocument();
  expect(b.queryByText("Investigate A")).not.toBeInTheDocument();
  expect(streamA2A).toHaveBeenCalledTimes(2);
  expect(subscribeRRStatus).toHaveBeenCalledTimes(1);
  expect(callMcpTool).not.toHaveBeenCalled();
});

it("IT-CONSOLE-170-003: blocks an invalid initial context without losing the draft", () => {
  vi.spyOn(crypto, "randomUUID").mockReturnValue("" as ReturnType<Crypto["randomUUID"]>);
  render(<MemoryOwner><Chat.ChatPresenter /></MemoryOwner>);
  const input = screen.getByRole("textbox", { name: /type your message/i });
  expect(screen.getByRole("alert")).toHaveTextContent(/context/i);
  fireEvent.click(screen.getByRole("button", { name: /suggest: list active alerts/i }));
  expect(streamA2A).not.toHaveBeenCalled();
  submit(input, "Keep this draft");
  expect(input).toHaveValue("Keep this draft");
  expect(streamA2A).not.toHaveBeenCalled();
});

it("IT-CONSOLE-170-004: a failed New conversation reset retains the draft and requires an explicit retry", async () => {
  vi.spyOn(crypto, "randomUUID")
    .mockReturnValueOnce(ID_A)
    .mockReturnValueOnce("" as ReturnType<Crypto["randomUUID"]>)
    .mockReturnValueOnce(ID_B);
  render(<MemoryOwner><Chat.ChatPresenter /></MemoryOwner>);
  fireEvent.click(screen.getByRole("button", { name: "New conversation" }));
  expect(screen.getByRole("alert")).toHaveTextContent(/context/i);
  const input = screen.getByRole("textbox", { name: /type your message/i });
  submit(input, "Retain this draft");
  expect(input).toHaveValue("Retain this draft");
  expect(streamA2A).not.toHaveBeenCalled();

  fireEvent.click(screen.getByRole("button", { name: "New conversation" }));
  expect(input).toHaveValue("Retain this draft");
  expect(streamA2A).not.toHaveBeenCalled();
  fireEvent.keyDown(input, { key: "Enter", code: "Enter" });
  await waitFor(() => expect(streamA2A).toHaveBeenCalledOnce());
  expect(vi.mocked(buildStreamRequest).mock.calls[0][1]).toBe(ID_B);
});

it("IT-CONSOLE-170-005: works without accessing denied browser-storage getters", async () => {
  const sessionDescriptor = Object.getOwnPropertyDescriptor(window, "sessionStorage")!;
  const localDescriptor = Object.getOwnPropertyDescriptor(window, "localStorage")!;
  const sessionGetter = vi.fn(() => { throw new DOMException("denied", "SecurityError"); });
  const localGetter = vi.fn(() => { throw new DOMException("denied", "SecurityError"); });
  try {
    Object.defineProperty(window, "sessionStorage", { configurable: true, get: sessionGetter });
    Object.defineProperty(window, "localStorage", { configurable: true, get: localGetter });
    render(<MemoryOwner><Chat.ChatPresenter /></MemoryOwner>);
    submit(screen.getByRole("textbox", { name: /type your message/i }), "Storage is unavailable");
    await waitFor(() => expect(streamA2A).toHaveBeenCalledOnce());
    expect(sessionGetter).not.toHaveBeenCalled();
    expect(localGetter).not.toHaveBeenCalled();
  } finally {
    Object.defineProperty(window, "sessionStorage", sessionDescriptor);
    Object.defineProperty(window, "localStorage", localDescriptor);
  }
});

it("IT-CONSOLE-170-006: terminal status rotates the local context and consumes deferred context once", async () => {
  vi.spyOn(crypto, "randomUUID").mockReturnValueOnce(ID_A).mockReturnValueOnce(ID_B);
  let now = 100_000;
  vi.spyOn(Date, "now").mockImplementation(() => now);
  const streams: Array<Parameters<typeof streamA2A>[1]> = [];
  let status: Parameters<typeof subscribeRRStatus>[1] | undefined;
  vi.mocked(streamA2A).mockImplementation((_request, options) => { streams.push(options); return new Promise(() => {}); });
  vi.mocked(subscribeRRStatus).mockImplementation((_rr, options) => { status = options; return new Promise(() => {}); });
  for (const [key, value] of Object.entries(LEGACY)) sessionStorage.setItem(key, value);
  render(<MemoryOwner><Chat.ChatPresenter /></MemoryOwner>);
  const input = screen.getByRole("textbox", { name: /type your message/i });
  submit(input, "Investigate a fixture");
  await waitFor(() => expect(streams).toHaveLength(1));
  act(() => streams[0].onEvent({ kind: "status-update", taskId: "task", contextId: ID_A,
    status: { state: "working", message: { role: "agent", parts: [{ kind: "text", text: "Working" }] } },
    metadata: { rr_id: "fixture/rr-1", phase: "Investigating" } }));
  await waitFor(() => expect(status).toBeDefined());
  act(() => { status!.onPhaseChange("Completed", { target: "fixture-target" }); status!.onTerminal?.("Completed"); });
  await waitFor(() => expect(crypto.randomUUID).toHaveBeenCalledTimes(2));

  now += 1_000;
  submit(input, "First follow-up");
  await waitFor(() => expect(buildStreamRequest).toHaveBeenCalledTimes(2));
  const [followup, context] = vi.mocked(buildStreamRequest).mock.calls[1];
  expect(context).toBe(ID_B);
  expect(followup).toContain("rr_id: fixture/rr-1");
  expect(followup).not.toContain("legacy pending");
  now += 1_000;
  submit(input, "Second follow-up");
  await waitFor(() => expect(buildStreamRequest).toHaveBeenCalledTimes(3));
  expect(vi.mocked(buildStreamRequest).mock.calls[2][0]).toBe("Second follow-up");
  for (const [key, value] of Object.entries(LEGACY)) expect(sessionStorage.getItem(key)).toBe(value);
});

it("IT-CONSOLE-170-007: a delayed old workflow completion cannot mark a successor's state", async () => {
  sessionStorage.setItem("kubernaut-console-workflow-resolved", JSON.stringify(["fixture/rr-1"]));
  const streams: Array<Parameters<typeof streamA2A>[1]> = [];
  let finishAction: ((result: Awaited<ReturnType<typeof callMcpTool>>) => void) | undefined;
  vi.mocked(streamA2A).mockImplementation((_request, options) => { streams.push(options); return new Promise(() => {}); });
  vi.mocked(callMcpTool).mockImplementation(() => new Promise((resolve) => { finishAction = resolve; }));
  const view = (key: string) => <MemoryOwner key={key}><Chat.ChatPresenter /></MemoryOwner>;
  const { rerender } = render(view("a"));
  const decision = (index: number) => act(() => {
    streams[index].onEvent({
      kind: "artifact-update", taskId: "task", contextId: "fixture-context", lastChunk: true,
      artifact: { artifactId: "artifact", parts: [{ kind: "data", data: {
        session_id: "fixture-session", rr_id: "fixture/rr-1", signal_name: "FixtureAlert",
        rca: { severity: "high", confidence: 0.8, target: "fixture", causal_chain: ["fixture"] }, options: [],
      } }], metadata: { type: "investigation_summary" } },
    });
    streams[index].onComplete();
  });
  submit(screen.getByRole("textbox", { name: /type your message/i }), "Investigate A");
  await waitFor(() => expect(streams).toHaveLength(1));
  decision(0);
  const dismissA = await screen.findByRole("button", { name: /no action needed/i });
  expect(dismissA).toBeEnabled();
  fireEvent.click(dismissA);
  await waitFor(() => expect(finishAction).toBeDefined());

  rerender(view("b"));
  submit(screen.getByRole("textbox", { name: /type your message/i }), "Investigate B");
  await waitFor(() => expect(streams).toHaveLength(2));
  decision(1);
  const dismissB = await screen.findByRole("button", { name: /no action needed/i });
  expect(dismissB).toBeEnabled();
  await act(async () => { finishAction!({ result: {} }); });
  fireEvent.change(screen.getByRole("textbox", { name: /type your message/i }), { target: { value: "draft B" } });
  expect(dismissB).toBeEnabled();
  expect(callMcpTool).toHaveBeenCalledTimes(1);
  fireEvent.click(dismissB);
  await waitFor(() => expect(callMcpTool).toHaveBeenCalledTimes(2));
  await act(async () => { finishAction!({ result: {} }); });
  expect(dismissB).toBeDisabled();
  expect(sessionStorage.getItem("kubernaut-console-workflow-resolved")).toBe(JSON.stringify(["fixture/rr-1"]));
});

it("IT-CONSOLE-170-008: terminal reset failure stays closed even if an old event arrives", async () => {
  vi.spyOn(crypto, "randomUUID").mockReturnValueOnce(ID_A).mockReturnValueOnce("" as ReturnType<Crypto["randomUUID"]>);
  let stream: Parameters<typeof streamA2A>[1] | undefined;
  let status: Parameters<typeof subscribeRRStatus>[1] | undefined;
  vi.mocked(streamA2A).mockImplementation((_request, options) => { stream = options; return new Promise(() => {}); });
  vi.mocked(subscribeRRStatus).mockImplementation((_rr, options) => { status = options; return new Promise(() => {}); });
  render(<MemoryOwner><Chat.ChatPresenter /></MemoryOwner>);
  const input = screen.getByRole("textbox", { name: /type your message/i });
  submit(input, "Investigate");
  await waitFor(() => expect(stream).toBeDefined());
  act(() => stream!.onEvent({ kind: "status-update", taskId: "task", contextId: ID_A,
    status: { state: "working", message: { role: "agent", parts: [] } }, metadata: { rr_id: "fixture/rr-1", phase: "Investigating" } }));
  await waitFor(() => expect(status).toBeDefined());
  act(() => { status!.onPhaseChange("Completed", {}); status!.onTerminal?.("Completed"); });
  expect(await screen.findByRole("alert")).toHaveTextContent(/context/i);
  act(() => stream!.onEvent({ kind: "status-update", taskId: "old-task", contextId: "late-old-context",
    status: { state: "working", message: { role: "agent", parts: [] } } }));
  submit(input, "Keep this follow-up");
  expect(input).toHaveValue("Keep this follow-up");
  expect(streamA2A).toHaveBeenCalledTimes(1);
});

it("IT-CONSOLE-170-009: the page-only preference ignores and does not change the legacy preference", () => {
  vi.stubEnv("VITE_SHOW_RAW_THINKING_TOGGLE", "true");
  localStorage.setItem("kubernaut-console-show-raw-thinking", "true");
  const get = vi.spyOn(localStorage, "getItem");
  const set = vi.spyOn(localStorage, "setItem");
  render(<MemoryOwner><Chat.ChatPresenter /></MemoryOwner>);
  expect(get).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Show raw thinking" }));
  expect(screen.getByRole("button", { name: "Hide raw thinking" })).toBeInTheDocument();
  expect(set).not.toHaveBeenCalled();
  expect(localStorage.getItem("kubernaut-console-show-raw-thinking")).toBe("true");
});

it("IT-CONSOLE-170-010: confirming a failed reset after a conversation retains the unsent draft", async () => {
  vi.spyOn(crypto, "randomUUID").mockReturnValueOnce(ID_A).mockImplementationOnce(() => { throw new Error("denied"); });
  render(<MemoryOwner><Chat.ChatPresenter /></MemoryOwner>);
  const input = screen.getByRole("textbox", { name: /type your message/i });
  submit(input, "Investigate");
  await waitFor(() => expect(streamA2A).toHaveBeenCalledOnce());
  fireEvent.change(input, { target: { value: "retained draft" } });
  fireEvent.click(screen.getByRole("button", { name: "New conversation" }));
  fireEvent.click(screen.getByRole("button", { name: "Clear history" }));
  expect(screen.getByRole("alert")).toHaveTextContent(/context/i);
  fireEvent.keyDown(input, { key: "Enter", code: "Enter" });
  expect(input).toHaveValue("retained draft");
  expect(streamA2A).toHaveBeenCalledOnce();
});

it.each([
  { id: "011", action: "select" },
  { id: "012", action: "escalate" },
] as const)("IT-CONSOLE-170-$id: $action records workflow resolution only in the owner", async ({ action }) => {
  const legacy = JSON.stringify(["legacy-rr"]);
  sessionStorage.setItem("kubernaut-console-workflow-resolved", legacy);
  vi.mocked(callMcpTool).mockResolvedValue({ result: {} });
  let stream: Parameters<typeof streamA2A>[1] | undefined;
  vi.mocked(streamA2A).mockImplementation((_request, options) => { stream = options; return new Promise(() => {}); });
  const view = (show: boolean) => <MemoryOwner>{show ? <Chat.ChatPresenter /> : null}</MemoryOwner>;
  const { rerender } = render(view(true));
  submit(screen.getByRole("textbox", { name: /type your message/i }), "Investigate");
  await waitFor(() => expect(stream).toBeDefined());
  act(() => {
    stream!.onEvent({
      kind: "artifact-update", taskId: "task", contextId: "fixture", lastChunk: true,
      artifact: { artifactId: "artifact", parts: [{ kind: "data", data: {
        session_id: "fixture-session", rr_id: "fixture/rr-1", signal_name: "FixtureAlert",
        rca: { severity: "high", confidence: 0.8, target: "fixture", causal_chain: ["fixture"] },
        options: action === "select" ? [{ workflow_id: "wf-1", name: "Fixture workflow", description: "fixture", recommended: true }] : [],
      } }], metadata: { type: "investigation_summary" } },
    });
    stream!.onComplete();
  });
  if (action === "select") {
    fireEvent.click(await screen.findByRole("button", { name: "Execute Fixture workflow" }));
    fireEvent.click(screen.getByRole("button", { name: /execute now/i }));
    await waitFor(() => expect(callMcpTool).toHaveBeenCalledWith("kubernaut_select_workflow", { rr_id: "fixture/rr-1", workflow_id: "wf-1" }, expect.anything()));
  } else {
    fireEvent.click(await screen.findByRole("button", { name: "Escalate to team" }));
    const reason = screen.getByRole("textbox", { name: "Escalation reason" });
    fireEvent.change(reason, { target: { value: "Needs review" } });
    fireEvent.keyDown(reason, { key: "Enter", code: "Enter" });
    await waitFor(() => expect(callMcpTool).toHaveBeenCalledWith("kubernaut_complete_no_action", expect.objectContaining({ rr_id: "fixture/rr-1", escalation_reason: "Needs review" }), expect.anything()));
  }
  await waitFor(() => expect(screen.getByRole("button", { name: /no action needed/i })).toBeDisabled());
  rerender(view(false));
  rerender(view(true));
  expect(screen.getByRole("button", { name: /no action needed/i })).toBeDisabled();
  expect(sessionStorage.getItem("kubernaut-console-workflow-resolved")).toBe(legacy);
});
