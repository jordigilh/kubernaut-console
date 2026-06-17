import { consoleFetch } from "@openshift-console/dynamic-plugin-sdk";

/**
 * Override timeout for streaming requests (SSE).
 * Default consoleFetch timeout is 60s — too short for chat sessions.
 * Set to 10 minutes to allow long-running conversations.
 */
const STREAMING_TIMEOUT_MS = 600_000;

/**
 * A fetch wrapper that uses consoleFetch for proper OCP authentication
 * headers, with an extended timeout for SSE streaming connections.
 *
 * This is passed to ui-core's A2A/MCP clients via the config context,
 * replacing the default browser fetch.
 */
export async function consoleStreamingFetch(
  url: string,
  init?: RequestInit,
): Promise<Response> {
  return consoleFetch(url, init, STREAMING_TIMEOUT_MS);
}
