export interface AccessCheckOptions {
  baseUrl?: string;
  getToken?: () => Promise<string>;
}

export type AccessCheckResult = "allowed" | "denied" | "error";

// console#48 / kubernaut#1919 / kubernaut#1942: AF's coarse-grained
// pre-flight authorization gate. GET /a2a/access returns a bare 200 when the
// caller's SAR against the synthetic kubernaut.ai/console (verb=use)
// resource is allowed, or an RFC 7807 problem+json 403 when it isn't. This
// is advisory/UX-only -- it does not replace per-tool SAR checks enforced
// server-side on every /mcp and /a2a/invoke call, so a client that skips
// this check gains no additional access.
//
// Follows the same McpClientOptions shape (baseUrl + getToken) as
// mcp-client.ts for consistency, and fails closed: any outcome other than a
// clean 200 (401, 5xx, network failure, timeout) is treated as "error" so
// the caller can avoid rendering the chat UI rather than assume access.
export async function checkConsoleAccess(options?: AccessCheckOptions): Promise<AccessCheckResult> {
  const url = `${options?.baseUrl || ""}/a2a/access`;
  const headers: Record<string, string> = {};
  if (options?.getToken) {
    try {
      headers["Authorization"] = `Bearer ${await options.getToken()}`;
    } catch {
      // fall through without auth; server will reject with 401 -> "error" below
    }
  }

  let response: Response;
  try {
    response = await fetch(url, { method: "GET", headers, signal: AbortSignal.timeout(10_000) });
  } catch {
    return "error";
  }

  if (response.ok) return "allowed";
  if (response.status === 403) return "denied";
  return "error";
}
