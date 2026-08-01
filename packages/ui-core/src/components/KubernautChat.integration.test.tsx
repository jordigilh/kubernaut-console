/**
 * KubernautChat Integration Tests
 *
 * These tests exercise the full provider wiring: KubernautChat -> AuthContext/
 * ConfigContext -> ChatContainer -> useChat/useRRStatus -> streamA2A/subscribeRRStatus.
 *
 * They prove wiring completeness per the Pyramid Invariant (IT proves wiring).
 *
 * Gap this closes: KubernautChat.test.tsx mocks ChatContainer entirely
 * (UT-only — proves context values reach a stand-in, not the real hooks),
 * and ChatContainer.integration.test.tsx renders ChatContainer without any
 * provider context at all (auth token / custom backendUrl / fetchFn are
 * never exercised there). Nothing previously proved that a real
 * authProvider-issued token and config.backendUrl/fetchFn actually reach
 * the outbound streamA2A/subscribeRRStatus calls end-to-end.
 */
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { KubernautChat } from "./KubernautChat";
import type { KubernautAuthProvider, KubernautUser } from "../providers/auth";
import type { KubernautConfig } from "../providers/config";
import { streamA2A } from "../lib/a2a-client";
import { subscribeRRStatus } from "../lib/a2a-status-client";
import { _resetSession } from "../lib/mcp-client";

vi.mock("../lib/a2a-client", () => ({
  buildStreamRequest: vi.fn((_text: string) => ({
    task: { message: { role: "user", parts: [{ kind: "text", text: _text }] } },
  })),
  streamA2A: vi.fn(),
}));

vi.mock("../lib/a2a-status-client", () => ({
  subscribeRRStatus: vi.fn(async () => {}),
}));

const mockStreamA2A = vi.mocked(streamA2A);
const mockSubscribeStatus = vi.mocked(subscribeRRStatus);

beforeAll(() => {
  Element.prototype.scrollTo = vi.fn();
});

function makeAuthProvider(token: string): KubernautAuthProvider {
  return {
    getToken: vi.fn().mockResolvedValue(token),
    getUser: vi.fn().mockResolvedValue({
      name: "Jane Doe",
      email: "jane@example.com",
      initials: "JD",
    } satisfies KubernautUser),
  };
}

describe("KubernautChat Integration", () => {
  beforeEach(() => {
    sessionStorage.clear();
    _resetSession();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mockStreamA2A.mockReset();
    mockSubscribeStatus.mockReset();
    mockSubscribeStatus.mockImplementation(async () => {});
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  /**
   * IT-CONSOLE-PROVIDER-001
   * FedRAMP Controls: AC-3 (Access Enforcement), IA-2 (Identification & Authentication)
   *
   * A missing/incorrect auth token or backendUrl on the real outbound call
   * would silently authenticate against the wrong backend or with no
   * credentials at all — a security-relevant wiring point that only an
   * end-to-end provider-to-transport test can catch.
   */
  it("IT-CONSOLE-PROVIDER-001 [AC-3, IA-2]: streamA2A receives the resolved auth token and config backendUrl/fetchFn from KubernautChat props", async () => {
    const customFetch = vi.fn();
    const authProvider = makeAuthProvider("mock-bearer-token-xyz");
    const config: KubernautConfig = { backendUrl: "https://kubernaut.example.com", fetchFn: customFetch };

    mockStreamA2A.mockImplementation(async (_req, opts) => {
      opts.onComplete?.();
    });

    render(<KubernautChat authProvider={authProvider} config={config} />);

    const input = await screen.findByRole("textbox", { name: /type your message/i });
    await act(async () => {
      fireEvent.change(input, { target: { value: "Investigate this alert" } });
      fireEvent.keyDown(input, { key: "Enter", code: "Enter" });
      vi.advanceTimersByTime(100);
    });

    await waitFor(() => {
      expect(mockStreamA2A).toHaveBeenCalled();
    });

    const [, streamOpts] = mockStreamA2A.mock.calls[0];
    expect(streamOpts.baseUrl).toBe("https://kubernaut.example.com");
    expect(streamOpts.fetchFn).toBe(customFetch);
    expect(streamOpts.token).toBe("mock-bearer-token-xyz");
  });

  /**
   * IT-CONSOLE-PROVIDER-002
   * FedRAMP Controls: AC-3 (Access Enforcement), IA-2 (Identification & Authentication)
   *
   * Same class of gap as IT-CONSOLE-PROVIDER-001, but for the parallel
   * status-stream subscription path (useRRStatus -> subscribeRRStatus),
   * which threads its own independently-resolved token/baseUrl/fetchFn.
   */
  it("IT-CONSOLE-PROVIDER-002 [AC-3, IA-2]: subscribeRRStatus receives the resolved auth token and config backendUrl/fetchFn once an rr_id is known", async () => {
    const customFetch = vi.fn();
    const authProvider = makeAuthProvider("mock-bearer-token-status");
    const config: KubernautConfig = { backendUrl: "https://kubernaut.example.com", fetchFn: customFetch };

    mockStreamA2A.mockImplementation(async (_req, opts) => {
      opts.onEvent({
        kind: "artifact-update",
        taskId: "t1",
        contextId: "ctx-provider-2",
        artifact: {
          artifactId: "inv-1",
          parts: [{
            kind: "data",
            data: { type: "investigation_summary", schema_version: "1.0", rr_id: "rr-provider-002", summary: "test" },
            mediaType: "application/json",
          }],
          metadata: { type: "investigation_summary" },
        },
        lastChunk: true,
        append: false,
      });
      opts.onComplete?.();
    });

    render(<KubernautChat authProvider={authProvider} config={config} />);

    const input = await screen.findByRole("textbox", { name: /type your message/i });
    await act(async () => {
      fireEvent.change(input, { target: { value: "Investigate this alert" } });
      fireEvent.keyDown(input, { key: "Enter", code: "Enter" });
      vi.advanceTimersByTime(100);
    });

    await waitFor(() => {
      expect(mockSubscribeStatus).toHaveBeenCalled();
    });

    const [rrId, statusOpts] = mockSubscribeStatus.mock.calls[0];
    expect(rrId).toBe("rr-provider-002");
    expect(statusOpts.baseUrl).toBe("https://kubernaut.example.com");
    expect(statusOpts.fetchFn).toBe(customFetch);
    expect(statusOpts.token).toBe("mock-bearer-token-status");
  });
});
