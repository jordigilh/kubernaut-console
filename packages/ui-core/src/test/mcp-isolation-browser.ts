import { createScopedMcpClient } from "../lib/scoped-mcp-client";

type RequestRecord = { url: string; method: string; session: string | undefined; aborted: boolean };

declare global {
  interface Window {
    mcpIsolationFixture: {
      run: () => Promise<{ oldError: string | undefined; newValue: unknown; requests: RequestRecord[] }>;
      runRedirect: () => Promise<{ error?: { code: number; message: string } }>;
      runProxy: () => Promise<{ result: unknown; error: string | undefined; tokenCalls: number; requests: Array<{ method: string; credentials?: RequestCredentials; authorization?: string }> }>;
    };
  }
}

window.mcpIsolationFixture = {
  async runProxy() {
    let tokenCalls = 0;
    const requests: Array<{ method: string; credentials?: RequestCredentials; authorization?: string }> = [];
    const fetchFn = (input: RequestInfo | URL, init?: RequestInit) => {
      requests.push({ method: JSON.parse(String(init?.body)).method, credentials: init?.credentials, authorization: (init?.headers as Record<string, string>).Authorization });
      return globalThis.fetch(input, init);
    };
    const client = createScopedMcpClient({ authMode: "proxy", getToken: async () => { tokenCalls++; return ""; }, fetchFn });
    const result = await client.call("explicit_synthetic_action", {});
    return { result: result.result, error: result.error?.message, tokenCalls, requests };
  },
  runRedirect() {
    return createScopedMcpClient({ authMode: "proxy", baseUrl: location.origin }).call("explicit_synthetic_action", {});
  },
  async run() {
    let releaseOld!: (response: Response) => void;
    let signalOldStarted!: () => void;
    const oldInitialization = new Promise<Response>((resolve) => { releaseOld = resolve; });
    const oldStarted = new Promise<void>((resolve) => { signalOldStarted = resolve; });
    const requests: RequestRecord[] = [];
    const signals: AbortSignal[] = [];
    const response = (session?: string, id = 1) => new Response(JSON.stringify({ jsonrpc: "2.0", id, result: { owner: "successor" } }), {
      status: 200, headers: session ? { "mcp-session-id": session } : {},
    });
    const fetchFn = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const body = JSON.parse(String(init?.body));
      const headers = init?.headers as Record<string, string>;
      const signal = init?.signal as AbortSignal;
      requests.push({ url, method: body.method, session: headers["Mcp-Session-Id"], aborted: false });
      signals.push(signal);
      if (url.startsWith("https://old.invalid") && body.method === "initialize") { signalOldStarted(); return oldInitialization; }
      return response(body.method === "initialize" ? "new-session" : undefined, body.id);
    };
    // The RED baseline uses global fetch; every request still stays synthetic.
    const originalFetch = globalThis.fetch;
    globalThis.fetch = fetchFn;
    try {
      const old = createScopedMcpClient({ authMode: "bearer", baseUrl: "https://old.invalid", getToken: async () => "synthetic-token", fetchFn });
      const successor = createScopedMcpClient({ authMode: "bearer", baseUrl: "https://new.invalid", getToken: async () => "synthetic-token", fetchFn });
      const oldCall = old.call("explicit_old_action", {});
      await oldStarted;
      old.invalidate();
      const newCall = successor.call("explicit_successor_read", {});
      releaseOld(response("old-session"));
      const [oldResult, newResult] = await Promise.all([oldCall, newCall]);
      for (let i = 0; i < requests.length; i++) requests[i].aborted = signals[i].aborted;
      return { oldError: oldResult.error?.message, newValue: newResult.result, requests };
    } finally {
      globalThis.fetch = originalFetch;
    }
  },
};
